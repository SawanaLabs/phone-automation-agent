package com.sawanalabs.phoneautomation.customer

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Handler
import android.util.DisplayMetrics
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.roundToInt
import kotlin.math.roundToLong

internal class NativeRoutineActionExecutor(
  private val context: Context,
  private val mainHandler: Handler,
  private val displayMetricsProvider: () -> DisplayMetrics,
  private val launchIntentResolver: NativeLaunchIntentResolver = NativeLaunchIntentResolver(context),
  private val actionSettleMs: Long = ACTION_SETTLE_MS,
  private val nativeActionTimeoutMs: Long = NATIVE_ACTION_TIMEOUT_MS
) : NativeHostedActionExecutor {
  override fun pauseFor(action: JSONObject): NativeHostedPause? {
    val pauseStatus = nativePauseStatus(action) ?: return null
    return NativeHostedPause(
      status = pauseStatus,
      action = action,
      message = nativePauseMessage(action)
    )
  }

  override fun dispatch(action: JSONObject): NativeActionResult {
    val actionName = action.getString("action")

    if (actionName == "Note") {
      return NativeActionResult(
        status = "succeeded",
        action = "Note",
        message = "Note recorded: ${action.getString("message")}"
      )
    }

    if (actionName == "Call_API") {
      return NativeActionResult(
        status = "unsupported",
        action = "Call_API",
        message = "Call_API is a runtime-local action and is not implemented by this hosted runtime."
      )
    }

    return try {
      dispatchRoutineActionNative(actionName, action)
      NativeActionResult(
        status = "succeeded",
        action = actionName,
        message = "$actionName completed."
      )
    } catch (error: Exception) {
      Log.e(TAG, "Native action failed: action=$actionName message=${error.message}", error)
      NativeActionResult(
        status = "failed",
        action = actionName,
        message = error.message ?: "$actionName failed."
      )
    }
  }

  private fun dispatchRoutineActionNative(actionName: String, action: JSONObject) {
    when (actionName) {
      "Tap" -> {
        val point = convertRelativePoint(action.getJSONArray("element"))
        runGestureBlocking("Tap") { service, onComplete, onCancel ->
          service.tap(point.first, point.second, onComplete, onCancel)
        }
      }
      "Double Tap" -> {
        val point = convertRelativePoint(action.getJSONArray("element"))
        runGestureBlocking("Double Tap") { service, onComplete, onCancel ->
          service.doubleTap(point.first, point.second, onComplete, onCancel)
        }
      }
      "Long Press" -> {
        val point = convertRelativePoint(action.getJSONArray("element"))
        runGestureBlocking("Long Press") { service, onComplete, onCancel ->
          service.longPress(point.first, point.second, onComplete, onCancel)
        }
      }
      "Swipe" -> {
        val start = convertRelativePoint(action.getJSONArray("start"))
        val end = convertRelativePoint(action.getJSONArray("end"))
        runGestureBlocking("Swipe") { service, onComplete, onCancel ->
          service.swipe(start.first, start.second, end.first, end.second, onComplete, onCancel)
        }
      }
      "Back" -> runGlobalActionBlocking(
        AccessibilityService.GLOBAL_ACTION_BACK,
        "Back action was rejected."
      )
      "Home" -> runGlobalActionBlocking(
        AccessibilityService.GLOBAL_ACTION_HOME,
        "Home action was rejected."
      )
      "Launch" -> launchAppBlocking(action.getString("app"))
      "Type", "Type_Name" -> typeTextBlocking(action.getString("text"))
      "Wait" -> Thread.sleep(parseWaitDurationMs(action.optString("duration", "1 seconds")))
      else -> throw IllegalStateException("Unsupported routine action: $actionName")
    }

    if (actionName != "Wait") {
      Thread.sleep(actionSettleMs)
    }
  }

  private fun launchAppBlocking(app: String) {
    val target = app.trim()
    if (target.isEmpty()) {
      throw IllegalStateException("Launch app is required.")
    }

    runOnMainBlocking {
      val intent = launchIntentResolver.createLaunchIntent(target)
        ?: throw IllegalStateException("No launchable app found for target: $target.")
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }
  }

  private fun typeTextBlocking(text: String) {
    val result = AtomicReference<String?>()
    val latch = CountDownLatch(1)
    mainHandler.post {
      val service = CustomerAutomationAccessibilityService.current
      if (service == null) {
        result.set("Enable Customer Phone Agent accessibility service before running actions.")
        latch.countDown()
        return@post
      }

      service.typeText(
        text,
        onComplete = { latch.countDown() },
        onFailure = { message ->
          result.set(message)
          latch.countDown()
        }
      )
    }
    awaitNativeAction(latch, "Type action timed out.")
    result.get()?.let { throw IllegalStateException(it) }
  }

  private fun runGlobalActionBlocking(action: Int, failureMessage: String) {
    runOnMainBlocking {
      val service = CustomerAutomationAccessibilityService.current
        ?: throw IllegalStateException(
          "Enable Customer Phone Agent accessibility service before running actions."
        )
      if (!service.performGlobalAction(action)) {
        throw IllegalStateException(failureMessage)
      }
    }
  }

  private fun runGestureBlocking(
    actionName: String,
    block: (
      CustomerAutomationAccessibilityService,
      () -> Unit,
      () -> Unit
    ) -> Unit
  ) {
    val result = AtomicReference<String?>()
    val latch = CountDownLatch(1)
    mainHandler.post {
      val service = CustomerAutomationAccessibilityService.current
      if (service == null) {
        result.set("Enable Customer Phone Agent accessibility service before running actions.")
        latch.countDown()
        return@post
      }

      block(
        service,
        { latch.countDown() },
        {
          result.set("$actionName gesture was cancelled.")
          latch.countDown()
        }
      )
    }
    awaitNativeAction(latch, "$actionName action timed out.")
    result.get()?.let { throw IllegalStateException(it) }
  }

  private fun runOnMainBlocking(block: () -> Unit) {
    val failure = AtomicReference<Exception?>()
    val latch = CountDownLatch(1)
    mainHandler.post {
      try {
        block()
      } catch (error: Exception) {
        failure.set(error)
      } finally {
        latch.countDown()
      }
    }

    awaitNativeAction(latch, "Android action timed out.")
    failure.get()?.let { throw it }
  }

  private fun awaitNativeAction(latch: CountDownLatch, timeoutMessage: String) {
    if (!latch.await(nativeActionTimeoutMs, TimeUnit.MILLISECONDS)) {
      throw IllegalStateException(timeoutMessage)
    }
  }

  private fun convertRelativePoint(point: JSONArray): Pair<Int, Int> {
    if (point.length() != 2) {
      throw IllegalStateException("Point must be [x, y].")
    }

    val relativeX = point.getDouble(0)
    val relativeY = point.getDouble(1)
    if (relativeX < 0.0 || relativeX > 1000.0 || relativeY < 0.0 || relativeY > 1000.0) {
      throw IllegalStateException("Point coordinates must be between 0 and 1000.")
    }

    val metrics = displayMetricsProvider()
    return Pair(
      ((relativeX / 1000.0) * metrics.widthPixels).roundToInt(),
      ((relativeY / 1000.0) * metrics.heightPixels).roundToInt()
    )
  }

  private fun parseWaitDurationMs(duration: String): Long {
    val normalized = duration.trim()
    if (normalized.isEmpty()) {
      return 1000L
    }

    val amount = normalized
      .split(Regex("\\s+"))
      .firstOrNull()
      ?.toDoubleOrNull()
      ?: throw IllegalStateException("Invalid Wait duration: $duration")

    if (amount < 0.0) {
      throw IllegalStateException("Wait duration must be non-negative: $duration")
    }

    return if (normalized.contains("ms", ignoreCase = true)) {
      amount.roundToLong()
    } else {
      (amount * 1000.0).roundToLong()
    }
  }

  private fun nativePauseStatus(action: JSONObject): String? {
    val actionName = action.optString("action")
    if (actionName == "Take_over") {
      return "takeover_required"
    }
    if (actionName == "Interact") {
      return "interaction_required"
    }
    if (actionName == "Tap" && action.has("message")) {
      return "confirmation_required"
    }
    return null
  }

  private fun nativePauseMessage(action: JSONObject): String {
    return action.optString("message").ifBlank {
      "User interaction required."
    }
  }

  private companion object {
    private const val TAG = "CustomerAutomation"
    private const val ACTION_SETTLE_MS = 700L
    private const val NATIVE_ACTION_TIMEOUT_MS = 6000L
  }
}

