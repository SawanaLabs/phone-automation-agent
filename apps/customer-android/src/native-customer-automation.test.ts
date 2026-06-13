import { describe, expect, it } from "vitest"

import {
  createNativeDeviceAuthorityGateway,
  createNativeHostedTaskRunner,
  createNativeRoutineActionExecutor,
  createNativeScreenStateCollector,
  requireCustomerAutomationNativeModule,
  type CustomerAutomationNativeModule,
} from "./native-customer-automation"
import { deriveDeviceAuthorityState } from "./device-authority"

const readyNativeModule: CustomerAutomationNativeModule = {
  async getAuthoritySnapshot() {
    return {
      accessibilityService: "enabled",
      screenCapture: "granted",
    }
  },
  async openAccessibilitySettings() {
    return {
      accessibilityService: "enabled",
      screenCapture: "granted",
    }
  },
  async requestScreenCapture() {
    return {
      accessibilityService: "enabled",
      screenCapture: "granted",
    }
  },
  async captureScreenState() {
    return {
      frameBase64: "ZmFrZS1mcmFtZQ==",
      frameMimeType: "image/png",
      width: 1080,
      height: 2400,
      currentPackage: "com.android.settings",
      accessibilitySummary: "Settings",
    }
  },
  async tap() {},
  async doubleTap() {},
  async longPress() {},
  async swipe() {},
  async back() {},
  async home() {},
  async launchApp() {},
  async typeText() {},
  async wait() {},
  async runHostedTask() {
    return {
      task: {
        id: "customer_task_1",
        instruction: "检查当前页面",
        status: "finished",
        summary: "Done",
      },
      events: [],
    }
  },
}

describe("customer automation native bridge", () => {
  it("fails fast when the native module is missing", () => {
    expect(() => requireCustomerAutomationNativeModule({})).toThrow(
      "CustomerAutomation native module is not installed."
    )
  })

  it("uses native authority snapshots for the Android setup gate", async () => {
    const gateway = createNativeDeviceAuthorityGateway(readyNativeModule)

    await expect(gateway.getSnapshot()).resolves.toEqual({
      accessibilityService: "enabled",
      screenCapture: "granted",
    })
  })

  it("captures native screen state for hosted decisions", async () => {
    const collector = createNativeScreenStateCollector(readyNativeModule)

    await expect(collector.capture()).resolves.toEqual({
      frameBase64: "ZmFrZS1mcmFtZQ==",
      frameMimeType: "image/png",
      width: 1080,
      height: 2400,
      currentPackage: "com.android.settings",
      accessibilitySummary: "Settings",
    })
  })

  it("runs hosted tasks through the native Android loop", async () => {
    const calls: string[] = []
    const nativeModule: CustomerAutomationNativeModule = {
      ...readyNativeModule,
      async runHostedTask(runtimeUrl, runtimeAccessToken, instruction, maxSteps) {
        calls.push(
          `${runtimeUrl}|${runtimeAccessToken}|${instruction}|${maxSteps}`
        )
        return {
          task: {
            id: "customer_task_1",
            instruction,
            status: "finished",
            summary: "Done",
          },
          events: [],
        }
      },
    }
    const runner = createNativeHostedTaskRunner(nativeModule)

    const session = await runner.startTask({
      authorityState: deriveDeviceAuthorityState({
        accessibilityService: "enabled",
        screenCapture: "granted",
      }),
      runtimeUrl: "http://localhost:8787",
      runtimeAccessToken: "alpha-token",
      instruction: " 检查当前页面 ",
    })

    expect(calls).toEqual([
      "http://localhost:8787|alpha-token|检查当前页面|50",
    ])
    expect(session.task.status).toBe("finished")
  })

  it("rejects native hosted tasks before Android permissions are granted", async () => {
    const runner = createNativeHostedTaskRunner(readyNativeModule)

    await expect(
      runner.startTask({
        authorityState: deriveDeviceAuthorityState({
          accessibilityService: "disabled",
          screenCapture: "missing",
        }),
        runtimeUrl: "http://localhost:8787",
        runtimeAccessToken: "alpha-token",
        instruction: "检查当前页面",
      })
    ).rejects.toThrow(
      "Android permissions are required before starting a task: accessibility_service, screen_capture."
    )
  })

  it("dispatches native routine actions with pixel coordinates", async () => {
    const calls: string[] = []
    const nativeModule: CustomerAutomationNativeModule = {
      ...readyNativeModule,
      async tap(x, y) {
        calls.push(`tap:${x},${y}`)
      },
      async doubleTap(x, y) {
        calls.push(`double-tap:${x},${y}`)
      },
      async longPress(x, y) {
        calls.push(`long-press:${x},${y}`)
      },
      async swipe(startX, startY, endX, endY) {
        calls.push(`swipe:${startX},${startY}->${endX},${endY}`)
      },
      async back() {
        calls.push("back")
      },
      async home() {
        calls.push("home")
      },
      async launchApp(app) {
        calls.push(`launch:${app}`)
      },
      async typeText(text) {
        calls.push(`type:${text}`)
      },
      async wait() {
        throw new Error("native wait must not be used")
      },
    }
    const executor = createNativeRoutineActionExecutor(nativeModule, {
      width: 1080,
      height: 2400,
    })

    await executor.tap({ x: 540, y: 600 })
    await executor.doubleTap({ x: 540, y: 600 })
    await executor.longPress({ x: 270, y: 1200 })
    await executor.swipe({ x: 540, y: 1920 }, { x: 540, y: 480 })
    await executor.back()
    await executor.home()
    await executor.launchApp("com.android.settings")
    await executor.typeText("coffee shop")
    await executor.wait(0)

    expect(calls).toEqual([
      "tap:540,600",
      "double-tap:540,600",
      "long-press:270,1200",
      "swipe:540,1920->540,480",
      "back",
      "home",
      "launch:com.android.settings",
      "type:coffee shop",
    ])
  })

  it("surfaces native text-entry failures", async () => {
    const nativeModule: CustomerAutomationNativeModule = {
      ...readyNativeModule,
      async typeText() {
        throw new Error("No focused input target is available for Type action.")
      },
    }
    const executor = createNativeRoutineActionExecutor(nativeModule, {
      width: 1080,
      height: 2400,
    })

    await expect(executor.typeText("coffee shop")).rejects.toThrow(
      "No focused input target is available for Type action."
    )
  })
})
