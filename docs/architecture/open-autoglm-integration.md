---
title: Open-AutoGLM Integration
description: Durable integration boundaries for using Open-AutoGLM as the first automation engine.
updateAt: 2026-06-10
---

# Open-AutoGLM Integration

## Scope

- Covers how `apps/worker` should use `zai-org/Open-AutoGLM` during the Demo Build.
- Applies to Python environment, task execution, event normalization, and integration tests.

## Domain Language

- **Thin Worker Wrapper**: The worker calls existing Open-AutoGLM behavior through a small adapter and exposes project-level task events.
- **Automation Engine**: The Open-AutoGLM loop that screenshots the phone, asks the model for an action, executes the action, and repeats until finish or failure.

## Current Integration Direction

- Use the existing Open-AutoGLM code path directly for the first demo.
- Avoid heavy edits to the upstream framework unless a concrete demo blocker appears.
- Wrap the automation loop at the worker boundary so `apps/mobile` sees stable task state and events rather than Open-AutoGLM internals.
- The current worker wrapper lives in `apps/worker/src/phone_automation_worker/open_autoglm.py` and calls `PhoneAgent.step()` after preparing the import path and model/agent config.
- The wrapper normalizes Open-AutoGLM step results into task events, exposes successful finish messages as terminal `screen_summary`, and fails unsupported confirmation or takeover gates without waiting for terminal input.
- The local Open-AutoGLM checkout at `/Users/openclaw/projects/Playground/Open-AutoGLM` is the external baseline for raw Android quickstart reproduction.
- The first known-good real task remains `打开美团搜索附近的火锅店，不要下单，只停在搜索结果页`.
- Prefer the current ModelScope hosted route for the demo: `PHONE_AGENT_BASE_URL=https://api-inference.modelscope.cn/v1` and `PHONE_AGENT_MODEL=ZhipuAI/AutoGLM-Phone-9B`, with the secret token kept in `.env`.
- The ModelScope route needs a temporary Android logical display override because native `1344x2772` screenshots exceed the endpoint input size limit. Use `adb shell wm size 992x2048` before the run and `adb shell wm size reset` afterward.
- The older BigModel `autoglm-phone` route is a historical success baseline, but hosted model behavior can drift. If it rejects `image_url` with `messages.content.type 参数非法，取值范围 ['text']`, treat that as a provider-route issue first and rerun the raw Open-AutoGLM handoff before blaming the worker.
- Keep model and device setup explicit: missing API key, unreachable model endpoint, missing ADB device, missing ADB keyboard, or unsupported app mapping should fail clearly.
- Keep secrets in env files and do not print or commit API keys.

## External Baselines

- `/Users/openclaw/projects/Playground/Open-AutoGLM/HANDOFF-android-quickstart-success.md`: historical BigModel quickstart notes. Useful for understanding the original successful `autoglm-phone` path and device setup.
- `/Users/openclaw/projects/Playground/Open-AutoGLM/HANDOFF-android-modelscope-quickstart-success.md`: current ModelScope quickstart notes. Use this when reproducing the working hosted route outside this monorepo.
- Do not copy the handoff contents into this repo unless the workflow becomes owned here. Link or reference them so future agents know which external baseline to check.

## Worker Shape Inspired By `apps/langgraph-agent-api`

- A small Python API app can live cleanly inside a pnpm monorepo.
- `pyproject.toml` plus `uv.lock` should be the Python dependency source of truth.
- Pydantic request and response models should define the task protocol.
- Focused tests should lock down the API contract, auth/config failure behavior, and event formatting.
- Vercel-specific FastAPI deployment details from that repo do not apply to the first worker because this worker needs direct Mac ADB access.

## Event Normalization

The worker should translate Open-AutoGLM progress into project-level events such as:

- `task.created`
- `task.started`
- `step.screenshot`
- `step.action`
- `step.result`
- `gate.confirmation_required`
- `gate.takeover_required`
- `task.finished`
- `task.failed`

## Extraction Boundary

- Do not start by extracting `packages/phone-agent-core`.
- Reconsider extraction after the first app-submitted QA story passes and duplication or adapter pressure is visible.
- If extraction becomes necessary, keep the core automation loop separate from the FastAPI orchestration layer.

## Update Triggers

- Update this file when the worker integration approach changes.
- Update this file when Open-AutoGLM requires local patches.
- Update this file when the normalized event set changes.
