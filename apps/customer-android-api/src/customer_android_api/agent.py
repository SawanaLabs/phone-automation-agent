from __future__ import annotations

import logging
from typing import Protocol

from customer_android_api.agent_context import (
    CUSTOMER_ANDROID_SYSTEM_PROMPT,
    CustomerAgentContext,
)
from customer_android_api.model_provider import ScriptedModelProvider
from customer_android_api.models import CustomerSessionSnapshot, CustomerStepRequest
from customer_android_api.open_autoglm_actions import parse_open_autoglm_action_text

logger = logging.getLogger(__name__)


class ModelProvider(Protocol):
    def complete(self, request: dict[str, object]) -> str: ...


class CustomerStepAgentError(Exception):
    pass


class CustomerStepAgent:
    def __init__(
        self,
        *,
        model_provider: ModelProvider | None = None,
        system_prompt: str = CUSTOMER_ANDROID_SYSTEM_PROMPT,
        agent_context: CustomerAgentContext | None = None,
    ) -> None:
        self._model_provider = model_provider or ScriptedModelProvider()
        self._agent_context = agent_context or CustomerAgentContext(
            system_prompt=system_prompt
        )

    def decide(
        self,
        *,
        session: CustomerSessionSnapshot,
        request: CustomerStepRequest,
    ) -> dict[str, object]:
        model_request = self._agent_context.build_model_request(
            session=session,
            request=request,
        )
        try:
            output = self._model_provider.complete(model_request)
        except Exception as error:
            logger.exception(
                "Customer Step Agent model provider failed: session_id=%s step_number=%s",
                session.task.id,
                request.stepNumber,
            )
            raise CustomerStepAgentError(f"Model provider failed: {error}") from error

        try:
            action = parse_open_autoglm_action_text(output)
        except ValueError as error:
            logger.exception(
                "Customer Step Agent invalid model output: session_id=%s step_number=%s raw_output=%r",
                session.task.id,
                request.stepNumber,
                output,
            )
            raise CustomerStepAgentError(f"Invalid model output: {error}") from error

        self._agent_context.record_model_output(
            session_id=session.task.id,
            output=output,
        )
        return action
