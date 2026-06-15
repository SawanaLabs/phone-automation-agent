from __future__ import annotations

from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field

SessionSource = Literal["customer-android"]
SessionStatus = Literal[
    "running",
    "finished",
    "failed",
    "stopped",
    "takeover_required",
    "interaction_required",
    "confirmation_required",
]


class SessionCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    instruction: str = Field(min_length=1)
    source: SessionSource = "customer-android"


class CustomerTask(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    instruction: str
    status: SessionStatus = "running"
    summary: str | None = None
    error: str | None = None


class CustomerTaskEvent(BaseModel):
    sequence: int
    type: str
    message: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


class CustomerSessionSnapshot(BaseModel):
    task: CustomerTask
    events: list[CustomerTaskEvent]
    nextStepNumber: int = 1


class CustomerScreenState(BaseModel):
    model_config = ConfigDict(extra="forbid")

    frameBase64: str = Field(min_length=1)
    frameMimeType: str = Field(min_length=1)
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    currentPackage: str | None = None
    accessibilitySummary: str | None = None


class CustomerActionResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["succeeded", "failed", "unsupported"]
    action: str
    message: str


class CustomerStepRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    instruction: str = Field(min_length=1)
    source: SessionSource = "customer-android"
    stepNumber: int = Field(gt=0)
    screen: CustomerScreenState
    lastActionResult: CustomerActionResult | None = None


class CustomerStepResponse(BaseModel):
    action: dict[str, Any]
