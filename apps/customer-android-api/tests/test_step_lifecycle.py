from customer_android_api.models import CustomerStepRequest
from customer_android_api.step_lifecycle import CustomerStepLifecycle
from customer_android_api.store import SessionStore


class CountingStepAgent:
    def __init__(self, action: dict[str, object]) -> None:
        self.action = action
        self.calls = 0

    def decide(self, **_kwargs: object) -> dict[str, object]:
        self.calls += 1
        return self.action


def test_step_lifecycle_rejects_skipped_step_without_agent_call() -> None:
    store = SessionStore()
    session = store.create_session(instruction="检查当前页面")
    step_agent = CountingStepAgent(
        {"_metadata": "do", "action": "Wait", "duration": "1 seconds"}
    )
    lifecycle = CustomerStepLifecycle(
        store=store,
        step_agent=step_agent,
        max_steps=10,
    )

    response = lifecycle.create_step_decision(
        session_id=session.task.id,
        request=_step_request(step_number=2),
    )
    stored = store.get_session(session.task.id)

    assert response.action == {
        "_metadata": "failed",
        "message": "Expected step 1, got 2.",
    }
    assert step_agent.calls == 0
    assert stored is not None
    assert stored.task.status == "failed"
    assert stored.task.error == "Expected step 1, got 2."
    assert stored.events[-2].type == "step.decided"
    assert stored.events[-2].payload == {
        "stepNumber": 2,
        "action": response.action,
    }
    assert stored.events[-1].type == "task.failed"


def test_step_lifecycle_rejects_post_terminal_step_without_mutating_snapshot() -> None:
    store = SessionStore()
    session = store.create_session(instruction="检查当前页面")
    step_agent = CountingStepAgent({"_metadata": "finish", "message": "已完成"})
    lifecycle = CustomerStepLifecycle(
        store=store,
        step_agent=step_agent,
        max_steps=10,
    )

    first_response = lifecycle.create_step_decision(
        session_id=session.task.id,
        request=_step_request(step_number=1),
    )
    event_count_after_finish = len(session.events)
    second_response = lifecycle.create_step_decision(
        session_id=session.task.id,
        request=_step_request(step_number=2),
    )

    assert first_response.action == {"_metadata": "finish", "message": "已完成"}
    assert second_response.action == {
        "_metadata": "failed",
        "message": "Session is already finished; no more steps are accepted.",
    }
    assert step_agent.calls == 1
    assert session.task.status == "finished"
    assert session.task.summary == "已完成"
    assert len(session.events) == event_count_after_finish


def _step_request(*, step_number: int) -> CustomerStepRequest:
    return CustomerStepRequest(
        instruction="检查当前页面",
        source="customer-android",
        stepNumber=step_number,
        screen={
            "frameBase64": "ZmFrZS1zY3JlZW4=",
            "frameMimeType": "image/png",
            "width": 1080,
            "height": 2400,
        },
        lastActionResult=None,
    )
