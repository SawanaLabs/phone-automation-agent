import { NativeModules, Platform } from "react-native"

import type { DeviceAuthoritySnapshot } from "./device-authority"
import {
  createNativeDeviceAuthorityGateway,
  requireCustomerAutomationNativeModule,
} from "./native-customer-automation"

export type DeviceAuthorityGateway = {
  getSnapshot: () => Promise<DeviceAuthoritySnapshot>
  openAccessibilitySettings: () => Promise<DeviceAuthoritySnapshot>
  requestScreenCapture: () => Promise<DeviceAuthoritySnapshot>
  requestNotifications: () => Promise<DeviceAuthoritySnapshot>
  simulateScreenCaptureLoss?: () => Promise<DeviceAuthoritySnapshot>
}

const SETUP_REQUIRED_SNAPSHOT: DeviceAuthoritySnapshot = {
  accessibilityService: "disabled",
  screenCapture: "missing",
  notifications: "missing",
}

const READY_SNAPSHOT: DeviceAuthoritySnapshot = {
  accessibilityService: "enabled",
  screenCapture: "granted",
  notifications: "granted",
}

export function createDeviceAuthorityGateway(): DeviceAuthorityGateway {
  if (Platform.OS === "web") {
    return createDevelopmentAuthorityGateway()
  }

  return createNativeAuthorityGateway()
}

function createDevelopmentAuthorityGateway(): DeviceAuthorityGateway {
  let snapshot = { ...SETUP_REQUIRED_SNAPSHOT }

  return {
    async getSnapshot() {
      return snapshot
    },
    async openAccessibilitySettings() {
      snapshot = {
        ...snapshot,
        accessibilityService: "enabled",
      }
      return snapshot
    },
    async requestScreenCapture() {
      snapshot = READY_SNAPSHOT
      return snapshot
    },
    async requestNotifications() {
      snapshot = {
        ...snapshot,
        notifications: "granted",
      }
      return snapshot
    },
    async simulateScreenCaptureLoss() {
      snapshot = {
        ...snapshot,
        screenCapture: "missing",
      }
      return snapshot
    },
  }
}

function createNativeAuthorityGateway(): DeviceAuthorityGateway {
  return createNativeDeviceAuthorityGateway(
    requireCustomerAutomationNativeModule(NativeModules)
  )
}
