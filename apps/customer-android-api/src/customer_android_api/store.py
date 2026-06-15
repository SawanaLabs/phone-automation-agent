from __future__ import annotations

from customer_android_api.models import (
    CustomerSessionSnapshot,
    CustomerTask,
    CustomerTaskEvent,
)
from customer_android_api.step_outcome import classify_step_outcome


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
        outcome = classify_step_outcome(action)
        snapshot.task.status = outcome.task_status
        snapshot.task.summary = outcome.task_summary
        snapshot.task.error = outcome.task_error
        if (
            outcome.task_event_type is not None
            and outcome.task_event_message is not None
        ):
            self._append_event(
                snapshot,
                type=outcome.task_event_type,
                message=outcome.task_event_message,
                step_number=step_number,
            )

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
        return classify_step_outcome(action).decision_message
