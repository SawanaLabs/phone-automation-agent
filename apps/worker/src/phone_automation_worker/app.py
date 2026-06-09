from __future__ import annotations

from fastapi import BackgroundTasks, FastAPI, HTTPException

from phone_automation_worker.config import load_project_env
from phone_automation_worker.devices import DeviceProvider, build_device_provider_from_env
from phone_automation_worker.models import (
    DevicesResponse,
    TaskCreateRequest,
    TaskEventInput,
    TaskEventsResponse,
    TaskRecord,
)
from phone_automation_worker.runners import (
    TaskRunner,
    build_task_runner_from_env,
    normalize_run_result,
)
from phone_automation_worker.store import TaskStore


def create_app(
    *,
    task_runner: TaskRunner | None = None,
    device_provider: DeviceProvider | None = None,
    task_store: TaskStore | None = None,
    load_env: bool = True,
) -> FastAPI:
    if load_env:
        load_project_env()

    app = FastAPI(title="Phone Automation Worker")
    store = task_store or TaskStore()
    runner = task_runner or build_task_runner_from_env()
    devices = device_provider or build_device_provider_from_env()

    @app.get("/healthz")
    def healthz() -> dict[str, str]:
        return {
            "status": "ok",
        }

    @app.post("/tasks", response_model=TaskRecord, status_code=201)
    def create_task(
        request: TaskCreateRequest,
        background_tasks: BackgroundTasks,
    ) -> TaskRecord:
        task = store.create_task_if_idle(
            instruction=request.instruction,
            source=request.source,
        )
        if task is None:
            raise HTTPException(
                status_code=409,
                detail="Another task is already active on the controlled phone.",
            )

        background_tasks.add_task(_run_task, store, runner, task.id)
        return task

    @app.get("/tasks/{task_id}", response_model=TaskRecord)
    def get_task(task_id: str) -> TaskRecord:
        task = store.get_task(task_id)
        if task is None:
            raise HTTPException(status_code=404, detail="Task not found.")

        return task

    @app.get("/tasks/{task_id}/events", response_model=TaskEventsResponse)
    def get_task_events(task_id: str) -> TaskEventsResponse:
        events = store.list_events(task_id)
        if events is None:
            raise HTTPException(status_code=404, detail="Task not found.")

        return TaskEventsResponse(events=events)

    @app.get("/devices", response_model=DevicesResponse)
    def get_devices() -> DevicesResponse:
        try:
            return DevicesResponse(devices=devices.list_devices())
        except Exception as error:
            raise HTTPException(
                status_code=503,
                detail=f"Device provider failed: {error}",
            ) from error

    return app


def _run_task(store: TaskStore, runner: TaskRunner, task_id: str) -> None:
    task = store.get_task(task_id)
    if task is None:
        raise RuntimeError(f"Task {task_id} disappeared before execution.")

    store.mark_running(task_id)
    store.append_event(
        task_id,
        TaskEventInput(
            type="task.started",
            message="Task started.",
        ),
    )

    try:
        result = normalize_run_result(runner.run(task))
    except Exception as error:
        store.append_event(
            task_id,
            TaskEventInput(
                type="task.failed",
                message=str(error),
                payload={
                    "error": type(error).__name__,
                },
            ),
        )
        store.complete_task(task_id, status="failed", error=str(error))
        return

    for event in result.events:
        store.append_event(task_id, event)

    store.complete_task(
        task_id,
        status=result.status,
        summary=result.summary,
        error=result.error,
    )
