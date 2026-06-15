import { describe, expect, it } from "vitest";

import { deriveDeviceAuthorityState } from "./device-authority";

describe("device authority state", () => {
  it("marks the device ready when accessibility and screen capture are available", () => {
    const state = deriveDeviceAuthorityState({
      accessibilityService: "enabled",
      screenCapture: "granted",
      notifications: "granted",
    });

    expect(state).toMatchObject({
      status: "ready",
      canStartTask: true,
      missing: [],
    });
  });

  it("requires setup when a fresh session is missing required authority", () => {
    const state = deriveDeviceAuthorityState({
      accessibilityService: "disabled",
      screenCapture: "missing",
      notifications: "missing",
    });

    expect(state).toMatchObject({
      status: "setup_required",
      canStartTask: false,
      missing: ["accessibility_service", "screen_capture", "notifications"],
    });
  });

  it("requires notifications before starting a task", () => {
    const state = deriveDeviceAuthorityState({
      accessibilityService: "enabled",
      screenCapture: "granted",
      notifications: "missing",
    });

    expect(state).toMatchObject({
      status: "setup_required",
      canStartTask: false,
      missing: ["notifications"],
    });
  });

  it("marks permission lost when authority disappears after the device was ready", () => {
    const state = deriveDeviceAuthorityState(
      {
        accessibilityService: "enabled",
        screenCapture: "missing",
        notifications: "granted",
      },
      "ready"
    );

    expect(state).toMatchObject({
      status: "permission_lost",
      canStartTask: false,
      missing: ["screen_capture"],
    });
  });
});
