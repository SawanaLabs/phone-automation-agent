from threading import Event, Lock, Thread

import pytest
from fastapi.testclient import TestClient

from phone_automation_worker.app import create_app
from phone_automation_worker.__main__ import main


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
        "PHONE_AUTOMATION_WORKER_HOST",
        "PHONE_AUTOMATION_WORKER_PORT",
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
                    "type": "task.finished",
                    "message": "Task finished.",
                    "payload": {
                        "summary": f"Finished: {task.instruction}",
                    },
                },
            ],
        }


class FinishedOnlyRunner:
    def run(self, task):
        return {
            "status": "finished",
            "summary": f"Finished: {task.instruction}",
            "events": [
                {
                    "type": "task.finished",
                    "message": "Task finished.",
                },
            ],
        }


class FailingDeviceProvider:
    def list_devices(self):
        raise RuntimeError("adb not found")


class BlockingFirstRunner:
    def __init__(self) -> None:
        self.started = Event()
        self.release = Event()
        self._lock = Lock()
        self.run_count = 0

    def run(self, task):
        with self._lock:
            self.run_count += 1
            run_count = self.run_count

        if run_count == 1:
            self.started.set()
            if not self.release.wait(timeout=5):
                raise RuntimeError("Timed out waiting to release blocking runner.")

        return {
            "status": "finished",
            "summary": f"Finished: {task.instruction}",
            "events": [
                {
                    "type": "task.finished",
                    "message": "Task finished.",
                },
            ],
        }


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


def test_mobile_app_cannot_start_second_task_while_phone_is_busy():
    runner = BlockingFirstRunner()
    client = TestClient(create_app(task_runner=runner, load_env=False))
    first_response = {}

    def submit_first_task():
        first_response["response"] = client.post(
            "/tasks",
            json={
                "instruction": "打开美团搜索附近的火锅店，不要下单，只停在搜索结果页",
                "source": "mobile",
            },
        )

    first_thread = Thread(target=submit_first_task)
    first_thread.start()
    assert runner.started.wait(timeout=5)

    try:
        second = client.post(
            "/tasks",
            json={
                "instruction": "检查当前手机状态",
                "source": "mobile",
            },
        )

        assert second.status_code == 409
        assert second.json() == {
            "detail": "Another task is already active on the controlled phone.",
        }
        assert runner.run_count == 1
    finally:
        runner.release.set()
        first_thread.join(timeout=5)

    assert not first_thread.is_alive()
    assert first_response["response"].status_code == 201


def test_worker_records_started_event_before_runner_result_events():
    client = TestClient(create_app(task_runner=FinishedOnlyRunner(), load_env=False))

    created = client.post(
        "/tasks",
        json={
            "instruction": "检查当前手机状态",
            "source": "mobile",
        },
    )
    events = client.get(f"/tasks/{created.json()['id']}/events")

    assert created.status_code == 201
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
        "task.started",
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
    monkeypatch.setenv("PHONE_AGENT_BASE_URL", "https://open.bigmodel.cn/api/paas/v4")
    monkeypatch.setenv("PHONE_AGENT_MODEL", "autoglm-phone")
    monkeypatch.setenv("PHONE_AGENT_API_KEY", "test-api-key")

    app = create_app(load_env=False)

    assert app.title == "Phone Automation Worker"


def test_open_autoglm_mode_fails_fast_without_model_api_key(monkeypatch, tmp_path):
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
    monkeypatch.setenv("PHONE_AGENT_BASE_URL", "https://open.bigmodel.cn/api/paas/v4")
    monkeypatch.setenv("PHONE_AGENT_MODEL", "autoglm-phone")

    with pytest.raises(RuntimeError, match="PHONE_AGENT_API_KEY is required"):
        create_app(load_env=False)


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


def test_worker_entrypoint_uses_configured_host_and_port(monkeypatch):
    captured: dict[str, object] = {}

    def fake_run(app_ref, **kwargs):
        captured["app_ref"] = app_ref
        captured.update(kwargs)

    monkeypatch.setenv("PHONE_AUTOMATION_WORKER_HOST", "0.0.0.0")
    monkeypatch.setenv("PHONE_AUTOMATION_WORKER_PORT", "9876")
    monkeypatch.setattr("phone_automation_worker.__main__.uvicorn.run", fake_run)

    main()

    assert captured["app_ref"] == "phone_automation_worker.app:create_app"
    assert captured["factory"] is True
    assert captured["host"] == "0.0.0.0"
    assert captured["port"] == 9876
