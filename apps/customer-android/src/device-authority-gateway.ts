import { NativeModules, Platform } from "react-native";

import type { DeviceAuthoritySnapshot } from "./device-authority";
import {
  createNativeDeviceAuthorityGateway,
  requireCustomerAutomationNativeModule,
} from "./native-customer-automation";

export interface DeviceAuthorityGateway {
  getSnapshot: () => Promise<DeviceAuthoritySnapshot>;
  openAccessibilitySettings: () => Promise<DeviceAuthoritySnapshot>;
  requestNotifications: () => Promise<DeviceAuthoritySnapshot>;
  requestScreenCapture: () => Promise<DeviceAuthoritySnapshot>;
  simulateScreenCaptureLoss?: () => Promise<DeviceAuthoritySnapshot>;
}

const SETUP_REQUIRED_SNAPSHOT: DeviceAuthoritySnapshot = {
  accessibilityService: "disabled",
  screenCapture: "missing",
  notifications: "missing",
};

const READY_SNAPSHOT: DeviceAuthoritySnapshot = {
  accessibilityService: "enabled",
  screenCapture: "granted",
  notifications: "granted",
};

export function createDeviceAuthorityGateway(): DeviceAuthorityGateway {
  if (Platform.OS === "web") {
    return createDevelopmentAuthorityGateway();
  }

  return createNativeAuthorityGateway();
}

function createDevelopmentAuthorityGateway(): DeviceAuthorityGateway {
  let snapshot = { ...SETUP_REQUIRED_SNAPSHOT };

  return {
    getSnapshot() {
      return Promise.resolve(snapshot);
    },
    openAccessibilitySettings() {
      snapshot = {
        ...snapshot,
        accessibilityService: "enabled",
      };
      return Promise.resolve(snapshot);
    },
    requestScreenCapture() {
      snapshot = READY_SNAPSHOT;
      return Promise.resolve(snapshot);
    },
    requestNotifications() {
      snapshot = {
        ...snapshot,
        notifications: "granted",
      };
      return Promise.resolve(snapshot);
    },
    simulateScreenCaptureLoss() {
      snapshot = {
        ...snapshot,
        screenCapture: "missing",
      };
      return Promise.resolve(snapshot);
    },
  };
}

function createNativeAuthorityGateway(): DeviceAuthorityGateway {
  return createNativeDeviceAuthorityGateway(
    requireCustomerAutomationNativeModule(NativeModules)
  );
}
