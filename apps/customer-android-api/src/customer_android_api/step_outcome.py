from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Literal

from customer_android_api.models import SessionStatus

StepOutcomeKind = Literal["routine", "finish", "failed", "pause"]


@dataclass(frozen=True)
class StepOutcome:
    kind: StepOutcomeKind
    decision_message: str
    task_status: SessionStatus
    task_summary: str | None
    task_error: str | None
    task_event_type: str | None
    task_event_message: str | None


def classify_step_outcome(action: Mapping[str, object]) -> StepOutcome:
    metadata = action.get("_metadata")
    if metadata == "finish":
        message = _string_value(action.get("message")) or "Task finished."
        return StepOutcome(
            kind="finish",
            decision_message="finish",
            task_status="finished",
            task_summary=message,
            task_error=None,
            task_event_type="task.finished",
            task_event_message=message,
        )

    if metadata == "failed":
        message = _string_value(action.get("message")) or "Task failed."
        return StepOutcome(
            kind="failed",
            decision_message="failed",
            task_status="failed",
            task_summary=message,
            task_error=message,
            task_event_type="task.failed",
            task_event_message=message,
        )

    pause_status = _pause_status(action)
    if pause_status is not None:
        message = _pause_message(action, pause_status)
        return StepOutcome(
            kind="pause",
            decision_message=_routine_action_name(action),
            task_status=pause_status,
            task_summary=message,
            task_error=None,
            task_event_type="task.paused",
            task_event_message=message,
        )

    return StepOutcome(
        kind="routine",
        decision_message=_routine_action_name(action),
        task_status="running",
        task_summary=None,
        task_error=None,
        task_event_type=None,
        task_event_message=None,
    )


def _pause_status(action: Mapping[str, object]) -> SessionStatus | None:
    if action.get("_metadata") != "do":
        return None

    action_name = action.get("action")
    if action_name == "Take_over":
        return "takeover_required"
    if action_name == "Interact":
        return "interaction_required"
    if action_name == "Tap" and action.get("message") is not None:
        return "confirmation_required"
    return None


def _pause_message(action: Mapping[str, object], pause_status: str) -> str:
    message = _string_value(action.get("message"))
    if message:
        return message
    if pause_status == "takeover_required":
        return "User takeover required."
    if pause_status == "interaction_required":
        return "User interaction required."
    return "User confirmation required."


def _routine_action_name(action: Mapping[str, object]) -> str:
    action_name = action.get("action")
    if isinstance(action_name, str):
        return action_name
    return "unknown"


def _string_value(value: object) -> str | None:
    return value if isinstance(value, str) and value else None
