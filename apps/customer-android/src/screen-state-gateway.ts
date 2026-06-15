import { Dimensions, NativeModules, PixelRatio, Platform } from "react-native";

import {
  createNativeScreenStateCollector,
  requireCustomerAutomationNativeModule,
} from "./native-customer-automation";
import type { ScreenStateCollector } from "./routine-action-types";
import { createGestureScreenSize } from "./screen-metrics";

const DEVELOPMENT_FRAME_BASE64 = "ZGV2ZWxvcG1lbnQtc2NyZWVuLWZyYW1l";

export function createScreenStateCollector(): ScreenStateCollector {
  if (Platform.OS === "web") {
    return createDevelopmentScreenStateCollector();
  }

  return createNativeScreenStateCollector(
    requireCustomerAutomationNativeModule(NativeModules)
  );
}

function createDevelopmentScreenStateCollector(): ScreenStateCollector {
  return {
    capture() {
      const screen = getCurrentScreen();
      return Promise.resolve({
        frameBase64: DEVELOPMENT_FRAME_BASE64,
        frameMimeType: "text/plain",
        width: screen.width,
        height: screen.height,
        currentPackage: "web",
        accessibilitySummary: `development-screen ${screen.width}x${screen.height}`,
      });
    },
  };
}

function getCurrentScreen() {
  const { width, height } = Dimensions.get(
    Platform.OS === "web" ? "window" : "screen"
  );
  return createGestureScreenSize({
    platform: Platform.OS === "web" ? "web" : "native",
    pixelRatio: PixelRatio.get(),
    screen: {
      width,
      height,
    },
  });
}
