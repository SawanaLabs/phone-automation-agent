import { describe, expect, it } from "vitest"

import {
  createNativeDeviceAuthorityGateway,
  createNativeRoutineActionExecutor,
  requireCustomerAutomationNativeModule,
  type CustomerAutomationNativeModule,
} from "./native-customer-automation"

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
  async tap() {},
  async swipe() {},
  async back() {},
  async home() {},
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

  it("dispatches native routine actions with pixel coordinates", async () => {
    const calls: string[] = []
    const nativeModule: CustomerAutomationNativeModule = {
      ...readyNativeModule,
      async tap(x, y) {
        calls.push(`tap:${x},${y}`)
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
    }
    const executor = createNativeRoutineActionExecutor(nativeModule, {
      width: 1080,
      height: 2400,
    })

    await executor.tap({ x: 540, y: 600 })
    await executor.swipe({ x: 540, y: 1920 }, { x: 540, y: 480 })
    await executor.back()
    await executor.home()

    expect(calls).toEqual([
      "tap:540,600",
      "swipe:540,1920->540,480",
      "back",
      "home",
    ])
  })
})
