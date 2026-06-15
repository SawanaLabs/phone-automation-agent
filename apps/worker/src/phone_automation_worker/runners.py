from __future__ import annotations

import os
from typing import Any, Protocol

from phone_automation_worker.models import TaskEventInput, TaskRecord, TaskRunResult


class TaskRunner(Protocol):
    def run(self, task: TaskRecord) -> TaskRunResult | dict[str, Any]: ...


class UnconfiguredTaskRunner:
    def run(self, task: TaskRecord) -> TaskRunResult:
        raise RuntimeError(
            "No task runner is configured. Wire Open-AutoGLM before running real tasks."
        )


class DryRunTaskRunner:
    def run(self, task: TaskRecord) -> TaskRunResult:
        summary = f"Dry run finished: {task.instruction}"
        return TaskRunResult(
            status="finished",
            summary=summary,
            events=[
                TaskEventInput(
                    type="step.action",
                    message="Dry-run action selected.",
                    payload={
                        "action": "noop",
                    },
                ),
                TaskEventInput(
                    type="task.finished",
                    message="Dry-run task finished.",
                    payload={
                        "summary": summary,
                    },
                ),
            ],
        )


def build_task_runner_from_env() -> TaskRunner:
    mode = os.getenv("PHONE_AUTOMATION_WORKER_RUNNER", "unconfigured")

    if mode == "unconfigured":
        return UnconfiguredTaskRunner()

    if mode == "dry-run":
        return DryRunTaskRunner()

    if mode == "open-autoglm":
        from phone_automation_worker.open_autoglm import OpenAutoGlmRunner

        return OpenAutoGlmRunner.from_env()

    raise RuntimeError(
        "Unsupported PHONE_AUTOMATION_WORKER_RUNNER value. "
        "Expected one of: unconfigured, dry-run, open-autoglm."
    )


def normalize_run_result(result: TaskRunResult | dict[str, Any]) -> TaskRunResult:
    if isinstance(result, TaskRunResult):
        return result

    return TaskRunResult(
        status=result["status"],
        summary=result.get("summary"),
        error=result.get("error"),
        events=[
            TaskEventInput.model_validate(event) for event in result.get("events", [])
        ],
    )
