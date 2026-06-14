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

Optional API env:

- `CUSTOMER_ANDROID_API_HOST` defaults to `127.0.0.1`.
- `CUSTOMER_ANDROID_API_PORT` defaults to `8787`.
- `CUSTOMER_ANDROID_API_MAX_STEPS` defaults to `50`.

Provider selection:

- `CUSTOMER_ANDROID_MODEL_PROVIDER=scripted` is the default deterministic QA mode.
- `CUSTOMER_ANDROID_MODEL_PROVIDER=openai-compatible` calls a configured
  OpenAI-format chat completion endpoint.

Scripted provider env:

- `CUSTOMER_ANDROID_SCRIPTED_ACTIONS_JSON` is optional. When set, it must be a
  JSON array of Open-AutoGLM action strings, one per step.

OpenAI-compatible provider env:

- `CUSTOMER_ANDROID_MODEL_ENDPOINT=bigmodel`
- `BIGMODEL_TOKEN`

Custom OpenAI-compatible endpoint env. Leave `CUSTOMER_ANDROID_MODEL_ENDPOINT`
unset when using these:

- `CUSTOMER_ANDROID_MODEL_BASE_URL`
- `CUSTOMER_ANDROID_MODEL_API_KEY`
- `CUSTOMER_ANDROID_MODEL_NAME`

`CUSTOMER_ANDROID_MODEL_ENDPOINT=bigmodel` resolves in code to
`https://open.bigmodel.cn/api/paas/v4` and `autoglm-phone`. Add new endpoint
keywords in `customer_android_api/model_endpoints.py` when another provider is
intentionally supported.

See `docs/customer-android/agent-engine.md` for the runtime contract and agent context behavior.
