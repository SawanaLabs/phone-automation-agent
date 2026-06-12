import type { DeviceAuthorityGateway } from "./device-authority-gateway"
import type { DeviceAuthoritySnapshot } from "./device-authority"
import type { PixelPoint, RoutineActionExecutor, ScreenSize } from "./routine-actions"

export type CustomerAutomationNativeModule = {
  getAuthoritySnapshot: () => Promise<DeviceAuthoritySnapshot>
  openAccessibilitySettings: () => Promise<DeviceAuthoritySnapshot>
  requestScreenCapture: () => Promise<DeviceAuthoritySnapshot>
  tap: (x: number, y: number) => Promise<void>
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
      await new Promise((resolve) => {
        setTimeout(resolve, durationMs)
      })
    },
  }
}

export function roundPixelPoint(point: PixelPoint): PixelPoint {
  return {
    x: Math.round(point.x),
    y: Math.round(point.y),
  }
}
