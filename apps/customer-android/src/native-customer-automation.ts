import type { DeviceAuthorityGateway } from "./device-authority-gateway"
import type { DeviceAuthoritySnapshot } from "./device-authority"
import type {
  CustomerScreenState,
  CustomerSessionSnapshot,
  StartCustomerTaskInput,
} from "./customer-session"
import type {
  PixelPoint,
  RoutineActionExecutor,
  ScreenSize,
  ScreenStateCollector,
} from "./routine-actions"

export type CustomerAutomationNativeModule = {
  getAuthoritySnapshot: () => Promise<DeviceAuthoritySnapshot>
  openAccessibilitySettings: () => Promise<DeviceAuthoritySnapshot>
  requestScreenCapture: () => Promise<DeviceAuthoritySnapshot>
  captureScreenState: () => Promise<CustomerScreenState>
  tap: (x: number, y: number) => Promise<void>
  doubleTap: (x: number, y: number) => Promise<void>
  longPress: (x: number, y: number) => Promise<void>
  swipe: (
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ) => Promise<void>
  back: () => Promise<void>
  home: () => Promise<void>
  launchApp: (app: string) => Promise<void>
  typeText: (text: string) => Promise<void>
  wait: (durationMs: number) => Promise<void>
  runHostedTask: (
    runtimeUrl: string,
    runtimeAccessToken: string,
    instruction: string,
    maxSteps: number
  ) => Promise<CustomerSessionSnapshot>
}

export type HostedTaskRunner = {
  startTask: (
    input: Pick<
      StartCustomerTaskInput,
      "authorityState" | "runtimeUrl" | "runtimeAccessToken" | "instruction"
    >
  ) => Promise<CustomerSessionSnapshot>
}

type NativeModuleRegistry = {
  CustomerAutomation?: CustomerAutomationNativeModule
}

export function requireCustomerAutomationNativeModule(
  modules: NativeModuleRegistry
): CustomerAutomationNativeModule {
  if (!modules.CustomerAutomation) {
    throw new Error("CustomerAutomation native module is not installed.")
  }

  return modules.CustomerAutomation
}

export function createNativeDeviceAuthorityGateway(
  nativeModule: CustomerAutomationNativeModule
): DeviceAuthorityGateway {
  return {
    getSnapshot: nativeModule.getAuthoritySnapshot,
    openAccessibilitySettings: nativeModule.openAccessibilitySettings,
    requestScreenCapture: nativeModule.requestScreenCapture,
  }
}

export function createNativeScreenStateCollector(
  nativeModule: CustomerAutomationNativeModule
): ScreenStateCollector {
  return {
    capture: nativeModule.captureScreenState,
  }
}

export function createNativeHostedTaskRunner(
  nativeModule: CustomerAutomationNativeModule
): HostedTaskRunner {
  return {
    async startTask({
      authorityState,
      runtimeUrl,
      runtimeAccessToken,
      instruction,
    }) {
      if (!authorityState.canStartTask) {
        throw new Error(
          `Android permissions are required before starting a task: ${authorityState.missing.join(", ")}.`
        )
      }

      const normalizedInstruction = instruction.trim()
      if (!normalizedInstruction) {
        throw new Error("Instruction is required.")
      }

      const normalizedRuntimeAccessToken = runtimeAccessToken.trim()
      if (!normalizedRuntimeAccessToken) {
        throw new Error("Runtime access token is required.")
      }

      return nativeModule.runHostedTask(
        runtimeUrl,
        normalizedRuntimeAccessToken,
        normalizedInstruction,
        50
      )
    },
  }
}

export function createNativeRoutineActionExecutor(
  nativeModule: CustomerAutomationNativeModule,
  screen: ScreenSize
): RoutineActionExecutor {
  return {
    screen,
    async tap(point) {
      const roundedPoint = roundPixelPoint(point)
      await nativeModule.tap(roundedPoint.x, roundedPoint.y)
    },
    async doubleTap(point) {
      const roundedPoint = roundPixelPoint(point)
      await nativeModule.doubleTap(roundedPoint.x, roundedPoint.y)
    },
    async longPress(point) {
      const roundedPoint = roundPixelPoint(point)
      await nativeModule.longPress(roundedPoint.x, roundedPoint.y)
    },
    async swipe(start, end) {
      const roundedStart = roundPixelPoint(start)
      const roundedEnd = roundPixelPoint(end)
      await nativeModule.swipe(
        roundedStart.x,
        roundedStart.y,
        roundedEnd.x,
        roundedEnd.y
      )
    },
    async back() {
      await nativeModule.back()
    },
    async home() {
      await nativeModule.home()
    },
    async launchApp(app) {
      await nativeModule.launchApp(app)
    },
    async typeText(text) {
      await nativeModule.typeText(text)
    },
    async wait(durationMs) {
      await delay(durationMs)
    },
  }
}

export function roundPixelPoint(point: PixelPoint): PixelPoint {
  return {
    x: Math.round(point.x),
    y: Math.round(point.y),
  }
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs)
  })
}
