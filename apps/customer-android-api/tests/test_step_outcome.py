from customer_android_api.step_outcome import classify_step_outcome


def test_routine_step_outcome_keeps_task_running_without_task_event():
    outcome = classify_step_outcome({"_metadata": "do", "action": "Wait"})

    assert outcome.kind == "routine"
    assert outcome.decision_message == "Wait"
    assert outcome.task_status == "running"
    assert outcome.task_summary is None
    assert outcome.task_error is None
    assert outcome.task_event_type is None
    assert outcome.task_event_message is None


def test_failed_step_outcome_projects_task_failure_state():
    outcome = classify_step_outcome(
        {"_metadata": "failed", "message": "Model provider failed."}
    )

    assert outcome.kind == "failed"
    assert outcome.decision_message == "failed"
    assert outcome.task_status == "failed"
    assert outcome.task_summary == "Model provider failed."
    assert outcome.task_error == "Model provider failed."
    assert outcome.task_event_type == "task.failed"
    assert outcome.task_event_message == "Model provider failed."


def test_pause_step_outcome_projects_user_interaction_state():
    outcome = classify_step_outcome(
        {"_metadata": "do", "action": "Interact", "message": "请选择目标"}
    )

    assert outcome.kind == "pause"
    assert outcome.decision_message == "Interact"
    assert outcome.task_status == "interaction_required"
    assert outcome.task_summary == "请选择目标"
    assert outcome.task_error is None
    assert outcome.task_event_type == "task.paused"
    assert outcome.task_event_message == "请选择目标"
