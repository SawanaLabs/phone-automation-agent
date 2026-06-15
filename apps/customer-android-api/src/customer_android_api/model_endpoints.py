from __future__ import annotations

import os
from dataclasses import dataclass
from collections.abc import Mapping


PLACEHOLDER_API_KEYS = {
    "your-api-key",
    "<your-bigmodel-token>",
    "<your-modelscope-token>",
}


@dataclass(frozen=True)
class ModelEndpointPreset:
    base_url: str
    model_name: str
    api_key_env_names: tuple[str, ...]


@dataclass(frozen=True)
class ResolvedModelEndpoint:
    base_url: str
    api_key: str
    model_name: str


MODEL_ENDPOINT_PRESETS: dict[str, ModelEndpointPreset] = {
    "bigmodel": ModelEndpointPreset(
        base_url="https://open.bigmodel.cn/api/paas/v4",
        model_name="autoglm-phone",
        api_key_env_names=(
            "CUSTOMER_ANDROID_MODEL_API_KEY",
            "BIGMODEL_TOKEN",
            "BIGMODEL_API_KEY",
            "ZHIPUAI_API_KEY",
        ),
    ),
}

MODEL_ENDPOINT_ALIASES: dict[str, str] = {
    "bigmodel": "bigmodel",
    "zhipu": "bigmodel",
    "zhipuai": "bigmodel",
}


def resolve_model_endpoint_from_env(
    *,
    env: Mapping[str, str] | None = None,
) -> ResolvedModelEndpoint:
    values = os.environ if env is None else env
    endpoint_keyword = _clean(values.get("CUSTOMER_ANDROID_MODEL_ENDPOINT"))
    preset = _preset_for_keyword(
        endpoint_keyword,
        env_name="CUSTOMER_ANDROID_MODEL_ENDPOINT",
    )
    base_url = preset.base_url if preset else _required_explicit_value(
        values.get("CUSTOMER_ANDROID_MODEL_BASE_URL"),
        env_name="CUSTOMER_ANDROID_MODEL_BASE_URL",
    )
    model_name = preset.model_name if preset else _required_explicit_value(
        values.get("CUSTOMER_ANDROID_MODEL_NAME"),
        env_name="CUSTOMER_ANDROID_MODEL_NAME",
    )

    return ResolvedModelEndpoint(
        base_url=base_url,
        api_key=_resolve_api_key(
            values=values,
            explicit_env_name="CUSTOMER_ANDROID_MODEL_API_KEY",
            preset=preset,
        ),
        model_name=model_name,
    )


def _preset_for_keyword(
    endpoint_keyword: str | None,
    *,
    env_name: str,
) -> ModelEndpointPreset | None:
    if endpoint_keyword is None:
        return None

    preset_key = MODEL_ENDPOINT_ALIASES.get(endpoint_keyword.lower())
    if preset_key is None:
        supported = ", ".join(sorted(MODEL_ENDPOINT_PRESETS))
        raise RuntimeError(
            f"Unsupported {env_name}: {endpoint_keyword}. Supported: {supported}."
        )
    return MODEL_ENDPOINT_PRESETS[preset_key]


def _required_explicit_value(value: str | None, *, env_name: str) -> str:
    value = _clean(value)
    if value is None:
        raise RuntimeError(f"{env_name} is required.")
    return value


def _resolve_api_key(
    *,
    values: Mapping[str, str],
    explicit_env_name: str,
    preset: ModelEndpointPreset | None,
) -> str:
    env_names = [explicit_env_name]
    if preset is not None:
        env_names.extend(
            env_name for env_name in preset.api_key_env_names if env_name != explicit_env_name
        )

    for env_name in env_names:
        value = _clean(values.get(env_name))
        if value is None:
            continue
        if value in PLACEHOLDER_API_KEYS:
            raise RuntimeError(f"{env_name} is required.")
        return value

    raise RuntimeError(f"{explicit_env_name} is required.")


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None
