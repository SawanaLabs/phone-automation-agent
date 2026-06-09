from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv


def load_project_env() -> Path | None:
    explicit_env_file = os.getenv("PHONE_AUTOMATION_ENV_FILE")
    if explicit_env_file:
        env_path = Path(explicit_env_file).expanduser()
        if not env_path.exists():
            raise RuntimeError(f"PHONE_AUTOMATION_ENV_FILE does not exist: {env_path}")
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
