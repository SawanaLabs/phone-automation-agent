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


class CountingModelProvider:
    def __init__(self, output: str) -> None:
        self.output = output
        self.calls = 0

    def complete(self, request):
        self.calls += 1
        return self.output


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


def test_customer_session_routes_allow_browser_preflight_from_customer_android_web():
    client = TestClient(
        create_app(
            runtime_token="test-alpha-token",
            load_env=False,
        )
    )

    response = client.options(
        "/sessions",
        headers={
            "Origin": "http://localhost:19006",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "*"
    assert "POST" in response.headers["access-control-allow-methods"]
    assert "authorization" in response.headers["access-control-allow-headers"].lower()
    assert "content-type" in response.headers["access-control-allow-headers"].lower()


def test_customer_session_snapshot_requires_alpha_bearer_token():
    client = TestClient(
        create_app(
            runtime_token="test-alpha-token",
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

    response = client.get(f"/sessions/{created.json()['task']['id']}")

    assert response.status_code == 401
    assert response.json() == {"detail": "Runtime access token is required."}


def test_customer_session_snapshot_rejects_invalid_alpha_token():
    client = TestClient(
        create_app(
            runtime_token="test-alpha-token",
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

    response = client.get(
        f"/sessions/{created.json()['task']['id']}",
        headers={"Authorization": "Bearer wrong-token"},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Runtime access token is invalid."}


def test_customer_session_snapshot_returns_missing_session_error():
    client = TestClient(
        create_app(
            runtime_token="test-alpha-token",
            load_env=False,
        )
    )

    response = client.get(
        "/sessions/missing-session",
        headers={"Authorization": "Bearer test-alpha-token"},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Session not found."}


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


def test_customer_step_accepts_open_autoglm_answer_wrapped_model_output():
    client = TestClient(
        create_app(
            runtime_token="test-alpha-token",
            model_provider=FakeModelProvider(
                '<think>不要 finish(message="未完成")，当前不在目标应用，先打开小红书。</think>\n'
                '<answer>do(action="Launch", app="小红书")</answer>'
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


def test_customer_step_logs_invalid_model_output_with_session_context(caplog):
    raw_output = "<think>bad</think><answer>not an action</answer>"
    client = TestClient(
        create_app(
            runtime_token="test-alpha-token",
            model_provider=FakeModelProvider(raw_output),
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
    caplog.set_level("ERROR", logger="customer_android_api.agent")

    response = client.post(
        f"/sessions/{session_id}/steps",
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
                "currentPackage": "com.android.settings",
            },
            "lastActionResult": None,
        },
    )

    assert response.status_code == 200
    assert response.json()["action"]["_metadata"] == "failed"
    assert session_id in caplog.text
    assert "step_number=1" in caplog.text
    assert raw_output in caplog.text


@pytest.mark.parametrize(
    ("app_name", "expected_app"),
    [
        ("小红书", "com.xingin.xhs"),
        ("美团", "com.sankuai.meituan"),
        ("com.android.settings", "com.android.settings"),
        ("用户自装冷门应用", "用户自装冷门应用"),
    ],
)
def test_customer_step_normalizes_open_autoglm_launch_app_names(
    app_name,
    expected_app,
):
    client = TestClient(
        create_app(
            runtime_token="test-alpha-token",
            model_provider=FakeModelProvider(
                f'<answer>do(action="Launch", app="{app_name}")</answer>'
            ),
            load_env=False,
        )
    )
    created = client.post(
        "/sessions",
        headers={"Authorization": "Bearer test-alpha-token"},
        json={
            "instruction": "打开目标应用",
            "source": "customer-android",
        },
    )

    response = client.post(
        f"/sessions/{created.json()['task']['id']}/steps",
        headers={"Authorization": "Bearer test-alpha-token"},
        json={
            "instruction": "打开目标应用",
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

    assert response.status_code == 200
    assert response.json()["action"] == {
        "_metadata": "do",
        "action": "Launch",
        "app": expected_app,
    }


def test_customer_session_snapshot_records_step_decisions_and_finish():
    client = TestClient(
        create_app(
            runtime_token="test-alpha-token",
            model_provider=FakeModelProvider('finish(message="已完成")'),
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

    response = client.post(
        f"/sessions/{session_id}/steps",
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
                "currentPackage": "com.android.settings",
            },
            "lastActionResult": None,
        },
    )
    snapshot = client.get(
        f"/sessions/{session_id}",
        headers={"Authorization": "Bearer test-alpha-token"},
    )

    assert response.status_code == 200
    assert snapshot.status_code == 200
    body = snapshot.json()
    assert body["task"]["status"] == "finished"
    assert body["task"]["summary"] == "已完成"
    assert body["task"]["error"] is None
    assert body["nextStepNumber"] == 2
    assert body["events"][-2:] == [
        {
            "sequence": 2,
            "type": "step.decided",
            "message": "finish",
            "payload": {
                "stepNumber": 1,
                "action": {"_metadata": "finish", "message": "已完成"},
            },
        },
        {
            "sequence": 3,
            "type": "task.finished",
            "message": "已完成",
            "payload": {"stepNumber": 1},
        },
    ]


def test_customer_step_enforces_server_side_max_steps():
    model_provider = CountingModelProvider('do(action="Wait", duration="1 seconds")')
    client = TestClient(
        create_app(
            runtime_token="test-alpha-token",
            model_provider=model_provider,
            max_steps=1,
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

    first_step = client.post(
        f"/sessions/{session_id}/steps",
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
    second_step = client.post(
        f"/sessions/{session_id}/steps",
        headers={"Authorization": "Bearer test-alpha-token"},
        json={
            "instruction": "检查当前页面",
            "source": "customer-android",
            "stepNumber": 2,
            "screen": {
                "frameBase64": "ZmFrZS1zY3JlZW4tMg==",
                "frameMimeType": "image/png",
                "width": 1080,
                "height": 2400,
            },
            "lastActionResult": {
                "status": "succeeded",
                "action": "Wait",
                "message": "Wait completed.",
            },
        },
    )
    snapshot = client.get(
        f"/sessions/{session_id}",
        headers={"Authorization": "Bearer test-alpha-token"},
    )

    assert first_step.status_code == 200
    assert first_step.json()["action"] == {
        "_metadata": "do",
        "action": "Wait",
        "duration": "1 seconds",
    }
    assert second_step.status_code == 200
    assert second_step.json()["action"] == {
        "_metadata": "failed",
        "message": "Hosted routine action loop exceeded 1 steps without finish.",
    }
    assert model_provider.calls == 1
    assert snapshot.json()["task"]["status"] == "failed"
    assert snapshot.json()["task"]["error"] == (
        "Hosted routine action loop exceeded 1 steps without finish."
    )


def test_customer_step_rejects_post_terminal_step_without_mutating_snapshot():
    model_provider = CountingModelProvider('finish(message="已完成")')
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

    first_step = client.post(
        f"/sessions/{session_id}/steps",
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
    second_step = client.post(
        f"/sessions/{session_id}/steps",
        headers={"Authorization": "Bearer test-alpha-token"},
        json={
            "instruction": "检查当前页面",
            "source": "customer-android",
            "stepNumber": 2,
            "screen": {
                "frameBase64": "ZmFrZS1zY3JlZW4tMg==",
                "frameMimeType": "image/png",
                "width": 1080,
                "height": 2400,
            },
            "lastActionResult": {
                "status": "succeeded",
                "action": "finish",
                "message": "done",
            },
        },
    )
    snapshot = client.get(
        f"/sessions/{session_id}",
        headers={"Authorization": "Bearer test-alpha-token"},
    )

    assert first_step.status_code == 200
    assert second_step.status_code == 200
    assert second_step.json()["action"] == {
        "_metadata": "failed",
        "message": "Session is already finished; no more steps are accepted.",
    }
    assert model_provider.calls == 1
    body = snapshot.json()
    assert body["task"]["status"] == "finished"
    assert body["task"]["summary"] == "已完成"
    assert len(body["events"]) == 3


def test_customer_step_rejects_duplicate_step_without_model_call():
    model_provider = CountingModelProvider('do(action="Wait", duration="1 seconds")')
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

    first_step = client.post(
        f"/sessions/{session_id}/steps",
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
    duplicate_step = client.post(
        f"/sessions/{session_id}/steps",
        headers={"Authorization": "Bearer test-alpha-token"},
        json={
            "instruction": "检查当前页面",
            "source": "customer-android",
            "stepNumber": 1,
            "screen": {
                "frameBase64": "ZmFrZS1zY3JlZW4tZHVw",
                "frameMimeType": "image/png",
                "width": 1080,
                "height": 2400,
            },
            "lastActionResult": None,
        },
    )

    assert first_step.status_code == 200
    assert duplicate_step.status_code == 200
    assert duplicate_step.json()["action"] == {
        "_metadata": "failed",
        "message": "Expected step 2, got 1.",
    }
    assert model_provider.calls == 1


def test_customer_step_rejects_skipped_step_without_model_call():
    model_provider = CountingModelProvider('do(action="Wait", duration="1 seconds")')
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

    response = client.post(
        f"/sessions/{session_id}/steps",
        headers={"Authorization": "Bearer test-alpha-token"},
        json={
            "instruction": "检查当前页面",
            "source": "customer-android",
            "stepNumber": 2,
            "screen": {
                "frameBase64": "ZmFrZS1zY3JlZW4tc2tpcA==",
                "frameMimeType": "image/png",
                "width": 1080,
                "height": 2400,
            },
            "lastActionResult": None,
        },
    )
    snapshot = client.get(
        f"/sessions/{session_id}",
        headers={"Authorization": "Bearer test-alpha-token"},
    )

    assert response.status_code == 200
    assert response.json()["action"] == {
        "_metadata": "failed",
        "message": "Expected step 1, got 2.",
    }
    assert model_provider.calls == 0
    assert snapshot.json()["task"]["status"] == "failed"
    assert snapshot.json()["task"]["error"] == "Expected step 1, got 2."


@pytest.mark.parametrize(
    ("model_output", "expected_status", "expected_message"),
    [
        (
            'do(action="Take_over", message="请先完成登录")',
            "takeover_required",
            "请先完成登录",
        ),
        (
            'do(action="Interact", message="请选择目标")',
            "interaction_required",
            "请选择目标",
        ),
        (
            'do(action="Tap", element=[500,500], message="确认下单")',
            "confirmation_required",
            "确认下单",
        ),
    ],
)
def test_customer_step_records_human_in_the_loop_pause_states(
    model_output,
    expected_status,
    expected_message,
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
            "instruction": "检查当前页面",
            "source": "customer-android",
        },
    )
    session_id = created.json()["task"]["id"]

    response = client.post(
        f"/sessions/{session_id}/steps",
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
    snapshot = client.get(
        f"/sessions/{session_id}",
        headers={"Authorization": "Bearer test-alpha-token"},
    )

    assert response.status_code == 200
    body = snapshot.json()
    assert body["task"]["status"] == expected_status
    assert body["task"]["summary"] == expected_message
    assert body["task"]["error"] is None
    assert body["events"][-1] == {
        "sequence": 3,
        "type": "task.paused",
        "message": expected_message,
        "payload": {"stepNumber": 1},
    }


def test_customer_step_clears_pause_summary_when_task_resumes_running():
    class SequencedModelProvider:
        def __init__(self) -> None:
            self.outputs = [
                'do(action="Take_over", message="请先完成登录")',
                'do(action="Wait", duration="1 seconds")',
            ]
            self.calls = 0

        def complete(self, request):
            output = self.outputs[self.calls]
            self.calls += 1
            return output

    client = TestClient(
        create_app(
            runtime_token="test-alpha-token",
            model_provider=SequencedModelProvider(),
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

    for step_number, last_action_result in [
        (1, None),
        (
            2,
            {
                "status": "succeeded",
                "action": "Take_over",
                "message": "User continued.",
            },
        ),
    ]:
        response = client.post(
            f"/sessions/{session_id}/steps",
            headers={"Authorization": "Bearer test-alpha-token"},
            json={
                "instruction": "检查当前页面",
                "source": "customer-android",
                "stepNumber": step_number,
                "screen": {
                    "frameBase64": f"ZmFrZS1zY3JlZW4t{step_number}",
                    "frameMimeType": "image/png",
                    "width": 1080,
                    "height": 2400,
                },
                "lastActionResult": last_action_result,
            },
        )
        assert response.status_code == 200

    snapshot = client.get(
        f"/sessions/{session_id}",
        headers={"Authorization": "Bearer test-alpha-token"},
    )

    body = snapshot.json()
    assert body["task"]["status"] == "running"
    assert body["task"]["summary"] is None
    assert body["task"]["error"] is None


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


def test_customer_step_returns_failed_action_for_unparseable_model_action():
    client = TestClient(
        create_app(
            runtime_token="test-alpha-token",
            model_provider=FakeModelProvider('do(action="Tap", element=[bad])'),
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
        "message": "Invalid model output: Failed to parse action arguments.",
    }


def test_customer_step_returns_failed_action_for_provider_failure(caplog):
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
    session_id = created.json()["task"]["id"]
    caplog.set_level("ERROR", logger="customer_android_api.agent")

    response = client.post(
        f"/sessions/{session_id}/steps",
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
    assert session_id in caplog.text
    assert "step_number=1" in caplog.text
    assert "provider unavailable" in caplog.text


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
    assert "你必须严格按照要求输出以下格式" in messages[0]["content"]
    assert "<answer>{action}</answer>" in messages[0]["content"]
    assert "先检查当前app是否是目标app，如果不是，先执行 Launch" in messages[0]["content"]
    assert 'do(action="Launch", app="xxx")' in messages[0]["content"]
    assert "Launch 的 app 优先使用用户任务里的目标 app 中文名或已知包名" in messages[0]["content"]
    assert messages[1]["role"] == "user"
    assert messages[1]["content"][0] == {
        "type": "image_url",
        "image_url": {"url": "data:image/jpeg;base64,ZmFrZS1zY3JlZW4="},
    }
    assert messages[1]["content"][1]["type"] == "text"
    assert "打开小红书搜索咖啡店，停在结果页" in messages[1]["content"][1]["text"]
    assert '"current_app": "小红书"' in messages[1]["content"][1]["text"]
    assert '"current_package": "com.xingin.xhs"' in messages[1]["content"][1]["text"]
    assert '"accessibility_summary": "Search field visible"' in messages[1]["content"][1]["text"]


@pytest.mark.parametrize(
    ("current_package", "expected_current_app"),
    [
        ("com.xingin.xhs", "小红书"),
        ("com.sankuai.meituan", "美团"),
        ("com.example.unknown", "com.example.unknown"),
    ],
)
def test_customer_step_maps_current_package_to_open_autoglm_app_name(
    current_package,
    expected_current_app,
):
    model_provider = FakeModelProvider('do(action="Wait", duration="1 seconds")')
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

    response = client.post(
        f"/sessions/{created.json()['task']['id']}/steps",
        headers={"Authorization": "Bearer test-alpha-token"},
        json={
            "instruction": "检查当前页面",
            "source": "customer-android",
            "stepNumber": 1,
            "screen": {
                "frameBase64": "ZmFrZS1zY3JlZW4=",
                "frameMimeType": "image/jpeg",
                "width": 1080,
                "height": 2400,
                "currentPackage": current_package,
            },
            "lastActionResult": None,
        },
    )

    assert response.status_code == 200
    screen_text = model_provider.requests[0]["messages"][1]["content"][1]["text"]
    assert f'"current_app": "{expected_current_app}"' in screen_text
    assert f'"current_package": "{current_package}"' in screen_text


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
        (
            'finish(message="任务已完成，已搜索"咖啡店"，停在结果页。")',
            {
                "_metadata": "finish",
                "message": '任务已完成，已搜索"咖啡店"，停在结果页。',
            },
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