internal class NativeLaunchIntentResolver(private val context: Context) {
  fun createLaunchIntent(target: String): Intent? {
    if (target.startsWith("intent:", ignoreCase = true) || target.contains("://")) {
      return Intent.parseUri(target, Intent.URI_INTENT_SCHEME)
    }

    val packageManager = context.packageManager
    return packageManager.getLaunchIntentForPackage(target)
      ?: resolveLaunchIntentByLabel(packageManager, target)
  }

  private fun resolveLaunchIntentByLabel(
    packageManager: PackageManager,
    target: String
  ): Intent? {
    val normalizedTarget = normalizeLaunchLabel(target)
    val launcherIntent = Intent(Intent.ACTION_MAIN).apply {
      addCategory(Intent.CATEGORY_LAUNCHER)
    }
    val launchableApps = packageManager.queryIntentActivities(
      launcherIntent,
      PackageManager.MATCH_DEFAULT_ONLY
    )
    val exactMatch = launchableApps.firstOrNull { resolveInfo ->
      normalizeLaunchLabel(resolveInfo.loadLabel(packageManager).toString()) ==
        normalizedTarget
    }
    val partialMatch = exactMatch ?: launchableApps.firstOrNull { resolveInfo ->
      val label = normalizeLaunchLabel(resolveInfo.loadLabel(packageManager).toString())
      label.contains(normalizedTarget) || normalizedTarget.contains(label)
    }
    val activityInfo = partialMatch?.activityInfo ?: return null

    return Intent(Intent.ACTION_MAIN).apply {
      addCategory(Intent.CATEGORY_LAUNCHER)
      setClassName(activityInfo.packageName, activityInfo.name)
    }
  }

  private fun normalizeLaunchLabel(value: String): String {
    return value.trim().lowercase()
  }
}
