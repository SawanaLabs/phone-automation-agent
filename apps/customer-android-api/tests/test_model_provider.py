import pytest

from customer_android_api.model_provider import (
    OpenAiCompatibleModelProvider,
    OpenAiModelSettings,
    ScriptedModelProvider,
    build_model_provider_from_env,
)


class FakeOpenAiClient:
    instances = []

    def __init__(self, *, base_url: str, api_key: str, timeout: float) -> None:
        self.base_url = base_url
        self.api_key = api_key
        self.timeout = timeout
        self.chat = FakeChat(FakeCompletionCreate('do(action="Back")'))
        self.instances.append(self)


class FakeChat:
    def __init__(self, completion_create: "FakeCompletionCreate") -> None:
        self.completions = FakeCompletions(completion_create)


class FakeCompletions:
    def __init__(self, completion_create: "FakeCompletionCreate") -> None:
        self.create = completion_create


class FakeCompletionCreate:
    def __init__(self, content: str) -> None:
        self.content = content
        self.calls = []

    def __call__(self, **kwargs):
        self.calls.append(kwargs)
        return FakeCompletionResponse(self.content)


class FakeCompletionResponse:
    def __init__(self, content: str) -> None:
        self.choices = [FakeChoice(content)]


class FakeChoice:
    def __init__(self, content: str) -> None:
        self.message = FakeMessage(content)


class FakeMessage:
    def __init__(self, content: str) -> None:
        self.content = content


def test_openai_compatible_model_provider_sends_messages_to_configured_model():
    completion_create = FakeCompletionCreate('do(action="Back")')
    provider = OpenAiCompatibleModelProvider(
        OpenAiModelSettings(
            base_url="https://model.example/v1",
            api_key="secret",
            model_name="autoglm-phone-9b",
        ),
        completion_create=completion_create,
    )

    output = provider.complete(
        {
            "messages": [
                {"role": "system", "content": "system"},
                {"role": "user", "content": [{"type": "text", "text": "task"}]},
            ],
        }
    )

    assert output == 'do(action="Back")'
    assert completion_create.calls == [
        {
            "messages": [
                {"role": "system", "content": "system"},
                {"role": "user", "content": [{"type": "text", "text": "task"}]},
            ],
            "model": "autoglm-phone-9b",
            "max_tokens": 3000,
            "temperature": 0.0,
            "top_p": 0.85,
            "frequency_penalty": 0.2,
            "stream": False,
        }
    ]


def test_openai_compatible_model_provider_configures_client_timeout(monkeypatch):
    FakeOpenAiClient.instances = []
    monkeypatch.setattr(
        "customer_android_api.model_provider.OpenAI",
        FakeOpenAiClient,
    )

    provider = OpenAiCompatibleModelProvider(
        OpenAiModelSettings(
            base_url="https://model.example/v1",
            api_key="secret",
            model_name="autoglm-phone-9b",
            timeout_seconds=45.0,
        )
    )

    assert provider.complete({"messages": [{"role": "user", "content": "task"}]}) == (
        'do(action="Back")'
    )
    assert len(FakeOpenAiClient.instances) == 1
    assert FakeOpenAiClient.instances[0].timeout == 45.0


def test_openai_compatible_model_provider_requires_messages():
    provider = OpenAiCompatibleModelProvider(
        OpenAiModelSettings(
            base_url="https://model.example/v1",
            api_key="secret",
            model_name="autoglm-phone-9b",
        ),
        completion_create=FakeCompletionCreate('do(action="Back")'),
    )

    with pytest.raises(RuntimeError, match="Model request messages are required."):
        provider.complete({"instruction": "检查当前页面"})


def test_model_provider_from_env_requires_openai_compatible_config(monkeypatch):
    monkeypatch.setenv("CUSTOMER_ANDROID_MODEL_PROVIDER", "openai-compatible")
    monkeypatch.delenv("CUSTOMER_ANDROID_MODEL_BASE_URL", raising=False)
    monkeypatch.delenv("CUSTOMER_ANDROID_MODEL_API_KEY", raising=False)
    monkeypatch.delenv("CUSTOMER_ANDROID_MODEL_NAME", raising=False)

    with pytest.raises(RuntimeError, match="CUSTOMER_ANDROID_MODEL_BASE_URL is required."):
        build_model_provider_from_env()


def test_model_provider_from_env_reads_openai_timeout(monkeypatch):
    monkeypatch.setenv("CUSTOMER_ANDROID_MODEL_PROVIDER", "openai-compatible")
    monkeypatch.setenv("CUSTOMER_ANDROID_MODEL_BASE_URL", "https://model.example/v1")
    monkeypatch.setenv("CUSTOMER_ANDROID_MODEL_API_KEY", "secret")
    monkeypatch.setenv("CUSTOMER_ANDROID_MODEL_NAME", "autoglm-phone-9b")
    monkeypatch.setenv("CUSTOMER_ANDROID_MODEL_TIMEOUT_SECONDS", "45.5")

    provider = build_model_provider_from_env()

    assert isinstance(provider, OpenAiCompatibleModelProvider)
    assert provider.settings.timeout_seconds == 45.5


