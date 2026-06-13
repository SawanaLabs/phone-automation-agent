import pytest

from customer_android_api.model_provider import (
    OpenAiCompatibleModelProvider,
    OpenAiModelSettings,
    ScriptedModelProvider,
    build_model_provider_from_env,
)


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
        }
    ]


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
