---
title: Customer Android Runtime Contract
description: V0 sessions and steps contract between the Android APK and Customer Android API.
updateAt: 2026-06-13
---

# Customer Android Runtime Contract

## Scope

- Covers the V0 API contract between `apps/customer-android` and `apps/customer-android-api`.
- Applies to the Hosted Agent Runtime Route where the Android APK observes and executes while the API decides the next action.
- Excludes LangGraph Agent Server compatibility, AI SDK chat stream compatibility, and worker-backed `/tasks` routes.

## Domain Language

- **Session-Step API**: The customer-specific HTTP contract using one task session and repeated step decisions.
- **Session**: A customer task run created from the Android app's user instruction and runtime metadata.
- **Step Request**: The Android app's current phone state, screenshot, accessibility summary, and previous action result sent to the API.
- **Step Response**: The API's next normalized action, pause state, failure, or finish response.
- **In-Memory Session Store**: V0 storage for active session context inside the running API process.
- **Runtime Access Token**: A bearer token that the APK presents to `apps/customer-android-api` for alpha access to the hosted runtime.
- **Single Alpha Token**: The V0 credential strategy where all internal alpha APKs use one shared Runtime Access Token.

## Current Subdomain Docs

- V0 uses `POST /sessions` to create a task session.
- V0 uses `POST /sessions/{session_id}/steps` for every decision turn after the APK captures current phone state.
- The APK sends the user instruction, screenshot frame, dimensions, current package, accessibility summary, step number, and previous action result when available.
- The API returns exactly one next action per step. The APK maps routine actions, pause actions, runtime-local actions, failures, and finish into local task state.
- API-side model-provider failures and invalid model outputs are returned as a normalized failed outcome: `{"_metadata":"failed","message":"..."}` inside the step response `action` field. The APK must stop the hosted loop and show that message as task failure evidence.
- The API maintains in-memory Agent Context so later steps can include prior model responses and action history while dropping old image payloads from stored context.
- V0 session context lives in process memory. If the API restarts or loses the session, the task should fail clearly and require the APK to start a new session.
- The APK executes routine actions locally and sends the resulting state back through the next step request.
- The contract adapts the split Open-AutoGLM `PhoneAgent` shape. It should not copy LangGraph's `/threads/{thread_id}/runs/stream` contract, which serves AI SDK chat and graph streaming.
- Keep streaming telemetry optional for later. V0 should favor inspectable HTTP turns that are easy to test and replay.

## Auth And Credentials

- `POST /sessions` and `POST /sessions/{session_id}/steps` require `Authorization: Bearer <runtime_access_token>` in V0.
- `apps/customer-android-api` validates the runtime token against one shared alpha environment variable such as `CUSTOMER_ANDROID_API_ACCESS_TOKEN`.
- Model-provider credentials live only in `apps/customer-android-api` environment variables, such as `CUSTOMER_ANDROID_MODEL_API_KEY` or the provider-specific key chosen by implementation.
- `apps/customer-android` configures the API URL and Runtime Access Token for alpha QA, but it must not include ModelScope, BigModel, OpenAI-compatible, or other provider API keys.
- Treat a token embedded in an APK as recoverable by a motivated user. It is acceptable for internal alpha gating only because it can be rotated, revoked, rate-limited, and replaced by stronger controls later.

## Decision Records

- **2026-06-13 session-step-contract**: Use customer-specific sessions and steps for the first runtime contract.
  Status: Accepted
  Context: Phone automation has real side effects between model decisions, so each turn must wait for APK execution and a fresh phone observation.
  Decision: Start with `POST /sessions` and `POST /sessions/{session_id}/steps`.
  Consequences: The first contract is simple to test, supports physical-device QA, and leaves streaming progress as a later enhancement.

- **2026-06-13 in-memory-session-store**: Use in-memory session storage for V0.
  Status: Accepted
  Context: The first acceptance target needs a working split PhoneAgent loop more than restart recovery or durable task history.
  Decision: Store active sessions in the `apps/customer-android-api` process for V0.
  Consequences: Restart recovery, queue-backed execution, persistent audit logs, and checkpointer-style resume remain out of scope until the core story passes.

- **2026-06-13 runtime-token-auth**: Require a V0 runtime bearer token and keep model-provider keys server-side.
  Status: Accepted
  Context: The alpha delivery path is direct APK distribution to internal users, and a usable customer story needs a simple way to call the hosted runtime without exposing provider keys.
  Decision: Require `Authorization: Bearer <runtime_access_token>` on session and step routes. Validate one shared alpha token in `apps/customer-android-api`; keep model-provider keys only in API environment variables.
  Consequences: The first APK can be distributed for QA through GitHub releases while preserving the provider-key boundary. Stronger identity, attestation, quotas, and per-user token management remain later work.

- **2026-06-13 normalized-step-failure**: Return model/provider errors as failed step outcomes.
  Status: Accepted
  Context: The hosted loop needs customer-visible failures when the model provider is unavailable or the model returns text that cannot be parsed as an Open-AutoGLM action.
  Decision: Convert expected model-provider and model-output failures into `_metadata: failed` step outcomes, leaving auth and malformed HTTP requests as normal HTTP errors.
  Consequences: The APK can stop deterministically with a traceable failure message while unexpected server bugs still fail loudly during development.

## Update Triggers

- Update this file when `apps/customer-android-api` route names or request/response shapes change.
- Update this file when step responses add new outcome types.
- Update this file when streaming, retry, replay, auth, or durable persistence semantics become part of the contract.
