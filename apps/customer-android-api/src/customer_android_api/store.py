from __future__ import annotations

from customer_android_api.models import (
    CustomerSessionSnapshot,
    CustomerTask,
    CustomerTaskEvent,
)


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, CustomerSessionSnapshot] = {}

    def create_session(self, *, instruction: str) -> CustomerSessionSnapshot:
        snapshot = CustomerSessionSnapshot(
            task=CustomerTask(instruction=instruction),
            events=[
                CustomerTaskEvent(
                    sequence=1,
                    type="task.started",
                    message="Task started.",
                )
            ],
            nextStepNumber=1,
        )
        self._sessions[snapshot.task.id] = snapshot
        return snapshot

    def get_session(self, session_id: str) -> CustomerSessionSnapshot | None:
        return self._sessions.get(session_id)

    def record_step_decision(
        self,
        *,
        session_id: str,
        step_number: int,
        action: dict[str, object],
    ) -> CustomerSessionSnapshot:
        snapshot = self._sessions[session_id]
        snapshot.nextStepNumber = step_number + 1
        snapshot.events.append(
            CustomerTaskEvent(
                sequence=self._next_sequence(snapshot),
                type="step.decided",
                message=self._step_decision_message(action),
                payload={"stepNumber": step_number, "action": action},
            )
        )
        self._apply_task_state(snapshot, step_number=step_number, action=action)
        return snapshot

    def _apply_task_state(
        self,
        snapshot: CustomerSessionSnapshot,
        *,
        step_number: int,
        action: dict[str, object],
    ) -> None:
        metadata = action.get("_metadata")
        if metadata == "finish":
            message = _string_value(action.get("message")) or "Task finished."
            snapshot.task.status = "finished"
            snapshot.task.summary = message
            snapshot.task.error = None
            self._append_event(
                snapshot,
                type="task.finished",
                message=message,
                step_number=step_number,
            )
            return

        if metadata == "failed":
            message = _string_value(action.get("message")) or "Task failed."
            snapshot.task.status = "failed"
            snapshot.task.summary = message
            snapshot.task.error = message
            self._append_event(
                snapshot,
                type="task.failed",
                message=message,
                step_number=step_number,
            )
            return

        pause_status = self._pause_status(action)
        if pause_status is not None:
            message = _pause_message(action, pause_status)
            snapshot.task.status = pause_status
            snapshot.task.summary = message
            snapshot.task.error = None
            self._append_event(
                snapshot,
                type="task.paused",
                message=message,
                step_number=step_number,
            )
            return

        snapshot.task.status = "running"
        snapshot.task.summary = None
        snapshot.task.error = None

    def _pause_status(self, action: dict[str, object]) -> str | None:
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

    def _append_event(
        self,
        snapshot: CustomerSessionSnapshot,
        *,
        type: str,
        message: str,
        step_number: int,
    ) -> None:
        snapshot.events.append(
            CustomerTaskEvent(
                sequence=self._next_sequence(snapshot),
                type=type,
                message=message,
                payload={"stepNumber": step_number},
            )
        )

    def _next_sequence(self, snapshot: CustomerSessionSnapshot) -> int:
        return len(snapshot.events) + 1

    def _step_decision_message(self, action: dict[str, object]) -> str:
        metadata = action.get("_metadata")
        if metadata == "finish" or metadata == "failed":
            return str(metadata)
        action_name = action.get("action")
        if isinstance(action_name, str):
            return action_name
        return "unknown"


def _pause_message(action: dict[str, object], pause_status: str) -> str:
    message = _string_value(action.get("message"))
    if message:
        return message
    if pause_status == "takeover_required":
        return "User takeover required."
    if pause_status == "interaction_required":
        return "User interaction required."
    return "User confirmation required."


def _string_value(value: object) -> str | None:
    return value if isinstance(value, str) and value else None
