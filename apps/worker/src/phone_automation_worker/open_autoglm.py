from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path

from phone_automation_worker.models import TaskEventInput, TaskRecord, TaskRunResult


class OpenAutoGlmRunner:
    def __init__(
        self,
        *,
        root: str | None,
        max_steps: int,
        device_id: str | None,
        lang: str,
        verbose: bool,
    ) -> None:
        self.max_steps = max_steps
        self.device_id = device_id
        self.lang = lang
        self.verbose = verbose
        self._prepare_import_path(root)

    @classmethod
    def from_env(cls) -> OpenAutoGlmRunner:
        return cls(
            root=os.getenv("OPEN_AUTOGLM_ROOT"),
            max_steps=int(os.getenv("PHONE_AGENT_MAX_STEPS", "12")),
            device_id=os.getenv("PHONE_AGENT_DEVICE_ID") or None,
            lang=os.getenv("PHONE_AGENT_LANG", "cn"),
            verbose=_env_bool("PHONE_AGENT_VERBOSE", default=False),
        )

    def run(self, task: TaskRecord) -> TaskRunResult:
        from phone_agent import PhoneAgent
        from phone_agent.agent import AgentConfig
        from phone_agent.model import ModelConfig

        agent = PhoneAgent(
            model_config=ModelConfig(
                base_url=os.getenv("PHONE_AGENT_BASE_URL", "http://localhost:8000/v1"),
                api_key=os.getenv("PHONE_AGENT_API_KEY", "EMPTY"),
                model_name=os.getenv("PHONE_AGENT_MODEL", "autoglm-phone-9b"),
                lang=self.lang,
            ),
            agent_config=AgentConfig(
                max_steps=self.max_steps,
                device_id=self.device_id,
                lang=self.lang,
                verbose=self.verbose,
            ),
        )

        summary = agent.run(task.instruction)
        status = "failed" if summary == "Max steps reached" else "finished"
        error = summary if status == "failed" else None

        return TaskRunResult(
            status=status,
            summary=summary,
            error=error,
            events=[
                TaskEventInput(
                    type="task.started",
                    message="Open-AutoGLM task started.",
                    payload={
                        "max_steps": self.max_steps,
                        "device_id": self.device_id,
                    },
                ),
                TaskEventInput(
                    type="task.finished" if status == "finished" else "task.failed",
                    message=summary,
                ),
            ],
        )

    def _prepare_import_path(self, root: str | None) -> None:
        if root:
            root_path = Path(root).expanduser().resolve()
            if not root_path.exists():
                raise RuntimeError(f"OPEN_AUTOGLM_ROOT does not exist: {root_path}")
            root_entry = str(root_path)
            if root_entry not in sys.path:
                sys.path.insert(0, root_entry)

        if importlib.util.find_spec("phone_agent") is None:
            raise RuntimeError(
                "Open-AutoGLM is not importable. Set OPEN_AUTOGLM_ROOT or install phone-agent into the worker environment."
            )


def _env_bool(name: str, *, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default

    return value.lower() in {"1", "true", "yes", "on"}
