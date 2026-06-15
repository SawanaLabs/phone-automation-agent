from __future__ import annotations

import logging
from typing import Protocol

from customer_android_api.agent import CustomerStepAgentError
from customer_android_api.models import (
    CustomerSessionSnapshot,
    CustomerStepRequest,
    CustomerStepResponse,
)
from customer_android_api.store import SessionStore

logger = logging.getLogger(__name__)

_TERMINAL_STATUSES = {"finished", "failed", "stopped"}


class CustomerStepDecider(Protocol):
    def decide(
        self,
        *,
        session: CustomerSessionSnapshot,
        request: CustomerStepRequest,
    ) -> dict[str, object]: ...


class CustomerStepSessionNotFoundError(Exception):
    pass


class CustomerStepLifecycle:
    def __init__(
        self,
        *,
        store: SessionStore,
        step_agent: CustomerStepDecider,
        max_steps: int,
    ) -> None:
        if max_steps <= 0:
            raise ValueError(f"max_steps must be positive: {max_steps}")

        self._store = store
        self._step_agent = step_agent
        self._max_steps = max_steps

    def create_step_decision(
        self,
        *,
        session_id: str,
        request: CustomerStepRequest,
    ) -> CustomerStepResponse:
        session = self._store.get_session(session_id)
        if session is None:
            raise CustomerStepSessionNotFoundError("Session not found.")

        preflight_action = self._preflight_step_action(
            request=request,
            session=session,
        )
        if preflight_action is not None:
            logger.warning(
                "Customer step preflight failed: session_id=%s step_number=%s message=%s",
                session_id,
                request.stepNumber,
                preflight_action.get("message"),
            )
            if not _is_terminal_status(session.task.status):
                self._store.record_step_decision(
                    session_id=session_id,
                    step_number=request.stepNumber,
                    action=preflight_action,
                )
            return CustomerStepResponse(action=preflight_action)

        action = self._decide_action(request=request, session=session)
        self._store.record_step_decision(
            session_id=session_id,
            step_number=request.stepNumber,
            action=action,
        )
        return CustomerStepResponse(action=action)

    def _preflight_step_action(
        self,
        *,
        request: CustomerStepRequest,
        session: CustomerSessionSnapshot,
    ) -> dict[str, object] | None:
        if _is_terminal_status(session.task.status):
            return {
                "_metadata": "failed",
                "message": (
                    f"Session is already {session.task.status}; "
                    "no more steps are accepted."
                ),
            }

        if request.stepNumber > self._max_steps:
            return {
                "_metadata": "failed",
                "message": (
                    "Hosted routine action loop exceeded "
                    f"{self._max_steps} steps without finish."
                ),
            }

        if request.stepNumber != session.nextStepNumber:
            return {
                "_metadata": "failed",
                "message": (
                    f"Expected step {session.nextStepNumber}, got {request.stepNumber}."
                ),
            }

        return None

    def _decide_action(
        self,
        *,
        request: CustomerStepRequest,
        session: CustomerSessionSnapshot,
    ) -> dict[str, object]:
        try:
            return self._step_agent.decide(session=session, request=request)
        except CustomerStepAgentError as error:
            return {
                "_metadata": "failed",
                "message": str(error),
            }


def _is_terminal_status(status: str) -> bool:
    return status in _TERMINAL_STATUSES
