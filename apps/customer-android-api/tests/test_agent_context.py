from customer_android_api.agent_context import CustomerAgentContext
from customer_android_api.models import CustomerStepRequest
from customer_android_api.store import SessionStore


def test_agent_context_builds_model_request_and_prunes_previous_images() -> None:
    session = SessionStore().create_session(instruction="检查当前页面")
    context = CustomerAgentContext(system_prompt="SYSTEM")

    first_request = context.build_model_request(
        session=session,
        request=_step_request(
            step_number=1,
            frame_base64="ZnJhbWUtMQ==",
            frame_mime_type="image/jpeg",
            current_package="com.xingin.xhs",
            accessibility_summary="Search field visible",
        ),
    )
    context.record_model_output(
        session_id=session.task.id,
        output='do(action="Wait", duration="1 seconds")',
    )
    second_request = context.build_model_request(
        session=session,
        request=_step_request(
            step_number=2,
            frame_base64="ZnJhbWUtMg==",
            frame_mime_type="image/png",
            current_package="com.sankuai.meituan",
        ),
    )

    first_messages = first_request["messages"]
    second_messages = second_request["messages"]
    assert isinstance(first_messages, list)
    assert isinstance(second_messages, list)
    assert [message["role"] for message in second_messages] == [
        "system",
        "user",
        "assistant",
        "user",
    ]
    assert first_messages[0] == {"role": "system", "content": "SYSTEM"}
    assert first_messages[1]["content"][0] == {
        "type": "image_url",
        "image_url": {"url": "data:image/jpeg;base64,ZnJhbWUtMQ=="},
    }
    assert '"current_app": "小红书"' in first_messages[1]["content"][1]["text"]
    assert (
        '"accessibility_summary": "Search field visible"'
        in first_messages[1]["content"][1]["text"]
    )
    assert second_messages[1]["content"] == [
        {"type": "text", "text": second_messages[1]["content"][0]["text"]}
    ]
    assert second_messages[2] == {
        "role": "assistant",
        "content": 'do(action="Wait", duration="1 seconds")',
    }
    assert second_messages[3]["content"][0] == {
        "type": "image_url",
        "image_url": {"url": "data:image/png;base64,ZnJhbWUtMg=="},
    }
    assert '"current_app": "美团"' in second_messages[3]["content"][1]["text"]


def _step_request(
    *,
    step_number: int,
    frame_base64: str,
    frame_mime_type: str,
    current_package: str,
    accessibility_summary: str | None = None,
) -> CustomerStepRequest:
    return CustomerStepRequest(
        instruction="检查当前页面",
        source="customer-android",
        stepNumber=step_number,
        screen={
            "frameBase64": frame_base64,
            "frameMimeType": frame_mime_type,
            "width": 1080,
            "height": 2400,
            "currentPackage": current_package,
            "accessibilitySummary": accessibility_summary,
        },
        lastActionResult=None,
    )
