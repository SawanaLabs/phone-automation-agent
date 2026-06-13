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
