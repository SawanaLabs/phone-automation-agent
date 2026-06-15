---
title: Customer Android Action Handling
description: V0 Open-AutoGLM action vocabulary, routine executor scope, and pause-state mapping for the customer Android route.
updateAt: 2026-06-15
---

# Customer Android Action Handling

## Scope

- Covers how `apps/customer-android` and `apps/customer-android-api` represent Open-AutoGLM actions in the Customer App Story.
- Applies to the Hosted Agent Runtime Route where the API decides the next action and the APK executes routine phone actions.
- Excludes ADB execution in `apps/worker` and any broad safety policy beyond the first Human-in-the-loop Pause states.

## Domain Language

- **Routine Action**: A direct phone operation the APK can execute after explicit permission setup.
- **Routine Action Runner**: The app-side semantic port that executes a recognized `do(...)` action and returns a `CustomerActionResult`.
- **Routine Action Executor**: The primitive Android adapter for physical operations such as tap, swipe, launch, type, back, home, and wait.
- **Pause Action**: A model action that must pause the task and show a user-visible Continue or Stop path.
- **Runtime-Local Action**: A model action that belongs to backend trace, note, summary, or unsupported handling instead of physical Android input.
- **Failed Outcome**: A normalized API outcome that tells the APK to stop the hosted loop and show a failure message.
- **Human-in-the-loop Pause**: The app state where automation stops at a gate action and waits for user resolution, Continue, or Stop.

## Current Subdomain Docs

- The shared V0 action contract recognizes the full default Chinese Open-AutoGLM action vocabulary: `Launch`, `Tap`, `Type`, `Type_Name`, `Interact`, `Swipe`, `Note`, `Call_API`, `Long Press`, `Double Tap`, `Take_over`, `Back`, `Home`, `Wait`, and `finish`.
- The first Android executor should implement routine physical actions: `Launch`, `Tap`, `Type`, `Type_Name`, `Swipe`, `Back`, `Home`, `Wait`, `Double Tap`, `Long Press`, and `finish`.
- Hosted loops and app run orchestration depend on `RoutineActionRunner` for action execution, confirmation approval, and pause continuation results.
- `RoutineActionExecutor` remains the low-level physical gateway. Android input details belong there or in platform-specific adapters, while hosted loop/controller code stays on action semantics and task state.
- Native hosted execution mirrors the same seam: `NativeRoutineActionExecutor` owns native action semantics behind `NativeHostedActionExecutor`, while `CustomerAutomationModule.kt` stays the React Native bridge.
- Native pause continuation stays inside native hosted execution. `createNativeHostedTaskRunner` serializes the paused session, previous events, next step number, and continuation or confirmation intent, then `NativeHostedTaskResumeStateParser` restores that state for `NativeHostedTaskLoop`.
- Native running stop stays inside native hosted execution. The app's Stop Task control calls the hosted runner, the bridge sets the active native cancellation token, and `NativeHostedTaskLoop` returns a `stopped` snapshot before the next capture, runtime request, or action dispatch.
- `Launch` is normalized in `apps/customer-android-api` before it reaches the APK: known Open-AutoGLM Android app names such as `小红书` and `美团` are mapped to package names such as `com.xingin.xhs` and `com.sankuai.meituan`; unknown names are preserved so the APK can still try package or launcher-label fallback on the user's phone.
- `Type_Name` should normalize to the same executor behavior as `Type`.
- `finish` completes the task and surfaces the final message or result evidence in the app.
- Gate actions must be represented explicitly:
  - `Take_over` maps to `takeover_required`.
  - `Interact` maps to `interaction_required`.
  - `Tap` with `message` maps to `confirmation_required`.
