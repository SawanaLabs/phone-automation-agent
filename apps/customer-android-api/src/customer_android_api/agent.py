from __future__ import annotations

import copy
import json
from typing import Protocol

from customer_android_api.model_provider import ScriptedModelProvider
from customer_android_api.models import CustomerSessionSnapshot, CustomerStepRequest
from customer_android_api.open_autoglm_actions import parse_open_autoglm_action_text

CUSTOMER_ANDROID_SYSTEM_PROMPT = """
You are a phone automation agent. Given the user's task, the current Android
screen image, and structured screen metadata, choose exactly one next action.

You must return one action in one of these formats:
- do(action="Launch", app="xxx")
- do(action="Tap", element=[x,y])
- do(action="Tap", element=[x,y], message="important operation")
- do(action="Type", text="xxx")
- do(action="Type_Name", text="xxx")
- do(action="Interact")
- do(action="Swipe", start=[x1,y1], end=[x2,y2])
- do(action="Note", message="True")
- do(action="Call_API", instruction="xxx")
- do(action="Long Press", element=[x,y])
- do(action="Double Tap", element=[x,y])
- do(action="Take_over", message="xxx")
- do(action="Back")
- do(action="Home")
- do(action="Wait", duration="x seconds")
- finish(message="xxx")

Coordinates use the same 0-1000 relative coordinate system as Open-AutoGLM.
If the current app is not the target app, launch the target app first. If a
screen needs login, verification, user choice, or sensitive confirmation, use
the matching pause action instead of inventing an unsupported action.
""".strip()


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
    ) -> None:
        self._model_provider = model_provider or ScriptedModelProvider()
        self._system_prompt = system_prompt
        self._contexts: dict[str, list[dict[str, object]]] = {}

    def decide(
        self,
        *,
        session: CustomerSessionSnapshot,
        request: CustomerStepRequest,
    ) -> dict[str, object]:
        messages = self._messages_for_step(session=session, request=request)
        try:
            output = self._model_provider.complete(
                {
                    "instruction": session.task.instruction,
                    "stepNumber": request.stepNumber,
                    "screen": request.screen.model_dump(),
                    "lastActionResult": (
                        request.lastActionResult.model_dump()
                        if request.lastActionResult is not None
                        else None
                    ),
                    "messages": copy.deepcopy(messages),
                }
            )
        except Exception as error:
            raise CustomerStepAgentError(f"Model provider failed: {error}") from error

        try:
            action = parse_open_autoglm_action_text(output)
        except ValueError as error:
            raise CustomerStepAgentError(f"Invalid model output: {error}") from error

        self._store_step_result(
            session_id=session.task.id,
            output=output,
        )
        return action

    def _messages_for_step(
        self,
        *,
        session: CustomerSessionSnapshot,
        request: CustomerStepRequest,
    ) -> list[dict[str, object]]:
        context = self._contexts.setdefault(session.task.id, [])
        if not context:
            context.append(_create_system_message(self._system_prompt))

        text = _build_first_step_text(session, request) if len(context) == 1 else _build_followup_step_text(request)
        context.append(
            _create_user_message(
                text=text,
                image_base64=request.screen.frameBase64,
                image_mime_type=request.screen.frameMimeType,
            )
        )
        return context

    def _store_step_result(self, *, session_id: str, output: str) -> None:
        context = self._contexts[session_id]
        context[-1] = _remove_images_from_message(context[-1])
        context.append(_create_assistant_message(output))


def _create_system_message(content: str) -> dict[str, object]:
    return {"role": "system", "content": content}


def _create_user_message(
    *,
    text: str,
    image_base64: str,
    image_mime_type: str,
) -> dict[str, object]:
    return {
        "role": "user",
        "content": [
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:{image_mime_type};base64,{image_base64}",
                },
            },
            {"type": "text", "text": text},
        ],
    }


def _create_assistant_message(content: str) -> dict[str, object]:
    return {"role": "assistant", "content": content}


def _remove_images_from_message(message: dict[str, object]) -> dict[str, object]:
    content = message.get("content")
    if isinstance(content, list):
        message["content"] = [
            item
            for item in content
            if isinstance(item, dict) and item.get("type") == "text"
        ]
    return message


def _build_first_step_text(
    session: CustomerSessionSnapshot,
    request: CustomerStepRequest,
) -> str:
    return f"{session.task.instruction}\n\n** Screen Info **\n\n{_build_screen_info(request)}"


def _build_followup_step_text(request: CustomerStepRequest) -> str:
    return f"** Screen Info **\n\n{_build_screen_info(request)}"


def _build_screen_info(request: CustomerStepRequest) -> str:
    info: dict[str, object] = {
        "current_app": request.screen.currentPackage or "unknown",
        "width": request.screen.width,
        "height": request.screen.height,
    }
    if request.screen.accessibilitySummary:
        info["accessibility_summary"] = request.screen.accessibilitySummary
    if request.lastActionResult is not None:
        info["last_action_result"] = request.lastActionResult.model_dump()

    return json.dumps(info, ensure_ascii=False)
