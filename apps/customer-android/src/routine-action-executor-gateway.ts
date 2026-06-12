import { Dimensions, Platform } from "react-native"

import type { RoutineActionExecutor } from "./routine-actions"

export function createRoutineActionExecutor(): RoutineActionExecutor {
  if (Platform.OS === "web") {
    return createDevelopmentRoutineActionExecutor()
  }

  return createNativeRoutineActionExecutor()
}

function getCurrentScreen() {
  const { width, height } = Dimensions.get("window")
  return {
    width,
    height,
  }
}

function createDevelopmentRoutineActionExecutor(): RoutineActionExecutor {
  return {
    screen: getCurrentScreen(),
    async tap() {},
    async swipe() {},
    async back() {},
    async home() {},
    async wait(durationMs) {
      await new Promise((resolve) => {
        setTimeout(resolve, durationMs)
      })
    },
  }
}

function createNativeRoutineActionExecutor(): RoutineActionExecutor {
  return {
    screen: getCurrentScreen(),
    async tap() {
      throwMissingNativeBridge()
    },
    async swipe() {
      throwMissingNativeBridge()
    },
    async back() {
      throwMissingNativeBridge()
    },
    async home() {
      throwMissingNativeBridge()
    },
    async wait(durationMs) {
      await new Promise((resolve) => {
        setTimeout(resolve, durationMs)
      })
    },
  }
}

function throwMissingNativeBridge(): never {
  throw new Error(
    "Routine actions require the native Android AccessibilityService bridge."
  )
}
