from __future__ import annotations

import json
import os
from dataclasses import dataclass
from collections.abc import Sequence
from typing import Any, Callable

from openai import OpenAI

from customer_android_api.model_endpoints import resolve_model_endpoint_from_env


CompletionCreate = Callable[..., Any]


@dataclass(frozen=True)
class OpenAiModelSettings:
    base_url: str
    api_key: str
    model_name: str
    max_tokens: int = 3000
    timeout_seconds: float = 60.0
    temperature: float = 0.0
    top_p: float = 0.85
    frequency_penalty: float = 0.2


class OpenAiCompatibleModelProvider:
    def __init__(
        self,
        settings: OpenAiModelSettings,
        *,
        completion_create: CompletionCreate | None = None,
    ) -> None:
        self._settings = settings
        if completion_create is None:
            client = OpenAI(
                base_url=settings.base_url,
                api_key=settings.api_key,
                timeout=settings.timeout_seconds,
            )
            completion_create = client.chat.completions.create
        self._completion_create = completion_create

    @property
    def settings(self) -> OpenAiModelSettings:
        return self._settings

    def complete(self, request: dict[str, object]) -> str:
        messages = request.get("messages")
        if not isinstance(messages, list) or not messages:
            raise RuntimeError("Model request messages are required.")

        response = self._completion_create(
            messages=messages,
            model=self._settings.model_name,
            max_tokens=self._settings.max_tokens,
            temperature=self._settings.temperature,
            top_p=self._settings.top_p,
            frequency_penalty=self._settings.frequency_penalty,
            stream=False,
        )
        return _extract_message_content(response)


class ScriptedModelProvider:
    def __init__(self, actions: Sequence[str] | None = None) -> None:
        self._actions = list(actions or [])

    def complete(self, request: dict[str, object]) -> str:
        if self._actions:
            step_number = request.get("stepNumber")
            if isinstance(step_number, int) and 1 <= step_number <= len(self._actions):
                return self._actions[step_number - 1]

        instruction = request.get("instruction")
        return f'finish(message="Finished customer task: {instruction}")'


def build_model_provider_from_env() -> OpenAiCompatibleModelProvider | ScriptedModelProvider:
    provider = os.getenv("CUSTOMER_ANDROID_MODEL_PROVIDER", "scripted").strip().lower()
    if provider == "scripted":
        return ScriptedModelProvider(load_scripted_actions_from_env())
    if provider in {"openai-compatible", "openai"}:
        return OpenAiCompatibleModelProvider(load_openai_model_settings_from_env())

    raise RuntimeError(
        "CUSTOMER_ANDROID_MODEL_PROVIDER must be scripted or openai-compatible."
    )


def load_scripted_actions_from_env() -> list[str]:
    value = os.getenv("CUSTOMER_ANDROID_SCRIPTED_ACTIONS_JSON")
    if value is None or not value.strip():
        return []

    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as error:
        raise RuntimeError("CUSTOMER_ANDROID_SCRIPTED_ACTIONS_JSON must be valid JSON.") from error

    if not isinstance(parsed, list) or not all(
        isinstance(item, str) and item.strip() for item in parsed
    ):
        raise RuntimeError(
            "CUSTOMER_ANDROID_SCRIPTED_ACTIONS_JSON must be a JSON array of non-empty strings."
        )

    return [item.strip() for item in parsed]


def load_openai_model_settings_from_env() -> OpenAiModelSettings:
    endpoint = resolve_model_endpoint_from_env()
    return OpenAiModelSettings(
        base_url=endpoint.base_url,
        api_key=endpoint.api_key,
        model_name=endpoint.model_name,
        max_tokens=_env_int("CUSTOMER_ANDROID_MODEL_MAX_TOKENS", 3000),
        timeout_seconds=_env_float("CUSTOMER_ANDROID_MODEL_TIMEOUT_SECONDS", 60.0),
        temperature=_env_float("CUSTOMER_ANDROID_MODEL_TEMPERATURE", 0.0),
        top_p=_env_float("CUSTOMER_ANDROID_MODEL_TOP_P", 0.85),
        frequency_penalty=_env_float(
            "CUSTOMER_ANDROID_MODEL_FREQUENCY_PENALTY",
            0.2,
        ),
    )


def _extract_message_content(response: Any) -> str:
    try:
        content = response.choices[0].message.content
    except (AttributeError, IndexError) as error:
        raise RuntimeError("Model response did not include a message.") from error

    if isinstance(content, str) and content.strip():
        return content

    raise RuntimeError("Model response content is empty.")


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None or not value.strip():
        return default
    try:
        parsed = int(value)
    except ValueError as error:
        raise RuntimeError(f"{name} must be an integer: {value}") from error
    if parsed <= 0:
        raise RuntimeError(f"{name} must be positive: {parsed}")
    return parsed


def _env_float(name: str, default: float) -> float:
    value = os.getenv(name)
    if value is None or not value.strip():
        return default
    try:
        return float(value)
    except ValueError as error:
        raise RuntimeError(f"{name} must be a number: {value}") from error
