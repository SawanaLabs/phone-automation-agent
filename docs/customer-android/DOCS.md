---
title: Customer Android Domain Protocol
description: Domain-level conventions for the customer Android app and paired API.
updateAt: 2026-06-13
---

# Customer Android Domain Protocol

Use this domain when working on the customer-installable Android APK, its paired hosted API, and the same-phone automation loop.

## Domain Language

- **Customer Android App**: The installable Android APK in `apps/customer-android` that owns permission onboarding, screen observation, routine action execution, pause controls, progress display, and result evidence.
- **Customer Android API**: The customer-story Python/FastAPI hosted Agent Runtime in `apps/customer-android-api` that owns task sessions, Open-AutoGLM-style step decisions, model calls, runtime logs, and model credentials.
- **Customer Step Agent**: The step-oriented Agent Engine inside `apps/customer-android-api` that consumes app-supplied phone state and returns the next normalized action, pause state, failure, or finish response.
- **Customer Step**: One decision round where the Android app sends current phone state and the previous action result, then receives the next action, pause state, failure, or finish response.
- **Customer Runtime Contract**: The request/response contract between `apps/customer-android` and `apps/customer-android-api`.
- **Session-Step API**: The V0 Customer Runtime Contract shape using `POST /sessions` for task creation and `POST /sessions/{session_id}/steps` for each phone-state decision turn.
- **In-Memory Session Store**: The V0 session storage posture where `apps/customer-android-api` keeps active task state inside the running process and fails clearly after process restart instead of persisting or restoring tasks.
- **Runtime Access Token**: A revocable V0 bearer token accepted by `apps/customer-android-api` from the APK. The first internal alpha uses a single shared token, and the token must not be treated as a model-provider secret once distributed inside an APK.
- **Agent Context**: The per-session model message history kept by `apps/customer-android-api` while the split phone task is running.

## Collaboration Conventions

- Start customer Android implementation work from this domain, then use Product docs for delivery boundaries, Architecture docs for lower-level Android and Open-AutoGLM constraints, and Planning docs for issue order.
- Keep customer-story work paired across `apps/customer-android` and `apps/customer-android-api` unless the issue is explicitly app-only or API-only.
- Use `uv` for the Python API environment and dependency work.
- Use JDK 17 for `apps/customer-android` Android Gradle work. Keep local machine paths such as `sdk.dir` and `org.gradle.java.home` in ignored `apps/customer-android/android/local.properties`.
- Start the hosted customer API through `pnpm dev:customer-android-api` or `pnpm dev:customer-android-api:lan`; keep model-provider credentials in the API env, not the APK.
- Test the narrow public contract first: session creation, step request/response shape, action normalization, pause states, and failure surfaces.
- Every issue that claims a working customer path still needs Browser Acceptance and real connected-device QA when same-phone execution is involved.

## Boundary Principles

- `apps/customer-android` executes routine physical actions after explicit Android permission setup; it does not own model credentials or Open-AutoGLM prompt iteration in the Hosted Agent Runtime Route.
- `apps/customer-android-api` decides the next action from uploaded phone state; it does not execute ADB actions or take over the role of the Android On-Device Executor.
- `apps/worker` remains the experimental Mac/ADB worker for the first demo route. Do not fold customer execution into it by default.
- Keep long-lived model-provider credentials behind the API for the hosted route. Do not ship them inside the APK.
- Ship the APK with only the API URL and a lightweight Runtime Access Token for alpha distribution. V0 uses one shared alpha bearer token; rotate or revoke that token when an internal build leaks or expires.
- Extract shared packages only after real reuse pressure appears. Start with explicit contracts and focused tests before creating a broad core package.
- Gate actions such as takeover, interaction, and confirmation should surface as pause states in the app, not as hidden backend waits.
- Treat the customer API as a split of Open-AutoGLM `PhoneAgent`: the APK owns observation and execution, while the API owns decision, model calls, action parsing, and session state.
- Keep V0 session state in memory. Add database, queue, checkpoint, or durable history only after customer-story execution needs restart recovery, audit history, or multi-user concurrency.

## Decision Records

- **2026-06-13 customer-android-api-boundary**: Keep the customer-story hosted runtime in `apps/customer-android-api`.
  Status: Accepted
  Context: The customer route now has a distinct product boundary from the worker-backed Mac/ADB demo route.
  Decision: Pair `apps/customer-android` with a dedicated `apps/customer-android-api` service instead of extending `apps/worker` by default.
  Consequences: The customer implementation gains a clearer ownership boundary, and shared code must be extracted deliberately when both routes genuinely need it.

- **2026-06-13 customer-android-api-python-fastapi**: Build the first Customer Android API as Python/FastAPI.
  Status: Accepted
  Context: Open-AutoGLM's working prompt, model, and parser behavior already lives in Python, and the repository has a proven FastAPI worker shape.
  Decision: Use Python/FastAPI for `apps/customer-android-api` first.
  Consequences: The first Agent Engine can reuse more Open-AutoGLM behavior while avoiding an early TypeScript rewrite of the agent loop.

- **2026-06-13 customer-session-step-api**: Use a customer-specific session and step API for V0.
  Status: Accepted
  Context: The LangGraph Agent API shape is designed for AI SDK chat and graph streams, while phone automation needs a turn-by-turn loop around real phone actions.
  Decision: Use `POST /sessions` plus `POST /sessions/{session_id}/steps` as the first Customer Runtime Contract.
  Consequences: The APK can execute each action, capture the resulting phone state, and send that evidence into the next decision without adopting the LangGraph thread/run stream contract.

- **2026-06-13 customer-in-memory-session-store**: Keep V0 Customer Android API session state in process memory.
  Status: Accepted
  Context: The first implementation target is a runnable customer story, and durable persistence would add schema, migration, queueing, and recovery work before the core loop is proven.
  Decision: Store active V0 task sessions in the running `apps/customer-android-api` process.
  Consequences: API restart can fail active tasks explicitly. Durable task history, checkpoint resume, and audit storage remain later additions.

- **2026-06-13 customer-runtime-access-token**: Keep provider keys on the API and gate alpha APK access with a runtime token.
  Status: Accepted
  Context: The customer APK will be distributed directly from GitHub for internal alpha QA, and Android packages can be inspected after distribution.
  Decision: Store model-provider credentials only in `apps/customer-android-api` environment variables. Let the APK send an API URL and Runtime Access Token to the customer API.
  Consequences: Internal users can install an APK and run the end-to-end story without receiving provider keys. The runtime token remains revocable alpha access control, with per-user tokens, attestation, accounts, quotas, and audit controls deferred until needed.

## Update Triggers

- Update this file when the customer app/API ownership boundary changes.
- Update this file when the Customer Runtime Contract changes in a way that affects multiple subdomain docs.
- Update this file when model credential handling, pause handling, or shared package policy changes.
