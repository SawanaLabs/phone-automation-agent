# Phone Automation Worker

Python FastAPI Agent Runtime for the first mobile phone automation demo.

## Run

```bash
uv run uvicorn 'phone_automation_worker.app:create_app' --factory --host 127.0.0.1 --port 8765
```

The default runner is `unconfigured`; tasks fail explicitly until a runner mode is selected.
The worker loads the repository root `.env` on startup. Do not commit secrets.

From the repository root, prefer:

```bash
pnpm dev:worker:dry-run
pnpm dev:worker:open-autoglm
```

For endpoint verification without controlling a phone from this directory:

```bash
PHONE_AUTOMATION_WORKER_RUNNER=dry-run uv run uvicorn 'phone_automation_worker.app:create_app' --factory --host 127.0.0.1 --port 8765
```

For the Open-AutoGLM wrapper:

```bash
PHONE_AUTOMATION_WORKER_RUNNER=open-autoglm \
OPEN_AUTOGLM_ROOT=/Users/openclaw/projects/Playground/Open-AutoGLM \
uv run uvicorn 'phone_automation_worker.app:create_app' --factory --host 127.0.0.1 --port 8765
```

Model configuration uses the existing `PHONE_AGENT_BASE_URL`, `PHONE_AGENT_MODEL`, and `PHONE_AGENT_API_KEY` environment variables. `OPEN_AUTOGLM_ROOT` is required unless `phone_agent` is already installed into the worker environment.

## Test

```bash
uv run pytest -q
```
