from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8787
DEFAULT_MAX_STEPS = 50


@dataclass(frozen=True)
class CustomerAndroidApiSettings:
    runtime_access_token: str
    host: str = DEFAULT_HOST
    port: int = DEFAULT_PORT
    max_steps: int = DEFAULT_MAX_STEPS


def load_settings(
    *,
    load_env: bool = True,
    runtime_token_override: str | None = None,
    max_steps_override: int | None = None,
) -> CustomerAndroidApiSettings:
    if load_env:
        load_project_env()

    return CustomerAndroidApiSettings(
        runtime_access_token=_required_runtime_access_token(runtime_token_override),
        host=_host(),
        port=_port(),
        max_steps=_max_steps(max_steps_override),
    )


def load_project_env() -> Path | None:
    explicit_env_file = os.getenv("CUSTOMER_ANDROID_API_ENV_FILE") or os.getenv(
        "PHONE_AUTOMATION_ENV_FILE"
    )
    if explicit_env_file:
        env_path = Path(explicit_env_file).expanduser()
        if not env_path.exists():
            raise RuntimeError(
                f"CUSTOMER_ANDROID_API_ENV_FILE does not exist: {env_path}"
            )
        load_dotenv(env_path, override=False)
        return env_path

    repo_root = find_repo_root(Path.cwd())
    if repo_root is None:
        return None

    env_path = repo_root / ".env"
    if not env_path.exists():
        return None

    load_dotenv(env_path, override=False)
    return env_path


def find_repo_root(start: Path) -> Path | None:
    current = start.resolve()

    for candidate in [current, *current.parents]:
        if (candidate / "pnpm-workspace.yaml").exists():
            return candidate

    return None


def _required_runtime_access_token(runtime_token_override: str | None) -> str:
    value = (
        runtime_token_override
        if runtime_token_override is not None
        else os.getenv("CUSTOMER_ANDROID_API_ACCESS_TOKEN")
    )
    if value is None or not value.strip():
        raise RuntimeError("CUSTOMER_ANDROID_API_ACCESS_TOKEN is required.")

    return value.strip()


def _host() -> str:
    value = os.getenv("CUSTOMER_ANDROID_API_HOST", DEFAULT_HOST).strip()
    return value or DEFAULT_HOST


def _port() -> int:
    value = os.getenv("CUSTOMER_ANDROID_API_PORT", str(DEFAULT_PORT)).strip()
    try:
        port = int(value)
    except ValueError as error:
        raise RuntimeError(
            f"CUSTOMER_ANDROID_API_PORT must be an integer: {value}"
        ) from error

    if port <= 0:
        raise RuntimeError(f"CUSTOMER_ANDROID_API_PORT must be positive: {port}")

    return port


def _max_steps(max_steps_override: int | None) -> int:
    if max_steps_override is not None:
        max_steps = max_steps_override
    else:
        value = os.getenv(
            "CUSTOMER_ANDROID_API_MAX_STEPS",
            str(DEFAULT_MAX_STEPS),
        ).strip()
        try:
            max_steps = int(value)
        except ValueError as error:
            raise RuntimeError(
                f"CUSTOMER_ANDROID_API_MAX_STEPS must be an integer: {value}"
            ) from error

    if max_steps <= 0:
        raise RuntimeError(
            f"CUSTOMER_ANDROID_API_MAX_STEPS must be positive: {max_steps}"
        )

    return max_steps
