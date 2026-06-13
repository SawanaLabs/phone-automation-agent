---
title: Customer Android Agent Engine
description: Runtime shape, environment contract, and session context behavior for apps/customer-android-api.
updateAt: 2026-06-13
---

# Customer Android Agent Engine

## Scope

- Covers the first runnable `apps/customer-android-api` Agent Engine paired with `apps/customer-android`.
- Applies to the Hosted Agent Runtime Route where the Android APK observes and executes while the API decides.
- Excludes the Mac/ADB `apps/worker` route, durable persistence, queueing, and production identity.

## Domain Language

- **Customer Step Agent**: The step-oriented engine that turns app-supplied phone state into the next Open-AutoGLM-style action.
- **OpenAI-Compatible Model Provider**: The server-side adapter that calls a ModelScope, BigModel, vLLM, SGLang, or similar OpenAI-format chat completion endpoint.
- **Agent Context**: The in-memory per-session message history sent to the model across steps.

## Current Subdomain Docs

- `apps/customer-android-api` is a Python/FastAPI app managed with `uv` and orchestrated from pnpm/Turborepo through `apps/customer-android-api/package.json`.
- The API exposes `GET /healthz`, `POST /sessions`, `GET /sessions/{session_id}`, and `POST /sessions/{session_id}/steps`.
- `POST /sessions`, `GET /sessions/{session_id}`, and `POST /sessions/{session_id}/steps` require `Authorization: Bearer <CUSTOMER_ANDROID_API_ACCESS_TOKEN>`.
- The CLI entrypoint is `uv run python -m customer_android_api`.
- The root scripts are:
  - `pnpm dev:customer-android-api` for local API development.
  - `pnpm dev:customer-android-api:lan` for physical Android QA where the phone reaches the Mac over the LAN.
- Required API environment variables:
  - `CUSTOMER_ANDROID_API_ACCESS_TOKEN`
- Provider mode:
  - `CUSTOMER_ANDROID_MODEL_PROVIDER=scripted` is the default deterministic QA mode.
  - `CUSTOMER_ANDROID_MODEL_PROVIDER=openai-compatible` calls a configured OpenAI-format chat completion endpoint.
- Scripted provider environment variables:
  - `CUSTOMER_ANDROID_SCRIPTED_ACTIONS_JSON` is optional. When set, it must be a JSON array of Open-AutoGLM action strings, one per step. When it is omitted or the configured sequence is exhausted, the provider returns a default `finish(...)`.
- OpenAI-compatible provider environment variables:
  - `CUSTOMER_ANDROID_MODEL_BASE_URL`
  - `CUSTOMER_ANDROID_MODEL_API_KEY`
  - `CUSTOMER_ANDROID_MODEL_NAME`
- Other optional API environment variables:
  - `CUSTOMER_ANDROID_API_HOST` defaults to `127.0.0.1`.
  - `CUSTOMER_ANDROID_API_PORT` defaults to `8787`.
  - `CUSTOMER_ANDROID_API_MAX_STEPS` defaults to `50`.
  - `CUSTOMER_ANDROID_MODEL_MAX_TOKENS` defaults to `3000`.
  - `CUSTOMER_ANDROID_MODEL_TEMPERATURE` defaults to `0.0`.
  - `CUSTOMER_ANDROID_MODEL_TOP_P` defaults to `0.85`.
  - `CUSTOMER_ANDROID_MODEL_FREQUENCY_PENALTY` defaults to `0.2`.
- The API loads `.env` from the repo root by default. `CUSTOMER_ANDROID_API_ENV_FILE` or `PHONE_AUTOMATION_ENV_FILE` can point at an explicit env file.
- `apps/customer-android` now has separate Runtime URL and Runtime Access Token inputs. The token is sent to the API on session creation and every step request.
- The native Android hosted loop also passes the Runtime Access Token into its HTTP requests, so real-device execution and web/dev fetch paths share the same auth contract.
- The in-memory session snapshot records `task.started`, `step.decided`, and terminal or pause events. `finish(...)` marks the task `finished`, `_metadata: failed` marks it `failed`, and Human-in-the-loop actions mark it `takeover_required`, `interaction_required`, or `confirmation_required`.
- If an APK continues past `CUSTOMER_ANDROID_API_MAX_STEPS`, the API returns `_metadata: failed` without calling the model provider and records that failed outcome in the session.

## Agent Context Behavior

- Each session has an in-memory message context owned by `CustomerStepAgent`.
- First step messages contain:
  - one system prompt describing the Open-AutoGLM action vocabulary,
  - one user message with the task instruction,
  - the current screen image as `data:<mime>;base64,<frame>`,
  - screen metadata as JSON containing current app, width, height, accessibility summary when available, and previous action result when available.
- Follow-up step messages contain fresh screen metadata and the latest screenshot.
- After each model call, the stored user message has image content removed before it is kept in context. This preserves text history while avoiding repeated image payload growth.
- The model response is parsed through the API's Open-AutoGLM action parser, then returned to the APK as a normalized action.
- The APK executes routine actions locally, pauses for human-in-the-loop actions, and sends the next phone observation back to the API.
- Each accepted step is also recorded in the API session snapshot so `GET /sessions/{session_id}` can be used for debugging and APK-side reconciliation.

## Decision Records

- **2026-06-13 customer-step-agent-context**: Keep per-session model context inside `apps/customer-android-api` memory for V0.
  Status: Accepted
  Context: The split Agent Engine needs prior model responses and action history, but durable persistence would add database and recovery work before the first customer story is proven.
  Decision: Store model messages in process memory, remove old image payloads after each model call, and fail active tasks clearly after API restart.
  Consequences: The first implementation stays small and replayable through tests. Restart recovery, durable audit logs, and multi-process session routing remain later work.

- **2026-06-13 openai-compatible-model-provider**: Use a generic OpenAI-compatible provider adapter for the first hosted Customer Step Agent.
  Status: Accepted
  Context: Open-AutoGLM supports BigModel, ModelScope, and self-hosted OpenAI-format endpoints, and the customer API must keep provider credentials server-side.
  Decision: Configure the first real provider with `CUSTOMER_ANDROID_MODEL_BASE_URL`, `CUSTOMER_ANDROID_MODEL_API_KEY`, and `CUSTOMER_ANDROID_MODEL_NAME`.
  Consequences: The APK only needs API URL plus Runtime Access Token. Provider-specific SDKs, routing, retries, and model fallback can be added later when the first acceptance story is stable.

- **2026-06-13 scripted-provider-default**: Default local Customer Android API runs use the scripted provider.
  Status: Accepted
  Context: Device QA needs a deterministic API path that can drive APK routine actions without spending model calls or requiring provider keys on every local machine.
  Decision: Default `CUSTOMER_ANDROID_MODEL_PROVIDER` to `scripted`, allow `CUSTOMER_ANDROID_SCRIPTED_ACTIONS_JSON` to provide step-by-step Open-AutoGLM action strings, and require model credentials only when `openai-compatible` is selected.
  Consequences: Browser and connected-device acceptance can prove transport and execution first. Real model behavior remains available through explicit provider selection.

## Update Triggers

- Update this file when `apps/customer-android-api` changes its env contract, model-provider adapter, prompt strategy, or session context behavior.
- Update this file when agent context moves from memory into durable storage.
- Update this file when the APK/API runtime token setup changes.
