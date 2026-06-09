import pytest
from fastapi.testclient import TestClient

from phone_automation_worker.app import create_app


@pytest.fixture(autouse=True)
def clear_worker_environment(monkeypatch):
    for name in [
        "ADB_PATH",
        "OPEN_AUTOGLM_ROOT",
        "PHONE_AGENT_BASE_URL",
        "PHONE_AGENT_MODEL",
        "PHONE_AGENT_API_KEY",
        "PHONE_AUTOMATION_DEVICE_PROVIDER",
        "PHONE_AUTOMATION_ENV_FILE",
        "PHONE_AUTOMATION_WORKER_RUNNER",
    ]:
        monkeypatch.delenv(name, raising=False)


class ScriptedRunner:
    def run(self, task):
        return {
            "status": "finished",
            "summary": f"Finished: {task.instruction}",
            "events": [
                {
                    "type": "task.started",
                    "message": "Task started.",
                },
                {
                    "type": "task.finished",
                    "message": "Task finished.",
                    "payload": {
                        "summary": f"Finished: {task.instruction}",
                    },
                },
            ],
        }


class FailingDeviceProvider:
    def list_devices(self):
        raise RuntimeError("adb not found")


def test_mobile_app_can_submit_task_and_read_resulting_state_and_events():
    client = TestClient(create_app(task_runner=ScriptedRunner(), load_env=False))

    created = client.post(
        "/tasks",
        json={
            "instruction": "打开美团搜索附近的火锅店，不要下单，只停在搜索结果页",
            "source": "mobile",
        },
    )

    assert created.status_code == 201
    created_body = created.json()
    assert created_body["status"] == "created"
    assert created_body["instruction"] == "打开美团搜索附近的火锅店，不要下单，只停在搜索结果页"

    task_id = created_body["id"]
    task = client.get(f"/tasks/{task_id}")
    events = client.get(f"/tasks/{task_id}/events")

    assert task.status_code == 200
    assert task.json()["status"] == "finished"
    assert task.json()["summary"] == "Finished: 打开美团搜索附近的火锅店，不要下单，只停在搜索结果页"

    assert events.status_code == 200
    assert [event["type"] for event in events.json()["events"]] == [
        "task.created",
        "task.started",
        "task.finished",
    ]


def test_task_fails_explicitly_when_runner_is_not_configured():
    client = TestClient(create_app(load_env=False))

    created = client.post(
        "/tasks",
        json={
            "instruction": "检查当前手机状态",
            "source": "mobile",
        },
    )

    assert created.status_code == 201
    task_id = created.json()["id"]

    task = client.get(f"/tasks/{task_id}")
    events = client.get(f"/tasks/{task_id}/events")

    assert task.status_code == 200
    assert task.json()["status"] == "failed"
    assert task.json()["error"] == (
        "No task runner is configured. Wire Open-AutoGLM before running real tasks."
    )

    assert events.status_code == 200
    assert [event["type"] for event in events.json()["events"]] == [
        "task.created",
        "task.failed",
    ]


def test_explicit_dry_run_mode_can_complete_task_from_api(monkeypatch):
    monkeypatch.setenv("PHONE_AUTOMATION_WORKER_RUNNER", "dry-run")
    client = TestClient(create_app(load_env=False))

    created = client.post(
        "/tasks",
        json={
            "instruction": "打开美团搜索附近的火锅店，不要下单，只停在搜索结果页",
            "source": "mobile",
        },
    )

    assert created.status_code == 201
    task_id = created.json()["id"]

    task = client.get(f"/tasks/{task_id}")
    events = client.get(f"/tasks/{task_id}/events")

    assert task.status_code == 200
    assert task.json()["status"] == "finished"
    assert task.json()["summary"] == (
        "Dry run finished: 打开美团搜索附近的火锅店，不要下单，只停在搜索结果页"
    )

    assert events.status_code == 200
    assert [event["type"] for event in events.json()["events"]] == [
        "task.created",
        "task.started",
        "step.action",
        "task.finished",
    ]


def test_open_autoglm_mode_fails_fast_when_configured_root_is_missing(monkeypatch):
    monkeypatch.setenv("PHONE_AUTOMATION_WORKER_RUNNER", "open-autoglm")
    monkeypatch.setenv("OPEN_AUTOGLM_ROOT", "/path/that/does/not/exist")

    with pytest.raises(RuntimeError, match="OPEN_AUTOGLM_ROOT does not exist"):
        create_app(load_env=False)


def test_open_autoglm_mode_does_not_guess_sibling_checkout(monkeypatch, tmp_path):
    repo_root = tmp_path / "phone-automation-agent"
    worker_dir = repo_root / "apps" / "worker"
    sibling_checkout = tmp_path / "Open-AutoGLM"
    phone_agent_package = sibling_checkout / "phone_agent"
    worker_dir.mkdir(parents=True)
    phone_agent_package.mkdir(parents=True)
    (repo_root / "pnpm-workspace.yaml").write_text("packages:\n  - apps/*\n")
    (phone_agent_package / "__init__.py").write_text("")
    monkeypatch.chdir(worker_dir)
    monkeypatch.setenv("PHONE_AUTOMATION_WORKER_RUNNER", "open-autoglm")

    with pytest.raises(RuntimeError, match="Open-AutoGLM is not importable"):
        create_app(load_env=False)


def test_worker_loads_root_env_file_for_runner_mode(monkeypatch, tmp_path):
    repo_root = tmp_path / "phone-automation-agent"
    worker_dir = repo_root / "apps" / "worker"
    worker_dir.mkdir(parents=True)
    (repo_root / "pnpm-workspace.yaml").write_text("packages:\n  - apps/*\n")
    (repo_root / ".env").write_text("PHONE_AUTOMATION_WORKER_RUNNER=dry-run\n")
    monkeypatch.chdir(worker_dir)
    monkeypatch.delenv("PHONE_AUTOMATION_WORKER_RUNNER", raising=False)

    client = TestClient(create_app())
    created = client.post(
        "/tasks",
        json={
            "instruction": "检查当前手机状态",
            "source": "mobile",
        },
    )

    task = client.get(f"/tasks/{created.json()['id']}")

    assert created.status_code == 201
    assert task.status_code == 200
    assert task.json()["status"] == "finished"


def test_open_autoglm_mode_uses_explicit_configured_root(
    monkeypatch,
    tmp_path,
):
    repo_root = tmp_path / "phone-automation-agent"
    worker_dir = repo_root / "apps" / "worker"
    open_autoglm_root = tmp_path / "Open-AutoGLM"
    phone_agent_package = open_autoglm_root / "phone_agent"
    worker_dir.mkdir(parents=True)
    phone_agent_package.mkdir(parents=True)
    (repo_root / "pnpm-workspace.yaml").write_text("packages:\n  - apps/*\n")
    (phone_agent_package / "__init__.py").write_text("")
    monkeypatch.chdir(worker_dir)
    monkeypatch.setenv("PHONE_AUTOMATION_WORKER_RUNNER", "open-autoglm")
    monkeypatch.setenv("OPEN_AUTOGLM_ROOT", str(open_autoglm_root))

    app = create_app(load_env=False)

    assert app.title == "Phone Automation Worker"


def test_device_endpoint_reports_setup_failures_as_service_unavailable():
    client = TestClient(
        create_app(device_provider=FailingDeviceProvider(), load_env=False),
        raise_server_exceptions=False,
    )

    response = client.get("/devices")

    assert response.status_code == 503
    assert response.json() == {
        "detail": "Device provider failed: adb not found",
    }
