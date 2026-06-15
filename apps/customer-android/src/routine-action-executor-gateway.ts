import { Dimensions, NativeModules, PixelRatio, Platform } from "react-native"

import {
  createNativeRoutineActionExecutor as createNativeRoutineActionExecutorFromModule,
  requireCustomerAutomationNativeModule,
} from "./native-customer-automation"
import type { RoutineActionExecutor } from "./routine-actions"
import { createGestureScreenSize } from "./screen-metrics"

export function createRoutineActionExecutor(): RoutineActionExecutor {
  if (Platform.OS === "web") {
    return createDevelopmentRoutineActionExecutor()
  }

  return createNativeRoutineActionExecutor()
}

function getCurrentScreen() {
  const { width, height } = Dimensions.get(
    Platform.OS === "web" ? "window" : "screen"
  )
  return createGestureScreenSize({
    platform: Platform.OS === "web" ? "web" : "native",
    pixelRatio: PixelRatio.get(),
    screen: {
      width,
      height,
    },
  })
}

function createDevelopmentRoutineActionExecutor(): RoutineActionExecutor {
  return {
    screen: getCurrentScreen(),
    async tap() {},
    async doubleTap() {},
    async longPress() {},
    async swipe() {},
    async back() {},
    async home() {},
    async launchApp() {},
    async typeText() {},
    async wait(durationMs) {
      await new Promise((resolve) => {
        setTimeout(resolve, durationMs)
      })
    },
  }
}

function createNativeRoutineActionExecutor(): RoutineActionExecutor {
  return createNativeRoutineActionExecutorFromModule(
    requireCustomerAutomationNativeModule(NativeModules),
    getCurrentScreen()
  )
}
