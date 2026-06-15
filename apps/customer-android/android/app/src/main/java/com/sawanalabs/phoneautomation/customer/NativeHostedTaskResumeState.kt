package com.sawanalabs.phoneautomation.customer

import org.json.JSONArray
import org.json.JSONObject

internal object NativeHostedTaskResumeStateParser {
  fun createInput(
    instruction: String,
    maxSteps: Int,
    resumeStateJson: String?
  ): NativeHostedTaskInput {
    val normalizedResumeStateJson = resumeStateJson?.trim()
    if (normalizedResumeStateJson.isNullOrEmpty()) {
      return NativeHostedTaskInput(
        instruction = instruction,
        maxSteps = maxSteps
      )
    }

    val source = JSONObject(normalizedResumeStateJson)
    val mode = source.getString("mode")
    if (mode != MODE_CONTINUE && mode != MODE_ALLOW_CONFIRMED_ACTION) {
      throw IllegalArgumentException("Unsupported hosted resume mode: $mode.")
    }

    val pause = source.optJSONObject("pause")
      ?: throw IllegalArgumentException("Pause state is required for hosted resume.")
    return NativeHostedTaskInput(
      instruction = instruction,
      maxSteps = maxSteps,
      taskId = requireTaskId(source),
      initialEvents = parseEvents(source.optJSONArray("events") ?: JSONArray()),
      initialLastActionResult = parseActionResult(source.optJSONObject("lastActionResult")),
      initialStepNumber = requireNextStepNumber(source),
      approvedPauseAction = parseApprovedPauseAction(mode, pause)
    )
  }

  private fun requireTaskId(source: JSONObject): String {
    val taskId = source.getString("taskId").trim()
    if (taskId.isEmpty()) {
      throw IllegalArgumentException("Task id is required for hosted resume.")
    }
    return taskId
  }

  private fun requireNextStepNumber(source: JSONObject): Int {
    val nextStepNumber = source.optInt("nextStepNumber", 1)
    if (nextStepNumber < 1) {
      throw IllegalArgumentException(
        "Next step number must be positive for hosted resume: $nextStepNumber."
      )
    }
    return nextStepNumber
  }

  private fun parseEvents(source: JSONArray): List<NativeTaskEvent> {
    val events = mutableListOf<NativeTaskEvent>()
    for (index in 0 until source.length()) {
      val event = source.getJSONObject(index)
      events.add(
        NativeTaskEvent(
          sequence = event.optInt("sequence", index + 1),
          type = event.getString("type"),
          message = event.optString("message")
        )
      )
    }
    return events
  }

  private fun parseActionResult(source: JSONObject?): NativeActionResult? {
    if (source == null) {
      return null
    }

    return NativeActionResult(
      status = source.getString("status"),
      action = source.getString("action"),
      message = source.getString("message")
    )
  }

  private fun parseApprovedPauseAction(
    mode: String,
    pause: JSONObject
  ): JSONObject? {
    if (mode != MODE_ALLOW_CONFIRMED_ACTION) {
      return null
    }

    if (pause.optString("status") != "confirmation_required") {
      throw IllegalArgumentException(
        "Only confirmation_required pauses can approve a hosted action."
      )
    }
    return pause.getJSONObject("action")
  }

  private const val MODE_CONTINUE = "continue"
  private const val MODE_ALLOW_CONFIRMED_ACTION = "allow_confirmed_action"
}