- During a Human-in-the-loop Pause, the app shows the model-provided message or latest action, lets the user manually resolve the situation on the same phone when needed, then offers Continue and Stop controls.
- The JS hosted loop and Android native hosted loop must both return `pause`, `nextStepNumber`, and `lastActionResult` for pause outcomes so the app can render Continue, Allow, and Stop consistently.
- `Note` and `Call_API` are Runtime-Local Actions in V0. They should be represented as explicit trace, note, summary, no-op, or unsupported outcomes instead of being treated as parser failures.
- `_metadata: "failed"` is not an Open-AutoGLM phone action. It is the customer runtime's normalized failure outcome for invalid model output or model-provider failures.
- Routine physical actions run in Full Access Mode after explicit Android permission setup. They should not ask for approval before every step in V0.
- Action E2E QA should be grouped by execution semantics rather than by equal-weight action names:
  - Routine Action E2E covers `Launch`, `Tap`, `Type`, `Type_Name`, `Swipe`, `Back`, `Home`, `Wait`, `Double Tap`, and `Long Press`.
  - Pause Action E2E covers `Take_over` and `Interact`.
  - Sensitive Tap Variant E2E covers `Tap` with `message` as `confirmation_required`.
  - Runtime-Local Action E2E covers `Note` and `Call_API`.
  - `finish` is validated through Completion Signal E2E.
- Grouping actions by execution semantics must not reduce coverage. Every recognized Open-AutoGLM action remains accounted for in either routine, pause, runtime-local, or finish acceptance.
- `apps/customer-android/src/action-e2e-coverage.ts` is the code-level action coverage manifest. Its test keeps the 14 recognized `do(...)` action names plus `finish(...)` accounted for exactly once, while tracking sensitive `Tap(message)` as a required variant.
- Customer Android acceptance should use Evidence-First Integration E2E as the main path: the APK, Customer Android API, model provider, and Controlled Phone behavior are judged together with enough run evidence to explain the result.
- Scripted-provider runs remain useful as executor diagnostics and sanity checks, but scripted-only action success does not prove the real Customer App Story.
- Completion Signal notifications are triggered by the APK after the hosted loop receives terminal or pause state. The API returns the state and message; it does not own Android notification delivery. Notification delivery success is recorded as `task.notification.delivered`; delivery failures stay visible as `task.notification.failed` evidence without changing the task outcome.

## Decision Records

- **2026-06-13 customer-action-handling-v0**: Use explicit routine, pause, and runtime-local action buckets.
  Status: Accepted
  Context: Open-AutoGLM exposes more action names than the first Android executor can physically execute, and gate actions need a visible user pause rather than hidden backend waiting.
  Decision: Recognize the full default Chinese action vocabulary while implementing routine physical actions first, mapping gate actions to app pause states, and preserving runtime-local actions as explicit outcomes.
  Consequences: The app/API contract can stay compatible with Open-AutoGLM behavior while making unsupported and user-gated cases inspectable during QA.

- **2026-06-14 customer-launch-app-catalog-normalization**: Normalize known `Launch` app names in the API.
  Status: Accepted
  Context: Upstream Open-AutoGLM Android launch uses `APP_PACKAGES` to turn app names into packages before calling the device layer. The customer split route cannot rely only on Android launcher labels because labels vary by device, locale, and vendor ROM.
  Decision: Keep Open-AutoGLM-style app-name normalization in `apps/customer-android-api`, then return package names to the APK for routine execution.
  Consequences: The API stays closer to upstream behavior while the APK remains a generic executor. Unknown app names still fall through to APK package or label fallback for internal alpha QA.

- **2026-06-14 native-pause-continuation-parity**: Keep native hosted pauses compatible with JS hosted pauses.
  Status: Accepted
  Context: The UI pause controls depend on a structured `pause` object and continuation step metadata, but the native hosted loop originally returned only task status and summary.
  Decision: Return `pause`, `nextStepNumber`, and `lastActionResult` from native hosted pause snapshots.
  Consequences: Login, permissions, user choices, and sensitive tap confirmations can resume through the same UI contract whether the loop runs in JS or native Android.

- **2026-06-15 routine-action-runner-boundary**: Keep task orchestration on semantic action execution.
  Status: Accepted
  Context: The hosted loop and app run controller were starting to depend directly on primitive Android executor methods, which made task orchestration responsible for both action semantics and device input details.
  Decision: Introduce `RoutineActionRunner` as the semantic port for executing routine actions, executing approved confirmation pauses, and creating pause continuation results. Keep `RoutineActionExecutor` as the primitive Android input adapter behind that port.
  Consequences: Hosted loop/controller tests can mock action semantics directly, while physical Android execution remains isolated behind one adapter boundary.

## Update Triggers

- Update this file when the recognized Open-AutoGLM action vocabulary changes.
- Update this file when a new action moves from pause, runtime-local, or unsupported handling into the routine Android executor.
- Update this file when Human-in-the-loop Pause semantics change.
