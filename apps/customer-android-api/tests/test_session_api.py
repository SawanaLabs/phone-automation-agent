from fastapi.testclient import TestClient
import pytest

from customer_android_api.app import create_app


class FakeModelProvider:
    def __init__(self, output: str) -> None:
        self.output = output
        self.requests = []

    def complete(self, request):
        self.requests.append(request)
        return self.output


class FailingModelProvider:
    def complete(self, request):
        raise RuntimeError("provider unavailable")


def test_apk_can_create_customer_session_with_alpha_token():
    client = TestClient(
        create_app(
            runtime_token="test-alpha-token",
            load_env=False,
        )
    )

    response = client.post(
        "/sessions",
        headers={"Authorization": "Bearer test-alpha-token"},
        json={
            "instruction": "打开小红书搜索咖啡店，停在结果页",
            "source": "customer-android",
        },
    )

    assert response.status_code == 201
    body = response.json()

    assert body["task"]["instruction"] == "打开小红书搜索咖啡店，停在结果页"
    assert body["task"]["status"] == "running"
    assert body["task"]["summary"] is None
    assert body["task"]["error"] is None
    assert body["events"] == [
        {
            "sequence": 1,
            "type": "task.started",
            "message": "Task started.",
            "payload": {},
        }
    ]
    assert body["nextStepNumber"] == 1


