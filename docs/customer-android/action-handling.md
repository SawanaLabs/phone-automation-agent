---
title: Customer Android Action Handling
description: V0 Open-AutoGLM action vocabulary, routine executor scope, and pause-state mapping for the customer Android route.
updateAt: 2026-06-13
---

# Customer Android Action Handling

## Scope

- Covers how `apps/customer-android` and `apps/customer-android-api` represent Open-AutoGLM actions in the Customer App Story.
- Applies to the Hosted Agent Runtime Route where the API decides the next action and the APK executes routine phone actions.
- Excludes ADB execution in `apps/worker` and any broad safety policy beyond the first Human-in-the-loop Pause states.

## Domain Language

- **Routine Action**: A direct phone operation the APK can execute after explicit permission setup.
- **Pause Action**: A model action that must pause the task and show a user-visible Continue or Stop path.
- **Runtime-Local Action**: A model action that belongs to backend trace, note, summary, or unsupported handling instead of physical Android input.
- **Human-in-the-loop Pause**: The app state where automation stops at a gate action and waits for user resolution, Continue, or Stop.

## Current Subdomain Docs

- The shared V0 action contract recognizes the full default Chinese Open-AutoGLM action vocabulary: `Launch`, `Tap`, `Type`, `Type_Name`, `Interact`, `Swipe`, `Note`, `Call_API`, `Long Press`, `Double Tap`, `Take_over`, `Back`, `Home`, `Wait`, and `finish`.
- The first Android executor should implement routine physical actions: `Launch`, `Tap`, `Type`, `Type_Name`, `Swipe`, `Back`, `Home`, `Wait`, `Double Tap`, `Long Press`, and `finish`.
- `Type_Name` should normalize to the same executor behavior as `Type`.
- `finish` completes the task and surfaces the final message or result evidence in the app.
- Gate actions must be represented explicitly:
  - `Take_over` maps to `takeover_required`.
  - `Interact` maps to `interaction_required`.
  - `Tap` with `message` maps to `confirmation_required`.
- During a Human-in-the-loop Pause, the app shows the model-provided message or latest action, lets the user manually resolve the situation on the same phone when needed, then offers Continue and Stop controls.
- `Note` and `Call_API` are Runtime-Local Actions in V0. They should be represented as explicit trace, note, summary, no-op, or unsupported outcomes instead of being treated as parser failures.
- Routine physical actions run in Full Access Mode after explicit Android permission setup. They should not ask for approval before every step in V0.

## Decision Records

- **2026-06-13 customer-action-handling-v0**: Use explicit routine, pause, and runtime-local action buckets.
  Status: Accepted
  Context: Open-AutoGLM exposes more action names than the first Android executor can physically execute, and gate actions need a visible user pause rather than hidden backend waiting.
  Decision: Recognize the full default Chinese action vocabulary while implementing routine physical actions first, mapping gate actions to app pause states, and preserving runtime-local actions as explicit outcomes.
  Consequences: The app/API contract can stay compatible with Open-AutoGLM behavior while making unsupported and user-gated cases inspectable during QA.

## Update Triggers

- Update this file when the recognized Open-AutoGLM action vocabulary changes.
- Update this file when a new action moves from pause, runtime-local, or unsupported handling into the routine Android executor.
- Update this file when Human-in-the-loop Pause semantics change.
