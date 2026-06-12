---
title: Android On-Device Executor
description: Architecture boundary for moving the Customer App Story from Mac worker and ADB to an Android app with strong permissions.
updateAt: 2026-06-12
---

# Android On-Device Executor

## Scope

- Covers the future Android-side runtime needed for the Customer App Story.
- Main surfaces: a future customer-facing Android app or executor under `apps/*`, Android AccessibilityService, MediaProjection, foreground service behavior, model API access, and the task loop.
- Excludes the current `apps/worker` Mac runtime except as a comparison point.

## Domain Language

- **Android On-Device Executor**: The runtime that observes the current phone state and executes gestures on the user's same physical Android phone.
  _Avoid_: Mac worker, cloud device runner, ADB-only executor
- **Full Access Mode**: The first MVP posture where the executor continues routine automation after explicit user-granted setup permissions.
  _Avoid_: hidden privilege escalation, approval-first architecture

## Current Source Findings

- Open-AutoGLM currently assumes an external device-control layer. On Android, that path is ADB-oriented: launch, tap, swipe, type, back, home, wait, and user-intervention actions are handled from the Mac-side process.
- Open-AutoGLM has `Take_over` and `Interact`, but those are user-intervention signals. They should not be treated as a permission-request action.
- Open-AutoGLM can launch `Settings` through its app mapping when ADB control is already available. That helps demos, but a customer-installed APK still needs its own onboarding flow.
- Android's AccessibilityService model requires an app-defined service declared in the manifest with `android.permission.BIND_ACCESSIBILITY_SERVICE` and user enablement in system settings.
- AccessibilityService can retrieve window content when configured for it, and it can act on behalf of the user through accessibility APIs.
- A screenshot/image-model path likely needs MediaProjection. Android requires user consent for MediaProjection sessions, and recent Android versions add foreground-service requirements for screen capture.

## First MVP Assumptions

- Strong Android privileges are acceptable for the first runnable Customer App Story MVP when the app explains the setup and the user explicitly grants them.
- Default the first MVP to Full Access Mode after setup. Add request-approval mode after the basic loop is working.
- Build the permission onboarding into the Android app or executor: open the relevant Settings screen, explain what must be enabled, detect whether the service is active, and fail clearly when it is not.
- Treat AccessibilityService as the primary candidate for app interaction and gesture execution.
- Treat MediaProjection as the primary candidate for image-based screen observation if accessibility node data is insufficient for the Open-AutoGLM-style loop.
- Keep login, captcha, payment, account mutation, and irreversible actions out of the first customer acceptance story unless the product scope changes.

## App Boundary

- Do not call the current worker-backed `apps/mobile` APK deliverable for customers.
- Prefer a new `apps/*` workspace for the customer-facing Android app or on-device executor until its responsibilities stabilize.
- Keep the executor boundary cohesive: permission onboarding, screen observation, action execution, task loop, and task status should be owned together or connected through an explicit internal API.
- Keep model-provider secrets and routing explicit. If the model remains remote, define how customer credentials, project credentials, or a hosted relay are handled before calling it distributable.

## Open Questions

- Exact app workspace name, such as `apps/customer-android`, `apps/customer-mobile`, or another name.
- Whether the first customer MVP uses native Android/Kotlin directly, a React Native app with native modules, or a split app plus service package.
- Whether screen understanding uses AccessibilityService node trees first, MediaProjection screenshots first, or both.
- Whether model calls use a hosted project backend, customer-provided API keys, or on-device/local inference.
- Minimum supported Android version and OEM targets for the first acceptance device set.

## References

- Android AccessibilityService docs: https://developer.android.com/guide/topics/ui/accessibility/service
- Android Settings API, including `ACTION_ACCESSIBILITY_SETTINGS`: https://developer.android.com/reference/android/provider/Settings
- Android MediaProjection docs: https://developer.android.com/media/grow/media-projection
- Google Play AccessibilityService policy: https://support.google.com/googleplay/android-developer/answer/10964491

## Update Triggers

- Update this file when the Customer App Story implementation route is selected.
- Update this file when a concrete app workspace is created.
- Update this file when Android permission, screenshot, gesture, or foreground-service assumptions change.
- Update this file when Open-AutoGLM gains or removes actions relevant to permission onboarding.
