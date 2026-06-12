export type AccessibilityServiceStatus = "enabled" | "disabled"
export type ScreenCaptureStatus = "granted" | "missing"

export type DeviceAuthoritySnapshot = {
  accessibilityService: AccessibilityServiceStatus
  screenCapture: ScreenCaptureStatus
}

export type DeviceAuthorityState = {
  status: "ready" | "setup_required" | "permission_lost"
  canStartTask: boolean
  missing: string[]
}

export function deriveDeviceAuthorityState(
  snapshot: DeviceAuthoritySnapshot,
  previousStatus?: DeviceAuthorityState["status"]
): DeviceAuthorityState {
  if (
    snapshot.accessibilityService === "enabled" &&
    snapshot.screenCapture === "granted"
  ) {
    return {
      status: "ready",
      canStartTask: true,
      missing: [],
    }
  }

  if (previousStatus === "ready") {
    return {
      status: "permission_lost",
      canStartTask: false,
      missing: getMissingAuthority(snapshot),
    }
  }

  return {
    status: "setup_required",
    canStartTask: false,
    missing: getMissingAuthority(snapshot),
  }
}

function getMissingAuthority(snapshot: DeviceAuthoritySnapshot): string[] {
  const missing: string[] = []
  if (snapshot.accessibilityService === "disabled") {
    missing.push("accessibility_service")
  }
  if (snapshot.screenCapture === "missing") {
    missing.push("screen_capture")
  }

  return missing
}