def test_customer_session_creation_requires_alpha_bearer_token():
    client = TestClient(
        create_app(
            runtime_token="test-alpha-token",
            load_env=False,
        )
    )

    response = client.post(
        "/sessions",
        json={
            "instruction": "打开小红书搜索咖啡店，停在结果页",
            "source": "customer-android",
        },
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Runtime access token is required."}


def test_customer_session_creation_rejects_invalid_alpha_token():
    client = TestClient(
        create_app(
            runtime_token="test-alpha-token",
            load_env=False,
        )
    )

    response = client.post(
        "/sessions",
        headers={"Authorization": "Bearer wrong-token"},
        json={
            "instruction": "打开小红书搜索咖啡店，停在结果页",
            "source": "customer-android",
        },
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Runtime access token is invalid."}


def test_app_factory_requires_runtime_token_when_no_override_and_env_disabled(
    monkeypatch,
):
    monkeypatch.delenv("CUSTOMER_ANDROID_API_ACCESS_TOKEN", raising=False)

    with pytest.raises(
        RuntimeError,
        match="CUSTOMER_ANDROID_API_ACCESS_TOKEN is required.",
    ):
        create_app(load_env=False)


def test_app_factory_reads_runtime_token_from_environment(monkeypatch):
    monkeypatch.setenv("CUSTOMER_ANDROID_API_ACCESS_TOKEN", "env-alpha-token")
    client = TestClient(create_app(load_env=False))

    response = client.post(
        "/sessions",
        headers={"Authorization": "Bearer env-alpha-token"},
        json={
            "instruction": "打开小红书搜索咖啡店，停在结果页",
            "source": "customer-android",
        },
    )

    assert response.status_code == 201


def test_app_factory_uses_scripted_provider_sequence_from_environment(monkeypatch):
    monkeypatch.setenv("CUSTOMER_ANDROID_API_ACCESS_TOKEN", "env-alpha-token")
    monkeypatch.setenv("CUSTOMER_ANDROID_MODEL_PROVIDER", "scripted")
    monkeypatch.setenv(
        "CUSTOMER_ANDROID_SCRIPTED_ACTIONS_JSON",
        """[
          "do(action=\\"Launch\\", app=\\"com.xingin.xhs\\")",
          "finish(message=\\"scripted task finished\\")"
        ]""",
    )
    client = TestClient(create_app(load_env=False))

    created = client.post(
        "/sessions",
        headers={"Authorization": "Bearer env-alpha-token"},
        json={
            "instruction": "打开小红书搜索咖啡店，停在结果页",
            "source": "customer-android",
        },
    )
    session_id = created.json()["task"]["id"]

    first_step = client.post(
        f"/sessions/{session_id}/steps",
        headers={"Authorization": "Bearer env-alpha-token"},
        json={
            "instruction": "打开小红书搜索咖啡店，停在结果页",
            "source": "customer-android",
            "stepNumber": 1,
            "screen": {
                "frameBase64": "ZmFrZS1zY3JlZW4=",
                "frameMimeType": "image/png",
                "width": 1080,
                "height": 2400,
                "currentPackage": "com.sawanalabs.phoneautomation.customer",
            },
            "lastActionResult": None,
        },
    )
    second_step = client.post(
        f"/sessions/{session_id}/steps",
        headers={"Authorization": "Bearer env-alpha-token"},
        json={
            "instruction": "打开小红书搜索咖啡店，停在结果页",
            "source": "customer-android",
            "stepNumber": 2,
            "screen": {
                "frameBase64": "ZmFrZS1zY3JlZW4tMg==",
                "frameMimeType": "image/png",
                "width": 1080,
                "height": 2400,
                "currentPackage": "com.xingin.xhs",
            },
            "lastActionResult": {
                "status": "succeeded",
                "action": "Launch",
                "message": "Launch completed.",
            },
        },
    )

    assert first_step.status_code == 200
    assert first_step.json()["action"] == {
        "_metadata": "do",
        "action": "Launch",
        "app": "com.xingin.xhs",
    }
    assert second_step.status_code == 200
    assert second_step.json()["action"] == {
        "_metadata": "finish",
        "message": "scripted task finished",
    }


def test_customer_step_returns_next_open_autoglm_action_from_model_output():
    client = TestClient(
        create_app(
            runtime_token="test-alpha-token",
            model_provider=FakeModelProvider(
                'do(action="Launch", app="com.xingin.xhs")'
            ),
            load_env=False,
        )
    )
    created = client.post(
        "/sessions",
        headers={"Authorization": "Bearer test-alpha-token"},
        json={
            "instruction": "打开小红书搜索咖啡店，停在结果页",
            "source": "customer-android",
        },
    )

    response = client.post(
        f"/sessions/{created.json()['task']['id']}/steps",
        headers={"Authorization": "Bearer test-alpha-token"},
        json={
            "instruction": "打开小红书搜索咖啡店，停在结果页",
            "source": "customer-android",
            "stepNumber": 1,
            "screen": {
                "frameBase64": "ZmFrZS1zY3JlZW4=",
                "frameMimeType": "image/png",
                "width": 1080,
                "height": 2400,
                "currentPackage": "com.sawanalabs.phoneautomation.customer",
                "accessibilitySummary": "Customer app task screen",
            },
            "lastActionResult": None,
        },
    )

    assert response.status_code == 200
    assert response.json()["action"] == {
        "_metadata": "do",
        "action": "Launch",
        "app": "com.xingin.xhs",
    }


def test_customer_step_returns_failed_action_for_invalid_model_output():
    client = TestClient(
        create_app(
            runtime_token="test-alpha-token",
            model_provider=FakeModelProvider("no supported action"),
            load_env=False,
        )
    )
    created = client.post(
        "/sessions",
        headers={"Authorization": "Bearer test-alpha-token"},
        json={
            "instruction": "检查当前页面",
            "source": "customer-android",
        },
    )

    response = client.post(
        f"/sessions/{created.json()['task']['id']}/steps",
        headers={"Authorization": "Bearer test-alpha-token"},
        json={
            "instruction": "检查当前页面",
            "source": "customer-android",
            "stepNumber": 1,
            "screen": {
                "frameBase64": "ZmFrZS1zY3JlZW4=",
                "frameMimeType": "image/png",
                "width": 1080,
                "height": 2400,
            },
            "lastActionResult": None,
        },
    )

    assert response.status_code == 200
    assert response.json()["action"] == {
        "_metadata": "failed",
        "message": "Invalid model output: Model output must contain do(...) or finish(...).",
    }


def test_customer_step_returns_failed_action_for_provider_failure():
    client = TestClient(
        create_app(
            runtime_token="test-alpha-token",
            model_provider=FailingModelProvider(),
            load_env=False,
        )
    )
    created = client.post(
        "/sessions",
        headers={"Authorization": "Bearer test-alpha-token"},
        json={
            "instruction": "检查当前页面",
            "source": "customer-android",
        },
    )

    response = client.post(
        f"/sessions/{created.json()['task']['id']}/steps",
        headers={"Authorization": "Bearer test-alpha-token"},
        json={
            "instruction": "检查当前页面",
            "source": "customer-android",
            "stepNumber": 1,
            "screen": {
                "frameBase64": "ZmFrZS1zY3JlZW4=",
                "frameMimeType": "image/png",
                "width": 1080,
                "height": 2400,
            },
            "lastActionResult": None,
        },
    )

    assert response.status_code == 200
    assert response.json()["action"] == {
        "_metadata": "failed",
        "message": "Model provider failed: provider unavailable",
    }


def test_customer_step_builds_open_autoglm_style_multimodal_context():
    model_provider = FakeModelProvider('do(action="Back")')
    client = TestClient(
        create_app(
            runtime_token="test-alpha-token",
            model_provider=model_provider,
            load_env=False,
        )
    )
    created = client.post(
        "/sessions",
        headers={"Authorization": "Bearer test-alpha-token"},
        json={
            "instruction": "打开小红书搜索咖啡店，停在结果页",
            "source": "customer-android",
        },
    )

    response = client.post(
        f"/sessions/{created.json()['task']['id']}/steps",
        headers={"Authorization": "Bearer test-alpha-token"},
        json={
            "instruction": "打开小红书搜索咖啡店，停在结果页",
            "source": "customer-android",
            "stepNumber": 1,
            "screen": {
                "frameBase64": "ZmFrZS1zY3JlZW4=",
                "frameMimeType": "image/jpeg",
                "width": 1080,
                "height": 2400,
                "currentPackage": "com.xingin.xhs",
                "accessibilitySummary": "Search field visible",
            },
            "lastActionResult": None,
        },
    )

    assert response.status_code == 200
    messages = model_provider.requests[0]["messages"]
    assert messages[0]["role"] == "system"
    assert 'do(action="Launch", app="xxx")' in messages[0]["content"]
    assert messages[1]["role"] == "user"
    assert messages[1]["content"][0] == {
        "type": "image_url",
        "image_url": {"url": "data:image/jpeg;base64,ZmFrZS1zY3JlZW4="},
    }
    assert messages[1]["content"][1]["type"] == "text"
    assert "打开小红书搜索咖啡店，停在结果页" in messages[1]["content"][1]["text"]
    assert '"current_app": "com.xingin.xhs"' in messages[1]["content"][1]["text"]
    assert '"accessibility_summary": "Search field visible"' in messages[1]["content"][1]["text"]


def test_customer_step_keeps_agent_context_without_repeating_previous_images():
    class SequencedModelProvider:
        def __init__(self) -> None:
            self.requests = []
            self.outputs = [
                'do(action="Wait", duration="1 seconds")',
                'finish(message="done")',
            ]

        def complete(self, request):
            self.requests.append(request)
            return self.outputs[len(self.requests) - 1]

    model_provider = SequencedModelProvider()
    client = TestClient(
        create_app(
            runtime_token="test-alpha-token",
            model_provider=model_provider,
            load_env=False,
        )
    )
    created = client.post(
        "/sessions",
        headers={"Authorization": "Bearer test-alpha-token"},
        json={
            "instruction": "检查当前页面",
            "source": "customer-android",
        },
    )
    session_id = created.json()["task"]["id"]

    for step_number in [1, 2]:
        response = client.post(
            f"/sessions/{session_id}/steps",
            headers={"Authorization": "Bearer test-alpha-token"},
            json={
                "instruction": "检查当前页面",
                "source": "customer-android",
                "stepNumber": step_number,
                "screen": {
                    "frameBase64": f"ZnJhbWUt{step_number}",
                    "frameMimeType": "image/png",
                    "width": 1080,
                    "height": 2400,
                },
                "lastActionResult": None,
            },
        )
        assert response.status_code == 200

    second_request_messages = model_provider.requests[1]["messages"]
    assert [message["role"] for message in second_request_messages] == [
        "system",
        "user",
        "assistant",
        "user",
    ]
    assert second_request_messages[1]["content"] == [
        {
            "type": "text",
            "text": second_request_messages[1]["content"][0]["text"],
        }
    ]
    assert 'do(action="Wait", duration="1 seconds")' in second_request_messages[2]["content"]
    assert second_request_messages[3]["content"][0]["type"] == "image_url"


@pytest.mark.parametrize(
    ("model_output", "expected_action"),
    [
        (
            'do(action="Tap", element=[123,456])',
            {"_metadata": "do", "action": "Tap", "element": [123, 456]},
        ),
        (
            'do(action="Tap", element=[123,456], message="需要确认")',
            {
                "_metadata": "do",
                "action": "Tap",
                "element": [123, 456],
                "message": "需要确认",
            },
        ),
        (
            'do(action="Type", text="咖啡店")',
            {"_metadata": "do", "action": "Type", "text": "咖啡店"},
        ),
        (
            'do(action="Type_Name", text="张三")',
            {"_metadata": "do", "action": "Type", "text": "张三"},
        ),
        (
            'do(action="Swipe", start=[500,800], end=[500,200])',
            {
                "_metadata": "do",
                "action": "Swipe",
                "start": [500, 800],
                "end": [500, 200],
            },
        ),
        ('do(action="Back")', {"_metadata": "do", "action": "Back"}),
        ('do(action="Home")', {"_metadata": "do", "action": "Home"}),
        (
            'do(action="Wait", duration="2 seconds")',
            {"_metadata": "do", "action": "Wait", "duration": "2 seconds"},
        ),
        (
            'do(action="Double Tap", element=[500,500])',
            {"_metadata": "do", "action": "Double Tap", "element": [500, 500]},
        ),
        (
            'do(action="Long Press", element=[500,500])',
            {"_metadata": "do", "action": "Long Press", "element": [500, 500]},
        ),
        (
            'do(action="Take_over", message="请手动处理")',
            {
                "_metadata": "do",
                "action": "Take_over",
                "message": "请手动处理",
            },
        ),
        (
            'do(action="Interact", message="请选择")',
            {"_metadata": "do", "action": "Interact", "message": "请选择"},
        ),
        (
            'do(action="Note", message="True")',
            {"_metadata": "do", "action": "Note", "message": "True"},
        ),
        (
            'do(action="Call_API", instruction="总结页面")',
            {
                "_metadata": "do",
                "action": "Call_API",
                "instruction": "总结页面",
            },
        ),
        (
            'finish(message="搜索结果页已打开")',
            {"_metadata": "finish", "message": "搜索结果页已打开"},
        ),
    ],
)
def test_customer_step_recognizes_default_chinese_open_autoglm_actions(
    model_output,
    expected_action,
):
    client = TestClient(
        create_app(
            runtime_token="test-alpha-token",
            model_provider=FakeModelProvider(model_output),
            load_env=False,
        )
    )
    created = client.post(
        "/sessions",
        headers={"Authorization": "Bearer test-alpha-token"},
        json={
            "instruction": "打开小红书搜索咖啡店，停在结果页",
            "source": "customer-android",
        },
    )

    response = client.post(
        f"/sessions/{created.json()['task']['id']}/steps",
        headers={"Authorization": "Bearer test-alpha-token"},
        json={
            "instruction": "打开小红书搜索咖啡店，停在结果页",
            "source": "customer-android",
            "stepNumber": 1,
            "screen": {
                "frameBase64": "ZmFrZS1zY3JlZW4=",
                "frameMimeType": "image/png",
                "width": 1080,
                "height": 2400,
            },
            "lastActionResult": None,
        },
    )

    assert response.status_code == 200
    assert response.json()["action"] == expected_action
