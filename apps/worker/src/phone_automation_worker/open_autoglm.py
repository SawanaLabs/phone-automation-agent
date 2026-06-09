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
        base_url: str | None,
        api_key: str | None,
        model_name: str | None,
    ) -> None:
        self.max_steps = max_steps
        self.device_id = device_id
        self.lang = lang
        self.verbose = verbose
        self._prepare_import_path(root)
        self.base_url = _required_value("PHONE_AGENT_BASE_URL", base_url)
        self.api_key = _required_value(
            "PHONE_AGENT_API_KEY",
            api_key,
            forbidden_values={"EMPTY", "your-api-key"},
        )
        self.model_name = _required_value("PHONE_AGENT_MODEL", model_name)

    @classmethod
    def from_env(cls) -> OpenAutoGlmRunner:
        return cls(
            root=os.getenv("OPEN_AUTOGLM_ROOT"),
            max_steps=int(os.getenv("PHONE_AGENT_MAX_STEPS", "12")),
            device_id=os.getenv("PHONE_AGENT_DEVICE_ID") or None,
            lang=os.getenv("PHONE_AGENT_LANG", "cn"),
            verbose=_env_bool("PHONE_AGENT_VERBOSE", default=False),
            base_url=os.getenv("PHONE_AGENT_BASE_URL"),
            api_key=os.getenv("PHONE_AGENT_API_KEY"),
            model_name=os.getenv("PHONE_AGENT_MODEL"),
        )

    def run(self, task: TaskRecord) -> TaskRunResult:
        from phone_agent import PhoneAgent
        from phone_agent.agent import AgentConfig
        from phone_agent.model import ModelConfig

        agent = PhoneAgent(
            model_config=ModelConfig(
                base_url=self.base_url,
                api_key=self.api_key,
                model_name=self.model_name,
                lang=self.lang,
            ),
            agent_config=AgentConfig(
                max_steps=self.max_steps,
                device_id=self.device_id,
                lang=self.lang,
                verbose=self.verbose,
            ),
            confirmation_callback=_decline_confirmation,
            takeover_callback=_acknowledge_takeover,
        )

        events: list[TaskEventInput] = []

        for step in range(1, self.max_steps + 1):
            result = agent.step(task.instruction if step == 1 else None)
            gate_event = _gate_event(
                action=result.action,
                step=step,
                thinking=result.thinking,
            )
            if gate_event is not None:
                summary = gate_event.message or "Manual gate is not supported."
                events.append(gate_event)
                events.append(
                    _terminal_event(
                        status="failed",
                        summary=summary,
                        max_steps=self.max_steps,
                        device_id=self.device_id,
                        step_count=step,
                        success=False,
                        action=result.action,
                        thinking=result.thinking,
                    )
                )
                return TaskRunResult(
                    status="failed",
                    summary=summary,
                    error=summary,
                    events=events,
                )

            if result.finished:
                summary = result.message or "Task completed"
                status = (
                    "failed"
                    if not result.success or _is_failure_summary(summary)
                    else "finished"
                )
                error = summary if status == "failed" else None
                events.append(
                    _terminal_event(
                        status=status,
                        summary=summary,
                        max_steps=self.max_steps,
                        device_id=self.device_id,
                        step_count=step,
                        success=result.success,
                        action=result.action,
                        thinking=result.thinking,
                    )
                )

                return TaskRunResult(
                    status=status,
                    summary=summary,
                    error=error,
                    events=events,
                )

            if result.action is not None:
                events.append(
                    TaskEventInput(
                        type="step.action",
                        message=_describe_action(result.action),
                        payload={
                            "step": step,
                            "action": result.action,
                            "thinking": result.thinking,
                        },
                    )
                )

            events.append(
                TaskEventInput(
                    type="step.result",
                    message=result.message,
                    payload={
                        "step": step,
                        "success": result.success,
                        "finished": result.finished,
                        "message": result.message,
                    },
                )
            )

        summary = "Max steps reached"
        status = "failed"
        return TaskRunResult(
            status=status,
            summary=summary,
            error=summary,
            events=[
                *events,
                _terminal_event(
                    status=status,
                    summary=summary,
                    max_steps=self.max_steps,
                    device_id=self.device_id,
                    step_count=self.max_steps,
                    success=False,
                    action=None,
                    thinking="",
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


def _required_value(
    name: str,
    value: str | None,
    *,
    forbidden_values: set[str] | None = None,
) -> str:
    if value is None or not value.strip():
        raise RuntimeError(f"{name} is required for Open-AutoGLM runner mode.")

    normalized = value.strip()
    if forbidden_values and normalized in forbidden_values:
        raise RuntimeError(f"{name} is required for Open-AutoGLM runner mode.")

    return normalized


def _is_failure_summary(summary: str) -> bool:
    return summary == "Max steps reached" or summary.startswith("Model error:")


def _decline_confirmation(message: str) -> bool:
    return False


def _acknowledge_takeover(message: str) -> None:
    return None


def _gate_event(
    *,
    action: dict | None,
    step: int,
    thinking: str,
) -> TaskEventInput | None:
    if action is None:
        return None

    if action.get("_metadata") != "do":
        return None

    action_name = action.get("action")
    message = str(action.get("message") or "Manual intervention required")

    if action_name == "Take_over":
        return TaskEventInput(
            type="gate.takeover_required",
            message=f"Manual takeover is not supported: {message}",
            payload={
                "step": step,
                "action": action,
                "message": message,
                "thinking": thinking,
            },
        )

    if action_name == "Tap" and action.get("message"):
        return TaskEventInput(
            type="gate.confirmation_required",
            message=f"Sensitive confirmation is not supported: {message}",
            payload={
                "step": step,
                "action": action,
                "message": message,
                "thinking": thinking,
            },
        )

    return None


def _terminal_event(
    *,
    status: str,
    summary: str,
    max_steps: int,
    device_id: str | None,
    step_count: int,
    success: bool,
    action: dict | None,
    thinking: str,
) -> TaskEventInput:
    return TaskEventInput(
        type="task.finished" if status == "finished" else "task.failed",
        message=summary,
        payload={
            "max_steps": max_steps,
            "device_id": device_id,
            "step_count": step_count,
            "success": success,
            "screen_summary": summary if status == "finished" else None,
            "action": action,
            "thinking": thinking,
        },
    )


def _describe_action(action: dict) -> str:
    action_type = action.get("_metadata")
    action_name = action.get("action")
    if action_name:
        return f"{action_type}: {action_name}"
    return str(action_type)
