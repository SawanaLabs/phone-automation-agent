import { Linking, Platform } from "react-native"

import type { DeviceAuthoritySnapshot } from "./device-authority"

export type DeviceAuthorityGateway = {
  getSnapshot: () => Promise<DeviceAuthoritySnapshot>
  openAccessibilitySettings: () => Promise<DeviceAuthoritySnapshot>
  requestScreenCapture: () => Promise<DeviceAuthoritySnapshot>
  simulateScreenCaptureLoss?: () => Promise<DeviceAuthoritySnapshot>
}

const SETUP_REQUIRED_SNAPSHOT: DeviceAuthoritySnapshot = {
  accessibilityService: "disabled",
  screenCapture: "missing",
}

const READY_SNAPSHOT: DeviceAuthoritySnapshot = {
  accessibilityService: "enabled",
  screenCapture: "granted",
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
  return {
    async getSnapshot() {
      return SETUP_REQUIRED_SNAPSHOT
    },
    async openAccessibilitySettings() {
      await Linking.openSettings()
      return SETUP_REQUIRED_SNAPSHOT
    },
    async requestScreenCapture() {
      throw new Error(
        "Screen capture permission requires the native MediaProjection bridge."
      )
    },
  }
}
