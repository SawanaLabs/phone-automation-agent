from __future__ import annotations

import ast
import math
import re
from typing import Any

from customer_android_api.open_autoglm_app_catalog import (
    normalize_open_autoglm_android_app_name,
)


def parse_open_autoglm_action_text(output: str) -> dict[str, Any]:
    if not isinstance(output, str):
        raise ValueError("Model output must be a string.")

    action_source = _extract_answer_text(output)
    match = re.search(r"(do|finish)\((.*)\)", action_source, flags=re.DOTALL)
    if match is None:
        raise ValueError("Model output must contain do(...) or finish(...).")

    kind = match.group(1)
    if kind == "finish":
        return {
            "_metadata": "finish",
            "message": _parse_finish_message(match.group(2)),
        }

    args = _parse_named_args(match.group(2))
    action_name = _require_string(args, "action")
    if action_name == "Launch":
        return {
            "_metadata": "do",
            "action": "Launch",
            "app": normalize_open_autoglm_android_app_name(_require_string(args, "app")),
        }
    if action_name == "Tap":
        action = {
            "_metadata": "do",
            "action": "Tap",
            "element": _require_point(args, "element"),
        }
        message = _optional_string(args, "message")
        if message is not None:
            action["message"] = message
        return action
    if action_name in {"Type", "Type_Name"}:
        return {
            "_metadata": "do",
            "action": "Type",
            "text": _require_string(args, "text"),
        }
    if action_name == "Swipe":
        return {
            "_metadata": "do",
            "action": "Swipe",
            "start": _require_point(args, "start"),
            "end": _require_point(args, "end"),
        }
    if action_name in {"Back", "Home"}:
        return {
            "_metadata": "do",
            "action": action_name,
        }
    if action_name == "Wait":
        return {
            "_metadata": "do",
            "action": "Wait",
            "duration": _optional_string(args, "duration") or "1 seconds",
        }
    if action_name in {"Double Tap", "Long Press"}:
        return {
            "_metadata": "do",
            "action": action_name,
            "element": _require_point(args, "element"),
        }
    if action_name in {"Take_over", "Interact", "Note"}:
        action = {
            "_metadata": "do",
            "action": action_name,
        }
        message = _optional_string(args, "message")
        if message is not None:
            action["message"] = message
        return action
    if action_name == "Call_API":
        return {
            "_metadata": "do",
            "action": "Call_API",
            "instruction": _require_string(args, "instruction"),
        }

    raise ValueError(f"Unsupported Open-AutoGLM action: {action_name}.")


def _extract_answer_text(output: str) -> str:
    match = re.search(r"<answer>\s*(.*?)\s*</answer>", output, flags=re.DOTALL)
    if match is None:
        return output
    return match.group(1)


def _parse_finish_message(source: str) -> str:
    prefix = "message="
    stripped = source.strip()
    if not stripped.startswith(prefix):
        raise ValueError("message is required.")

    message = stripped[len(prefix) :].strip()
    if len(message) >= 2 and message[0] == message[-1] and message[0] in {"'", '"'}:
        message = message[1:-1]
    if not message.strip():
        raise ValueError("message is required.")
    return message.strip()


def _parse_named_args(source: str) -> dict[str, Any]:
    try:
        expression = ast.parse(f"_action({source})", mode="eval")
        if not isinstance(expression.body, ast.Call):
            raise ValueError("Action output must be a call.")

        values: dict[str, Any] = {}
        for keyword in expression.body.keywords:
            if keyword.arg is None:
                raise ValueError("Action output only supports named arguments.")
            values[keyword.arg] = ast.literal_eval(keyword.value)
    except (SyntaxError, ValueError) as error:
        raise ValueError("Failed to parse action arguments.") from error

    return values


def _require_string(values: dict[str, Any], name: str) -> str:
    value = values.get(name)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{name} is required.")

    return value.strip()


def _optional_string(values: dict[str, Any], name: str) -> str | None:
    value = values.get(name)
    if value is None:
        return None
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{name} must be a non-empty string when provided.")

    return value.strip()


def _require_point(values: dict[str, Any], name: str) -> list[int | float]:
    value = values.get(name)
    if not isinstance(value, list) or len(value) != 2:
        raise ValueError(f"{name} must be a two-number coordinate.")

    coordinates: list[int | float] = []
    for coordinate in value:
        if not isinstance(coordinate, int | float) or isinstance(coordinate, bool):
            raise ValueError(f"{name} must be a two-number coordinate.")
        if not math.isfinite(coordinate):
            raise ValueError(f"{name} coordinate must be finite.")
        if coordinate < 0 or coordinate > 1000:
            raise ValueError(f"{name} coordinate must be between 0 and 1000.")
        coordinates.append(coordinate)

    return coordinates
