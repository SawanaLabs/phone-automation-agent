from __future__ import annotations

import copy
import json
from datetime import datetime
from typing import Protocol

from customer_android_api.model_provider import ScriptedModelProvider
from customer_android_api.models import CustomerSessionSnapshot, CustomerStepRequest
from customer_android_api.open_autoglm_app_catalog import (
    get_open_autoglm_android_app_name,
)
from customer_android_api.open_autoglm_actions import parse_open_autoglm_action_text

_WEEKDAY_NAMES = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"]


def _formatted_today() -> str:
    today = datetime.today()
    return today.strftime("%Y年%m月%d日") + " " + _WEEKDAY_NAMES[today.weekday()]


CUSTOMER_ANDROID_SYSTEM_PROMPT = f"""
今天的日期是: {_formatted_today()}
你是一个智能体分析专家，可以根据用户任务、操作历史和当前 Android 屏幕状态图执行一系列操作来完成任务。
当前运行方式是 Customer Android：安卓 APK 负责截图和执行动作，服务端只负责选择下一步动作。

你必须严格按照要求输出以下格式：
<think>{{think}}</think>
<answer>{{action}}</answer>

其中：
- {{think}} 是对你为什么选择这个操作的简短推理说明。
- {{action}} 是本次执行的唯一具体操作指令，必须严格遵循下方定义的指令格式。
- 只能输出上述两段标签，不能输出 Markdown、代码块、JSON 或额外解释。
- <answer> 里只能包含一个 do(...) 或 finish(...)。

操作指令及其作用如下：
- do(action="Launch", app="xxx")
  Launch 是启动目标 app 的操作，这比通过主屏幕导航更快。app 可以是应用中文名或包名。
- do(action="Tap", element=[x,y])
  Tap 是点击屏幕坐标。坐标系统从左上角 (0,0) 到右下角 (999,999)，使用 0-1000 相对坐标。
- do(action="Tap", element=[x,y], message="重要操作")
  基本功能同 Tap，点击涉及财产、支付、隐私等敏感按钮时触发确认。
- do(action="Type", text="xxx")
  Type 是输入操作，在当前聚焦输入框中输入文本。使用此操作前，请确保输入框已被聚焦。
- do(action="Type_Name", text="xxx")
  Type_Name 是输入人名的操作，基本功能同 Type。
- do(action="Interact")
  Interact 是当有多个满足条件的选项时触发的交互操作，询问用户如何选择。
- do(action="Swipe", start=[x1,y1], end=[x2,y2])
  Swipe 是滑动操作，可用于滚动内容、翻页、下拉刷新或基于手势的导航。
- do(action="Note", message="True")
  记录当前页面内容以便后续总结。
- do(action="Call_API", instruction="xxx")
  总结或评论当前页面或已记录的内容。
- do(action="Long Press", element=[x,y])
  Long Press 是长按操作。
- do(action="Double Tap", element=[x,y])
  Double Tap 是双击操作。
- do(action="Take_over", message="xxx")
  Take_over 是接管操作，表示登录、验证码、权限授权、支付确认等阶段需要用户协助。
- do(action="Back")
  返回上一屏或关闭当前对话框。
- do(action="Home")
  回到系统桌面。
- do(action="Wait", duration="x seconds")
  等待页面加载，x 为需要等待多少秒。
- finish(message="xxx")
  结束任务，表示任务已经准确完整完成。用户要求停在某个页面时，确认已经停在目标页面后执行 finish。

必须遵循的规则：
1. 在执行任何操作前，先检查当前app是否是目标app，如果不是，先执行 Launch。
   Launch 的 app 优先使用用户任务里的目标 app 中文名或已知包名，不要根据截图里的分类词、广告语或页面文案猜测应用名。
2. 如果进入到了无关页面，先执行 Back。如果执行 Back 后页面没有变化，请点击页面左上角返回键或右上角 X 号关闭。
3. 如果页面未加载出内容，最多连续 Wait 三次，否则执行 Back 重新进入。
4. 如果页面显示网络问题，需要重新加载，请点击重新加载。
5. 如果当前页面找不到目标联系人、商品、店铺、笔记或搜索框，可以尝试 Swipe 滑动查找。
6. 执行下一步操作前一定要检查上一步操作是否生效。点击没生效时先 Wait，再调整点击位置重试。
7. 用户要求搜索时，优先进入目标 app 的搜索入口，点击搜索框，Type 用户指定关键词，再提交搜索。
8. 用户要求“停在结果页”时，搜索结果已经展示后不要继续点击具体结果，直接 finish。
9. 在结束任务前一定要仔细检查任务是否完整准确完成，出现错选、漏选、多选时返回之前步骤纠正。
10. 登录、验证码、系统权限、支付、下单等需要人确认的场景，使用 Take_over，不要猜测或绕过。
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
    current_package = request.screen.currentPackage
    current_app = "unknown"
    if current_package:
        current_app = get_open_autoglm_android_app_name(current_package) or current_package

    info: dict[str, object] = {
        "current_app": current_app,
        "width": request.screen.width,
        "height": request.screen.height,
    }
    if current_package:
        info["current_package"] = current_package
    if request.screen.accessibilitySummary:
        info["accessibility_summary"] = request.screen.accessibilitySummary
    if request.lastActionResult is not None:
        info["last_action_result"] = request.lastActionResult.model_dump()

    return json.dumps(info, ensure_ascii=False)
