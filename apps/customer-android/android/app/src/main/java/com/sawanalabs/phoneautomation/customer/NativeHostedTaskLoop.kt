package com.sawanalabs.phoneautomation.customer

import android.util.Log
import com.facebook.react.bridge.WritableMap
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

internal data class NativeHostedTaskInput(
  val instruction: String,
  val maxSteps: Int,
  val taskId: String? = null,
  val initialEvents: List<NativeTaskEvent> = emptyList(),
  val initialLastActionResult: NativeActionResult? = null,
  val initialStepNumber: Int = 1,
  val approvedPauseAction: JSONObject? = null
)

internal data class NativeTaskEvent(
  val sequence: Int,
  val type: String,
  val message: String
)

internal data class NativeActionResult(
  val status: String,
  val action: String,
  val message: String
) {
  fun toJson(): JSONObject {
    return JSONObject()
      .put("status", status)
      .put("action", action)
      .put("message", message)
  }
}

internal data class NativeHostedPause(
  val status: String,
  val action: JSONObject,
  val message: String
)

internal interface NativeHostedRuntimeClient {
  fun startSession(instruction: String): JSONObject

  fun requestStep(
    taskId: String,
    instruction: String,
    stepNumber: Int,
    screen: JSONObject,
    lastActionResult: NativeActionResult?
  ): JSONObject
}

internal interface NativeHostedScreenStateCollector {
  fun capture(): JSONObject
}

internal interface NativeHostedActionExecutor {
  fun pauseFor(action: JSONObject): NativeHostedPause?

  fun dispatch(action: JSONObject): NativeActionResult
}

internal class NativeHostedTaskLoop(
  private val runtimeClient: NativeHostedRuntimeClient,
  private val screenStateCollector: NativeHostedScreenStateCollector,
  private val actionExecutor: NativeHostedActionExecutor,
  private val snapshotMapper: NativeSessionSnapshotMapper = NativeSessionSnapshotMapper()
) {
  fun run(input: NativeHostedTaskInput): WritableMap {
    val taskId = input.taskId ?: startNewTask(input.instruction)
    val events = input.initialEvents.toMutableList()
    if (input.taskId == null) {
      appendNativeEvent(events, "task.started", "Task started.")
      Log.i(TAG, "Hosted task started: $taskId")
    } else {
      Log.i(TAG, "Hosted task resumed: $taskId from step ${input.initialStepNumber}.")
    }

    var lastActionResult: NativeActionResult? = input.initialLastActionResult
    if (input.approvedPauseAction != null) {
      val actionName = input.approvedPauseAction.getString("action")
      Log.i(TAG, "Hosted task $taskId approved pause action=$actionName.")
      lastActionResult = actionExecutor.dispatch(input.approvedPauseAction)
      appendNativeEvent(events, "step.result", lastActionResult.message)
    }

    for (stepNumber in input.initialStepNumber..input.maxSteps) {
      Log.i(TAG, "Hosted task $taskId step $stepNumber capture start.")
      val screen = try {
        screenStateCollector.capture()
      } catch (error: Exception) {
        val message = error.message ?: "Failed to capture screen state."
        Log.e(TAG, "Hosted task $taskId step $stepNumber capture failed: $message", error)
        appendNativeEvent(events, "task.failed", message)
        return snapshotMapper.create(taskId, input.instruction, "failed", message, events)
      }
      Log.i(
        TAG,
        "Hosted task $taskId step $stepNumber captured package=${screen.optString("currentPackage")}"
      )

      val decision = try {
        runtimeClient.requestStep(
          taskId = taskId,
          instruction = input.instruction,
          stepNumber = stepNumber,
          screen = screen,
          lastActionResult = lastActionResult
        )
      } catch (error: Exception) {
        val message = error.message ?: "Hosted runtime request failed."
        Log.e(TAG, "Hosted task $taskId step $stepNumber decision failed: $message", error)
        appendNativeEvent(events, "task.failed", message)
        return snapshotMapper.create(taskId, input.instruction, "failed", message, events)
      }

      val action = decision.getJSONObject("action")
      if (action.optString("_metadata") == "finish") {
        val message = action.getString("message")
        Log.i(TAG, "Hosted task $taskId finished: $message")
        appendNativeEvent(events, "task.finished", message)
        return snapshotMapper.create(taskId, input.instruction, "finished", message, events)
      }

      if (action.optString("_metadata") == "failed") {
        val message = action.optString("message").ifBlank {
          "Hosted runtime returned a failed action."
        }
        Log.e(TAG, "Hosted task $taskId failed: $message")
        appendNativeEvent(events, "task.failed", message)
        return snapshotMapper.create(taskId, input.instruction, "failed", message, events)
      }

      val pause = actionExecutor.pauseFor(action)
      if (pause != null) {
        appendNativeEvent(events, "task.paused", pause.message)
        return snapshotMapper.create(
          taskId = taskId,
          instruction = input.instruction,
          status = pause.status,
          summary = pause.message,
          events = events,
          pauseAction = pause.action,
          nextStepNumber = stepNumber + 1,
          lastActionResult = lastActionResult
        )
      }

      val actionName = action.getString("action")
      Log.i(TAG, "Hosted task $taskId step $stepNumber action=$actionName.")
      appendNativeEvent(events, "step.action", "$actionName requested.")
      lastActionResult = actionExecutor.dispatch(action)
      val resultMessage =
        "Hosted task $taskId step $stepNumber result=${lastActionResult.status}: ${lastActionResult.message}"
      if (lastActionResult.status == "failed") {
        Log.e(TAG, resultMessage)
      } else {
        Log.i(TAG, resultMessage)
      }
      appendNativeEvent(events, "step.result", lastActionResult.message)
    }

    throw IllegalStateException(
      "Hosted routine action loop exceeded ${input.maxSteps} steps without finish."
    )
  }

  private fun startNewTask(instruction: String): String {
    val startResponse = runtimeClient.startSession(instruction)
    val task = startResponse.getJSONObject("task")
    return task.getString("id")
  }

  private fun appendNativeEvent(
    events: MutableList<NativeTaskEvent>,
    type: String,
    message: String
  ) {
    events.add(NativeTaskEvent(events.size + 1, type, message))
  }

  private companion object {
    private const val TAG = "CustomerAutomation"
  }
}

