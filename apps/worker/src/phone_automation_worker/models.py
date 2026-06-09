from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field


TaskSource = Literal["mobile"]
TaskStatus = Literal[
    "created",
    "running",
    "finished",
    "failed",
    "confirmation_required",
    "takeover_required",
]


class TaskCreateRequest(BaseModel):
    instruction: str = Field(min_length=1)
    source: TaskSource = "mobile"


class TaskRecord(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    instruction: str
    source: TaskSource = "mobile"
    status: TaskStatus = "created"
    summary: str | None = None
    error: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class TaskEvent(BaseModel):
    sequence: int
    task_id: str
    type: str
    message: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class TaskRunResult(BaseModel):
    status: TaskStatus
    summary: str | None = None
    error: str | None = None
    events: list[TaskEventInput] = Field(default_factory=list)


class TaskEventInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: str
    message: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


class TaskEventsResponse(BaseModel):
    events: list[TaskEvent]


class DeviceRecord(BaseModel):
    id: str
    kind: Literal["android"]
    status: Literal["available", "unavailable"]
    label: str | None = None
    detail: str | None = None


class DevicesResponse(BaseModel):
    devices: list[DeviceRecord]
