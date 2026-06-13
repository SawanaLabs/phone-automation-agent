---
title: Customer Android Runtime Boundary
description: Ownership boundary for the customer Android app, paired API, and reusable contracts.
updateAt: 2026-06-13
---

# Customer Android Runtime Boundary

## Scope

- Covers `apps/customer-android`, `apps/customer-android-api`, the Customer Runtime Contract, and reuse pressure with `apps/worker`.
- Applies to the Hosted Agent Runtime Route for the Customer App Story.
- Excludes Play Store production policy, cloud device fleet designs, and the existing worker-backed demo route except as comparison points.

## Domain Language

- **Customer Step**: One request/response turn between app-observed phone state and API-produced next action.
- **Customer Step Agent**: The step-oriented Agent Engine that accepts app-supplied phone state instead of reading or controlling the phone through ADB.
- **Routine Action**: A direct physical phone action that the APK can execute after setup, such as launch, tap, type, swipe, back, home, wait, double tap, and long press.
- **Pause Action**: An action that requires user-visible pause handling, such as takeover, interaction, or confirmation.

## Current Subdomain Docs

- `apps/customer-android` owns task entry, permission readiness, MediaProjection screen frames, AccessibilityService state, routine action execution, human-in-the-loop pause UI, progress display, and final result evidence.
- `apps/customer-android-api` owns customer task sessions, per-step state, prompt construction, model-provider calls, Open-AutoGLM-style response parsing, action normalization, pause/failure states, and runtime logs.
- The first API should consume phone state supplied by the APK. It should not call Open-AutoGLM `PhoneAgent.step()` as a black box because that method captures screenshots and executes actions through its own device layer.
- Treat the customer route as a split `PhoneAgent`: observe and execute are Android app responsibilities; decide and maintain agent context are API responsibilities.
- Prefer reusing Open-AutoGLM prompt, model client behavior, response parsing, and action parsing before rewriting the agent loop in TypeScript.
- Reuse with `apps/worker` should start from small contracts or adapter modules only after both sides need the same behavior.
- The customer route is considered real only when an APK-submitted story completes against the same physical Android phone without a manually run Mac worker.

## Decision Records

- **2026-06-13 customer-step-agent-shape**: Use a step-oriented Customer Agent shape for the first API.
  Status: Accepted
  Context: Open-AutoGLM `PhoneAgent.step()` currently owns screenshot capture and action execution, while the customer APK already owns those capabilities.
  Decision: Build the first API around a step function that accepts app-supplied phone state and returns the next normalized action, pause state, failure, or finish response.
  Consequences: The API can preserve Open-AutoGLM behavior where useful while replacing the ADB device layer with the Android app/API contract.

## Update Triggers

- Update this file when `apps/customer-android-api` is created or its public routes change.
- Update this file when the Android app/API step contract changes.
- Update this file when a shared package is extracted between the customer route and worker route.
- Update this file when the Agent Engine strategy changes from Open-AutoGLM reuse to a rewritten loop.
