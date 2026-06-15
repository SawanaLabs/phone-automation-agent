---
title: Customer App Roadmap
description: Sequencing roadmap for implementing the Customer App Story through hosted-agent first and single-app fallback routes.
updateAt: 2026-06-13
---

# Customer App Roadmap

## Scope

- Covers future implementation sequence for the Customer App Story after the worker-backed demo.
- Records planned route order, fallback triggers, remaining Grooming items, and future implementation issue sequence.
- Stable Customer Android runtime, action, auth, delivery, and QA details live in the Customer Android domain docs.
- Main route docs:
  - [Customer Android Runtime Boundary](../customer-android/runtime-boundary.md)
  - [Customer Android Runtime Contract](../customer-android/runtime-contract.md)
  - [Customer Android Action Handling](../customer-android/action-handling.md)
  - [Customer Android Delivery](../customer-android/delivery.md)

## Planned Direction

- Build the Hosted Agent Runtime Route first, following the Customer Android domain docs.
- Keep the Single-App Runtime Route as the fallback or later convergence route.
- Work toward an Alpha Sideload APK for internal QA.
- Use [#1 Customer App Story via hosted agent runtime](https://github.com/SawanaLabs/phone-automation-agent/issues/1) as the parent PRD while completing the future issue sequence below.

## Route 2 First: Hosted Agent Runtime Route

This is the preferred first implementation route.

- `apps/customer-android` owns task entry, Android permission readiness, screen observation, local action execution, progress display, stop controls, and Human-in-the-loop Pause UI.
- `apps/customer-android-api` owns the Open-AutoGLM-style agent loop, prompt/action parsing, model-provider calls, task session state, logs, and model credentials.
- The APK sends phone state to the API, receives one next outcome, executes or pauses locally, and repeats.
- Auth, action mapping, delivery, and QA rules are maintained in Customer Android domain docs rather than duplicated here.

Why first:

- It follows the existing architecture more naturally than a full Android rewrite.
- It preserves the Python Open-AutoGLM loop longer and keeps prompt/model iteration server-side.
- It avoids shipping long-lived model-provider secrets inside an APK.
- It keeps the first Android app focused on the hardest new surface: AccessibilityService, MediaProjection, and reliable local action execution.

Known risks:

- Every model step depends on network connectivity and backend session stability.
- Screenshots and UI state may be sent to the hosted backend, so disclosure and privacy boundaries are product requirements.
- The Android app still needs strong permission onboarding and must fail clearly when AccessibilityService or MediaProjection is unavailable.
- Google Play distribution may be constrained by AccessibilityService automation policy; APK/internal distribution may be the first proof path.

Fallback triggers:

- Backend-directed actions cannot keep a stable enough session with the on-device executor.
- Network latency or reliability makes the task loop unusable for the first acceptance story.
- Privacy or distribution constraints make hosted screenshot processing unacceptable for the target users.
- The hosted route forces as much Android loop logic into the app as the Single-App Runtime Route would require anyway.

## Route 1 Fallback: Single-App Runtime Route

This route remains acceptable, but it is not the first implementation route.

- Android app owns task entry, permission onboarding, screen observation, local action execution, action parsing, task state, and the agent loop.
- The app calls only a remote LLM/model API.
- Open-AutoGLM should be treated as a protocol and behavior reference rather than a Python package that can be copied into the APK unchanged.
- The Android implementation must replace ADB screenshot/action behavior with Android-native MediaProjection and AccessibilityService behavior.

Why keep it:

- It is the cleanest customer packaging story if API credentials and model access are solved.
- It reduces dependency on a hosted runtime after the Android execution path is mature.
- It may be the right end state if backend privacy, cost, or latency become blocking.

Known risks:

- It requires a larger Android rewrite of the Open-AutoGLM loop, action handler, model client, state management, and logs.
- API key handling is harder if the APK calls the model provider directly.
- Prompt and action-protocol updates may require app releases unless a remote config layer is added.
- Debugging model-loop behavior on Android is slower than changing a hosted Python runtime.

## Remaining Grooming Items

- Set the minimum Android version and first supported OEM/device target.
- Define explicit out-of-scope items for the first issue: payment, login, captcha, irreversible account changes, Play Store compliance completion, and broad safety policy.

## Open Future Work

- Parent PRD: [#1 Customer App Story via hosted agent runtime](https://github.com/SawanaLabs/phone-automation-agent/issues/1).
- Active PRD: [#13 Build Customer Android API and adapt APK runtime client](https://github.com/SawanaLabs/phone-automation-agent/issues/13).
- Final acceptance target: [#11 Pass first Customer App acceptance story without Mac worker](https://github.com/SawanaLabs/phone-automation-agent/issues/11).
- Keep closed implementation issues out of this roadmap. Durable facts from completed work belong in the Customer Android domain docs.

Execution rules for future issues:

- TDD should happen inside each vertical slice: write one failing behavior test for the public contract, implement the minimum path, then refactor after green.
- Every implementation issue must include Browser Acceptance before it is considered complete: start the relevant local/dev surface, use Browser tooling to exercise the issue's user story against the actual developed product path, and record the result in the issue or PR.
- Physical-device slices may be Agent-verifiable Device QA when a connected Android phone is available. The implementation agent can install, run, screenshot, and operate the test device; the user remains responsible for final Customer App Story acceptance.

## Update Triggers

- Update this roadmap when Grooming selects the first acceptance story or changes the customer app/API boundary.
- Update this roadmap when the Hosted Agent Runtime Route is proven, blocked, or replaced.
- Update this roadmap when remaining Grooming items change.
- Remove completed roadmap items after moving any durable fact to the relevant domain doc.
