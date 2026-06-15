from __future__ import annotations

from datetime import UTC, datetime
from threading import RLock

from phone_automation_worker.models import (
    TaskEvent,
    TaskEventInput,
    TaskRecord,
    TaskStatus,
)

ACTIVE_TASK_STATUSES: set[TaskStatus] = {
    "created",
    "running",
    "confirmation_required",
    "takeover_required",
}


class TaskStore:
    def __init__(self) -> None:
        self._tasks: dict[str, TaskRecord] = {}
        self._events: dict[str, list[TaskEvent]] = {}
        self._lock = RLock()

    def create_task(self, *, instruction: str, source: str) -> TaskRecord:
        task = TaskRecord(instruction=instruction, source=source)

        with self._lock:
            return self._create_task_locked(task, source)

    def create_task_if_idle(
        self, *, instruction: str, source: str
    ) -> TaskRecord | None:
        task = TaskRecord(instruction=instruction, source=source)

        with self._lock:
            if any(
                existing.status in ACTIVE_TASK_STATUSES
                for existing in self._tasks.values()
            ):
                return None

            return self._create_task_locked(task, source)

    def _create_task_locked(self, task: TaskRecord, source: str) -> TaskRecord:
        self._tasks[task.id] = task
        self._events[task.id] = []
        self.append_event(
            task.id,
            TaskEventInput(
                type="task.created",
                message="Task created.",
                payload={
                    "source": source,
                },
            ),
        )

        return task.model_copy(deep=True)

    def get_task(self, task_id: str) -> TaskRecord | None:
        with self._lock:
            task = self._tasks.get(task_id)
            return task.model_copy(deep=True) if task else None

    def list_events(self, task_id: str) -> list[TaskEvent] | None:
        with self._lock:
            events = self._events.get(task_id)
            return (
                [event.model_copy(deep=True) for event in events]
                if events is not None
                else None
            )

    def mark_running(self, task_id: str) -> None:
        self.update_task(task_id, status="running")

    def complete_task(
        self,
        task_id: str,
        *,
        status: TaskStatus,
        summary: str | None = None,
        error: str | None = None,
    ) -> None:
        self.update_task(task_id, status=status, summary=summary, error=error)

    def update_task(
        self,
        task_id: str,
        *,
        status: TaskStatus,
        summary: str | None = None,
        error: str | None = None,
    ) -> None:
        with self._lock:
            task = self._tasks[task_id]
            self._tasks[task_id] = task.model_copy(
                update={
                    "status": status,
                    "summary": summary,
                    "error": error,
                    "updated_at": datetime.now(UTC),
                }
            )

    def append_event(self, task_id: str, event_input: TaskEventInput) -> TaskEvent:
        with self._lock:
            events = self._events[task_id]
            event = TaskEvent(
                sequence=len(events) + 1,
                task_id=task_id,
                type=event_input.type,
                message=event_input.message,
                payload=event_input.payload,
            )
            events.append(event)
            return event.model_copy(deep=True)
