---
title: Worker API
description: Public API and runtime modes for the Python Agent Runtime.
updateAt: 2026-06-09
---

# Worker API

## Scope

- Covers the first `apps/worker` FastAPI surface used by the Mobile Agent App.
- Main files: `apps/worker/src/phone_automation_worker/app.py`, `apps/worker/src/phone_automation_worker/runners.py`, `apps/worker/src/phone_automation_worker/open_autoglm.py`, and `apps/worker/src/phone_automation_worker/devices.py`.

## Domain Language

- **Worker API**: The public HTTP interface exposed by the Agent Runtime.
- **Runner Mode**: The explicit task execution mode selected through `PHONE_AUTOMATION_WORKER_RUNNER`.

## Current API

- `GET /healthz`: returns worker health.
- `POST /tasks`: creates a mobile-submitted task and schedules execution.
- `GET /tasks/{task_id}`: returns current task state.
- `GET /tasks/{task_id}/events`: returns normalized task events.
- `GET /devices`: returns devices visible to the configured device provider.

## Runtime Modes

- `PHONE_AUTOMATION_WORKER_RUNNER=unconfigured`: default. Task creation succeeds, then the task fails explicitly with a setup error.
- `PHONE_AUTOMATION_WORKER_RUNNER=dry-run`: explicit endpoint-verification mode. It completes tasks without touching a phone.
- `PHONE_AUTOMATION_WORKER_RUNNER=open-autoglm`: thin wrapper around the existing Open-AutoGLM `PhoneAgent.step()` path. It emits normalized step events, exposes the successful terminal finish message as `screen_summary`, fails unsupported confirmation or takeover gates without waiting for terminal input, and treats Open-AutoGLM terminal model errors as failed tasks.

The preferred local entry is the root package script, matching the LangGraph demo pattern: source root `.env` and `.env.local`, set any local defaults, then run the Python app under `apps/worker`. The worker also loads the repository root `.env` when run directly. Process environment variables take precedence over `.env` values. `PHONE_AUTOMATION_ENV_FILE` can point at a different env file when needed.

The default listener is `127.0.0.1:8765`. For a real Android phone on the same Wi-Fi network, use `pnpm dev:worker:open-autoglm:lan`; it sets `PHONE_AUTOMATION_WORKER_HOST=0.0.0.0` so the phone can reach the Mac through `http://<mac-lan-ip>:8765`. Keep that mode limited to a trusted local demo network.

`open-autoglm` mode uses:

- `OPEN_AUTOGLM_ROOT`: path to a local Open-AutoGLM checkout when `phone_agent` is not installed into the worker environment. The root `dev:worker:open-autoglm` script defaults this to `../Open-AutoGLM` for the current local workspace.
- `PHONE_AGENT_BASE_URL`, `PHONE_AGENT_MODEL`, `PHONE_AGENT_API_KEY`: OpenAI-compatible model configuration.
- `PHONE_AGENT_MAX_STEPS`: max Open-AutoGLM steps. Defaults to `12`.
- `PHONE_AGENT_DEVICE_ID`: optional ADB device id.
- `PHONE_AGENT_LANG`: Open-AutoGLM language setting. Defaults to `cn`.
- `PHONE_AGENT_VERBOSE`: verbose Open-AutoGLM logging flag. Defaults to false.
- `PHONE_AUTOMATION_WORKER_HOST`: HTTP bind host. Defaults to `127.0.0.1`.
- `PHONE_AUTOMATION_WORKER_PORT`: HTTP bind port. Defaults to `8765`.

## Device Provider

- `PHONE_AUTOMATION_DEVICE_PROVIDER=none`: no device probing. This is the default outside `open-autoglm` mode.
- `PHONE_AUTOMATION_DEVICE_PROVIDER=adb`: run `adb devices -l` and expose Android devices.
- `open-autoglm` mode defaults the device provider to `adb`.
- `ADB_PATH` can override the command name or path. Defaults to `adb`.

## Endpoint Verification

From the repository root:

```bash
pnpm test
```

To run the worker directly:

```bash
pnpm dev:worker:dry-run
```

To run against the already validated local Open-AutoGLM checkout:

```bash
pnpm dev:worker:open-autoglm
```

To run the same mode for a real phone on the LAN:

```bash
pnpm dev:worker:open-autoglm:lan
```

Then call the public endpoint:

```bash
curl -sS -X POST http://127.0.0.1:8765/tasks \
  -H 'Content-Type: application/json' \
  -d '{"instruction":"打开美团搜索附近的火锅店，不要下单，只停在搜索结果页","source":"mobile"}'
```

## Boundary Rules

- Tests should use HTTP endpoints and avoid reaching into worker internals.
- Dry-run mode must be explicit; it is for API verification only.
- Real phone control belongs in `open-autoglm` mode and should stay a thin wrapper until the first app-submitted QA story passes.
- Missing Open-AutoGLM root, unsupported runner mode, missing ADB, and device provider failures should fail explicitly.
- `open-autoglm` mode should expose recent action evidence through `step.action` and `step.result` events, plus terminal `screen_summary` when the task finishes successfully, without changing Open-AutoGLM internals.
- `open-autoglm` mode should emit `gate.confirmation_required` or `gate.takeover_required`, then fail the task, because the first mobile demo has no confirmation or takeover UI.

## Update Triggers

- Update this file when the Worker API changes.
- Update this file when a runner mode or device provider is added.
- Update this file when the direct endpoint verification command changes.
