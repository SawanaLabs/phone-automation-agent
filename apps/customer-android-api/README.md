# Customer Android API

FastAPI Session-Step API for the customer Android APK.

## Development

```sh
pnpm --dir apps/customer-android-api test
pnpm --dir apps/customer-android-api typecheck
pnpm dev:customer-android-api:lan
```

Required runtime env:

- `CUSTOMER_ANDROID_API_ACCESS_TOKEN`

Provider selection:

- `CUSTOMER_ANDROID_MODEL_PROVIDER=scripted` is the default deterministic QA mode.
- `CUSTOMER_ANDROID_MODEL_PROVIDER=openai-compatible` calls a configured
  OpenAI-format chat completion endpoint.

Scripted provider env:

- `CUSTOMER_ANDROID_SCRIPTED_ACTIONS_JSON` is optional. When set, it must be a
  JSON array of Open-AutoGLM action strings, one per step.

OpenAI-compatible provider env:

- `CUSTOMER_ANDROID_MODEL_BASE_URL`
- `CUSTOMER_ANDROID_MODEL_API_KEY`
- `CUSTOMER_ANDROID_MODEL_NAME`

See `docs/customer-android/agent-engine.md` for the runtime contract and agent context behavior.