internal class NativeHostedRuntimeHttpClient(
  private val runtimeUrl: String,
  private val runtimeAccessToken: String
) : NativeHostedRuntimeClient {
  override fun startSession(instruction: String): JSONObject {
    return postJson(
      "$runtimeUrl/sessions",
      JSONObject()
        .put("instruction", instruction)
        .put("source", "customer-android")
    )
  }

  override fun requestStep(
    taskId: String,
    instruction: String,
    stepNumber: Int,
    screen: JSONObject,
    lastActionResult: NativeActionResult?
  ): JSONObject {
    return postJson(
      "$runtimeUrl/sessions/${encodeUrlPath(taskId)}/steps",
      JSONObject()
        .put("instruction", instruction)
        .put("source", "customer-android")
        .put("stepNumber", stepNumber)
        .put("screen", screen)
        .put("lastActionResult", lastActionResult?.toJson() ?: JSONObject.NULL)
    )
  }

  private fun postJson(url: String, body: JSONObject): JSONObject {
    val connection = URL(url).openConnection() as HttpURLConnection
    try {
      connection.requestMethod = "POST"
      connection.connectTimeout = HOSTED_RUNTIME_TIMEOUT_MS
      connection.readTimeout = HOSTED_RUNTIME_TIMEOUT_MS
      connection.doOutput = true
      connection.setRequestProperty("Content-Type", "application/json")
      connection.setRequestProperty("Authorization", "Bearer $runtimeAccessToken")
      connection.outputStream.use { output ->
        output.write(body.toString().toByteArray(Charsets.UTF_8))
      }

      val status = connection.responseCode
      val responseText = readResponseText(connection, status)
      if (status !in 200..299) {
        throw IllegalStateException(describeHttpFailure(status, responseText))
      }
      return JSONObject(responseText.ifBlank { "{}" })
    } finally {
      connection.disconnect()
    }
  }

  private fun readResponseText(connection: HttpURLConnection, status: Int): String {
    val stream = if (status in 200..299) {
      connection.inputStream
    } else {
      connection.errorStream
    } ?: return ""

    return stream.bufferedReader(Charsets.UTF_8).use { it.readText() }
  }

  private fun describeHttpFailure(status: Int, responseText: String): String {
    return try {
      val detail = JSONObject(responseText).optString("detail")
      if (detail.isNotBlank()) {
        detail
      } else {
        "Hosted runtime returned $status."
      }
    } catch (_: Exception) {
      "Hosted runtime returned $status."
    }
  }

  private fun encodeUrlPath(value: String): String {
    return URLEncoder.encode(value, "UTF-8")
  }

  private companion object {
    private const val HOSTED_RUNTIME_TIMEOUT_MS = 30000
  }
}
