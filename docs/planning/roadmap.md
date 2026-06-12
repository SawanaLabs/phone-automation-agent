---
title: Customer App Roadmap
description: Grooming roadmap for implementing the Customer App Story through hosted-agent and single-app routes.
updateAt: 2026-06-12
---

# Customer App Roadmap

## Scope

- Covers the implementation sequence for the Customer App Story after the worker-backed demo.
- Records two acceptable routes: Hosted Agent Runtime first, Single-App Runtime as fallback or later convergence.
- Main surfaces: a future Android customer app under `apps/*`, Open-AutoGLM integration, Android AccessibilityService, MediaProjection, hosted model/runtime calls, and the future Grooming Issue.

## Current Planning Position

- Both routes are acceptable product directions.
- Implement the Hosted Agent Runtime Route first because it is the closest continuation of the current `apps/mobile` plus `apps/worker` shape.
- If the Hosted Agent Runtime Route cannot reach the first Customer App Story acceptance target, reassess the Single-App Runtime Route.
- Keep the current `apps/mobile` as the worker-backed demo companion until a new customer app boundary is explicitly created.
- Do not write the large implementation issue until Grooming is complete.

## Route 2 First: Hosted Agent Runtime Route

This is the preferred first implementation route.

- Android app owns task entry, permission onboarding, screen observation, local action execution, progress display, and stop controls.
- Hosted backend owns Open-AutoGLM-style agent loop, prompt/action parsing, LLM/model-provider calls, task session state, logs, and model credentials.
- Android app sends current phone state to the backend, receives the next `do(...)` or `finish(...)` action, executes it locally, and repeats.
- The controlled device remains the user's same physical Android phone, so this route can still satisfy the Customer App Story without a customer-run Mac worker.
- The shared action contract should recognize the full default Chinese Open-AutoGLM action vocabulary: `Launch`, `Tap`, `Type`, `Type_Name`, `Interact`, `Swipe`, `Note`, `Call_API`, `Long Press`, `Double Tap`, `Take_over`, `Back`, `Home`, `Wait`, and `finish`.
- The first Android executor should implement the routine physical actions: `Launch`, `Tap`, `Type`, `Type_Name`, `Swipe`, `Back`, `Home`, `Wait`, `Double Tap`, `Long Press`, and `finish`.
- Gate and runtime-local actions should be represented explicitly rather than treated as unknown actions: `Take_over`, `Interact`, `Tap` with `message`, `Note`, and `Call_API`.
- V0 gate actions should use a minimal Human-in-the-loop Pause UI, not a broad approval system: `Take_over` maps to `takeover_required`, `Interact` maps to `interaction_required`, and `Tap` with `message` maps to `confirmation_required`.
- During a Human-in-the-loop Pause, the app shows the model-provided message or latest action, lets the user manually resolve the situation on the phone when needed, then offers Continue and Stop controls.
- Routine physical actions remain Full Access after explicit Android permission setup; they should not ask for approval before every step in V0.

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

First validation checkpoints:

- The Android app can detect whether its AccessibilityService is enabled.
- The Android app can start a MediaProjection session and capture a screen frame.
- The Android app can execute deterministic local actions: tap, swipe, back, home, wait, launch, and text input.
- The hosted runtime and Android app can parse the full Open-AutoGLM default Chinese action vocabulary, even when some actions are routed to pause, fail, trace, or backend handling in the first version.
- The app can enter `takeover_required`, `interaction_required`, and `confirmation_required` states, then either continue from the next captured screen state or stop the task clearly.
- A hosted endpoint can return a normalized Open-AutoGLM-compatible action for one captured screen.
- The app and backend can complete the first acceptance story without a Mac worker.

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

## Grooming Outputs Before Issue Creation

- Choose the new app workspace name, such as `apps/customer-android` or `apps/customer-mobile`.
- Define the first acceptance story, likely a non-payment app task that stops before irreversible actions.
- Decide the phone-to-backend transport: HTTP polling, streaming HTTP, or WebSocket.
- Define the hosted runtime contract: request shape, action response shape, session state, errors, and event logs.
- Decide credential strategy: project-owned model credentials behind backend, user-provided model keys, or short-lived tokens.
- Set the minimum Android version and first supported OEM/device target.
- Define explicit out-of-scope items for the first issue: payment, login, captcha, irreversible account changes, Play Store compliance completion, and broad safety policy.

## Implementation Issue Breakdown

- Parent PRD: [#1 Customer App Story via hosted agent runtime](https://github.com/SawanaLabs/phone-automation-agent/issues/1).
- Use `apps/customer-android` as the customer Android workspace name unless superseded by a later architecture decision.
- TDD should happen inside each vertical slice: write one failing behavior test for the public contract, implement the minimum path, then refactor after green.
- Physical-device slices may be Agent-verifiable Device QA when a connected Android phone is available. The implementation agent can install, run, screenshot, and operate the test device; the user remains responsible for final Customer App Story acceptance.

Issue sequence:

1. [#2 Create customer Android app with hosted session happy path](https://github.com/SawanaLabs/phone-automation-agent/issues/2)
2. [#3 Gate task start behind Android permission readiness](https://github.com/SawanaLabs/phone-automation-agent/issues/3)
3. [#4 Run scripted Tap Swipe Back Home Wait actions on the same phone](https://github.com/SawanaLabs/phone-automation-agent/issues/4)
4. [#5 Add Launch and text entry routine actions](https://github.com/SawanaLabs/phone-automation-agent/issues/5)
5. [#6 Upload screen state for per-step hosted decisions](https://github.com/SawanaLabs/phone-automation-agent/issues/6)
6. [#7 Normalize Open-AutoGLM routine action contract](https://github.com/SawanaLabs/phone-automation-agent/issues/7)
7. [#8 Connect hosted runtime to Open-AutoGLM-style agent loop](https://github.com/SawanaLabs/phone-automation-agent/issues/8)
8. [#9 Handle human-in-the-loop pause actions](https://github.com/SawanaLabs/phone-automation-agent/issues/9)
9. [#10 Represent runtime-local and unsupported actions explicitly](https://github.com/SawanaLabs/phone-automation-agent/issues/10)
10. [#11 Pass first Customer App acceptance story without Mac worker](https://github.com/SawanaLabs/phone-automation-agent/issues/11)

## Update Triggers

- Update this roadmap when Grooming selects the workspace name or first acceptance story.
- Update this roadmap when the Hosted Agent Runtime Route is proven, blocked, or replaced.
- Update this roadmap before writing the large Grooming Issue.
- Update Product and Architecture docs if the roadmap turns into an accepted architecture decision.