def test_model_provider_from_env_resolves_bigmodel_endpoint_keyword(monkeypatch):
    monkeypatch.setenv("CUSTOMER_ANDROID_MODEL_PROVIDER", "openai-compatible")
    monkeypatch.setenv("CUSTOMER_ANDROID_MODEL_ENDPOINT", "bigmodel")
    monkeypatch.setenv("BIGMODEL_TOKEN", "secret")
    monkeypatch.setenv(
        "CUSTOMER_ANDROID_MODEL_BASE_URL",
        "https://api-inference.modelscope.cn/v1",
    )
    monkeypatch.delenv("CUSTOMER_ANDROID_MODEL_API_KEY", raising=False)
    monkeypatch.setenv("CUSTOMER_ANDROID_MODEL_NAME", "ZhipuAI/AutoGLM-Phone-9B")

    provider = build_model_provider_from_env()

    assert isinstance(provider, OpenAiCompatibleModelProvider)
    assert provider.settings.base_url == "https://open.bigmodel.cn/api/paas/v4"
    assert provider.settings.model_name == "autoglm-phone"
    assert provider.settings.api_key == "secret"


def test_model_provider_from_env_allows_explicit_bigmodel_endpoint_key(monkeypatch):
    monkeypatch.setenv("CUSTOMER_ANDROID_MODEL_PROVIDER", "openai-compatible")
    monkeypatch.setenv("CUSTOMER_ANDROID_MODEL_ENDPOINT", "bigmodel")
    monkeypatch.setenv("CUSTOMER_ANDROID_MODEL_API_KEY", "customer-secret")
    monkeypatch.setenv("BIGMODEL_TOKEN", "shared-secret")
    monkeypatch.delenv("CUSTOMER_ANDROID_MODEL_BASE_URL", raising=False)
    monkeypatch.delenv("CUSTOMER_ANDROID_MODEL_NAME", raising=False)

    provider = build_model_provider_from_env()

    assert isinstance(provider, OpenAiCompatibleModelProvider)
    assert provider.settings.api_key == "customer-secret"


def test_model_provider_from_env_rejects_unknown_endpoint_keyword(monkeypatch):
    monkeypatch.setenv("CUSTOMER_ANDROID_MODEL_PROVIDER", "openai-compatible")
    monkeypatch.setenv("CUSTOMER_ANDROID_MODEL_ENDPOINT", "unknown")
    monkeypatch.setenv("BIGMODEL_TOKEN", "secret")
    monkeypatch.delenv("CUSTOMER_ANDROID_MODEL_BASE_URL", raising=False)
    monkeypatch.delenv("CUSTOMER_ANDROID_MODEL_API_KEY", raising=False)
    monkeypatch.delenv("CUSTOMER_ANDROID_MODEL_NAME", raising=False)

    with pytest.raises(
        RuntimeError,
        match="Unsupported CUSTOMER_ANDROID_MODEL_ENDPOINT: unknown",
    ):
        build_model_provider_from_env()


@pytest.mark.parametrize(
    "placeholder",
    ["your-api-key", "<your-bigmodel-token>", "<your-modelscope-token>"],
)
def test_model_provider_from_env_rejects_placeholder_api_keys(
    monkeypatch,
    placeholder,
):
    monkeypatch.setenv("CUSTOMER_ANDROID_MODEL_PROVIDER", "openai-compatible")
    monkeypatch.setenv("CUSTOMER_ANDROID_MODEL_ENDPOINT", "bigmodel")
    monkeypatch.setenv("CUSTOMER_ANDROID_MODEL_API_KEY", placeholder)
    monkeypatch.delenv("BIGMODEL_TOKEN", raising=False)
    monkeypatch.delenv("CUSTOMER_ANDROID_MODEL_BASE_URL", raising=False)
    monkeypatch.delenv("CUSTOMER_ANDROID_MODEL_NAME", raising=False)

    with pytest.raises(RuntimeError, match="CUSTOMER_ANDROID_MODEL_API_KEY is required."):
        build_model_provider_from_env()


def test_model_provider_from_env_defaults_to_scripted_provider(monkeypatch):
    monkeypatch.delenv("CUSTOMER_ANDROID_MODEL_PROVIDER", raising=False)
    monkeypatch.delenv("CUSTOMER_ANDROID_MODEL_BASE_URL", raising=False)
    monkeypatch.delenv("CUSTOMER_ANDROID_MODEL_API_KEY", raising=False)
    monkeypatch.delenv("CUSTOMER_ANDROID_MODEL_NAME", raising=False)

    provider = build_model_provider_from_env()

    assert isinstance(provider, ScriptedModelProvider)
    assert provider.complete({"instruction": "检查当前页面"}) == (
        'finish(message="Finished customer task: 检查当前页面")'
    )
