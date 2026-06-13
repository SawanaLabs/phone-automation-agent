package com.sawanalabs.phoneautomation.customer

import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.text.TextUtils
import android.util.DisplayMetrics
import android.util.Log
import android.view.WindowManager
import android.accessibilityservice.AccessibilityService
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.roundToLong
import kotlin.math.roundToInt

class CustomerAutomationModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  private var pendingScreenCapturePromise: Promise? = null
  private val mainHandler = Handler(Looper.getMainLooper())

  private val activityEventListener: ActivityEventListener =
    object : BaseActivityEventListener() {
      override fun onActivityResult(
        activity: Activity,
        requestCode: Int,
        resultCode: Int,
        data: Intent?
      ) {
        handleScreenCaptureActivityResult(requestCode, resultCode, data, "react-context")
      }
    }

  init {
    activeModule = this
    reactContext.addActivityEventListener(activityEventListener)
  }

  override fun getName(): String = "CustomerAutomation"

  @ReactMethod
  fun getAuthoritySnapshot(promise: Promise) {
    promise.resolve(createAuthoritySnapshot())
  }

  @ReactMethod
  fun openAccessibilitySettings(promise: Promise) {
    val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    reactContext.startActivity(intent)
    promise.resolve(createAuthoritySnapshot())
  }

  @ReactMethod
  fun requestScreenCapture(promise: Promise) {
    if (pendingScreenCapturePromise != null) {
      promise.reject(
        "SCREEN_CAPTURE_REQUEST_IN_PROGRESS",
        "Screen capture permission is already being requested."
      )
      return
    }

    val activity = reactApplicationContext.currentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "No Android activity is available.")
      return
    }

    val projectionManager =
      reactContext.getSystemService(Context.MEDIA_PROJECTION_SERVICE)
        as MediaProjectionManager
    pendingScreenCapturePromise = promise
    Log.i(TAG, "Requesting screen capture permission.")
    activity.startActivityForResult(
      projectionManager.createScreenCaptureIntent(),
      SCREEN_CAPTURE_REQUEST_CODE
    )
  }

  @ReactMethod
  fun captureScreenState(promise: Promise) {
    if (!CustomerScreenCaptureService.isCaptureReady()) {
      promise.reject(
        "SCREEN_CAPTURE_MISSING",
        "Grant screen capture before requesting hosted decisions."
      )
      return
    }

    val metrics = getDisplayMetrics()
    CustomerScreenCaptureService.captureFrame(
      width = metrics.widthPixels,
      height = metrics.heightPixels,
      densityDpi = metrics.densityDpi,
      timeoutMs = SCREEN_CAPTURE_TIMEOUT_MS,
      onResult = { frame ->
        promise.resolve(createScreenState(frame.width, frame.height, frame.frameBase64))
      },
      onError = { failure -> rejectScreenCapture(promise, failure) }
    )
  }

  @ReactMethod
  fun tap(x: Double, y: Double, promise: Promise) {
    val service = getServiceOrReject(promise) ?: return
    service.tap(
      x.roundToInt(),
      y.roundToInt(),
      onComplete = { promise.resolve(null) },
      onCancel = {
        promise.reject("GESTURE_CANCELLED", "Tap gesture was cancelled.")
      }
    )
  }

  @ReactMethod
  fun doubleTap(x: Double, y: Double, promise: Promise) {
    val service = getServiceOrReject(promise) ?: return
    service.doubleTap(
      x.roundToInt(),
      y.roundToInt(),
      onComplete = { promise.resolve(null) },
      onCancel = {
        promise.reject("GESTURE_CANCELLED", "Double Tap gesture was cancelled.")
      }
    )
  }

  @ReactMethod
  fun longPress(x: Double, y: Double, promise: Promise) {
    val service = getServiceOrReject(promise) ?: return
    service.longPress(
      x.roundToInt(),
      y.roundToInt(),
      onComplete = { promise.resolve(null) },
      onCancel = {
        promise.reject("GESTURE_CANCELLED", "Long Press gesture was cancelled.")
      }
    )
  }

  @ReactMethod
  fun swipe(
    startX: Double,
    startY: Double,
    endX: Double,
    endY: Double,
    promise: Promise
  ) {
    val service = getServiceOrReject(promise) ?: return
    service.swipe(
      startX.roundToInt(),
      startY.roundToInt(),
      endX.roundToInt(),
      endY.roundToInt(),
      onComplete = { promise.resolve(null) },
      onCancel = {
        promise.reject("GESTURE_CANCELLED", "Swipe gesture was cancelled.")
      }
    )
  }

  @ReactMethod
  fun back(promise: Promise) {
    val service = getServiceOrReject(promise) ?: return
    if (service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)) {
      promise.resolve(null)
      return
    }
    promise.reject("GLOBAL_ACTION_FAILED", "Back action was rejected.")
  }

  @ReactMethod
  fun home(promise: Promise) {
    val service = getServiceOrReject(promise) ?: return
    if (service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME)) {
      promise.resolve(null)
      return
    }
    promise.reject("GLOBAL_ACTION_FAILED", "Home action was rejected.")
  }

  @ReactMethod
  fun launchApp(app: String, promise: Promise) {
    val target = app.trim()
    if (target.isEmpty()) {
      promise.reject("INVALID_LAUNCH_TARGET", "Launch app is required.")
      return
    }

    try {
      val intent = createLaunchIntent(target)
      if (intent == null) {
        promise.reject(
          "LAUNCH_TARGET_NOT_FOUND",
          "No launchable app found for target: $target."
        )
        return
      }

      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactContext.startActivity(intent)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject(
        "LAUNCH_FAILED",
        "Failed to launch app target: $target.",
        error
      )
    }
  }

  @ReactMethod
  fun typeText(text: String, promise: Promise) {
    val service = getServiceOrReject(promise) ?: return
    service.typeText(
      text,
      onComplete = { promise.resolve(null) },
      onFailure = { message ->
        promise.reject("NO_FOCUSED_INPUT_TARGET", message)
      }
    )
  }

  @ReactMethod
  fun wait(durationMs: Double, promise: Promise) {
    if (!durationMs.isFinite() || durationMs < 0.0) {
      promise.reject(
        "INVALID_WAIT_DURATION",
        "Wait duration must be a non-negative number: $durationMs."
      )
      return
    }

    mainHandler.postDelayed(
      { promise.resolve(null) },
      durationMs.roundToLong()
    )
  }

  @ReactMethod
  fun runHostedTask(
    runtimeUrl: String,
    runtimeAccessToken: String,
    instruction: String,
    maxSteps: Double,
    promise: Promise
  ) {
    val normalizedRuntimeUrl = normalizeRuntimeUrl(runtimeUrl)
    if (normalizedRuntimeUrl == null) {
      promise.reject("INVALID_RUNTIME_URL", "Hosted runtime URL is required.")
      return
    }

    val normalizedRuntimeAccessToken = runtimeAccessToken.trim()
    if (normalizedRuntimeAccessToken.isEmpty()) {
      promise.reject("INVALID_RUNTIME_ACCESS_TOKEN", "Runtime access token is required.")
      return
    }

    val normalizedInstruction = instruction.trim()
    if (normalizedInstruction.isEmpty()) {
      promise.reject("INVALID_INSTRUCTION", "Instruction is required.")
      return
    }

    if (!maxSteps.isFinite() || maxSteps < 1.0) {
      promise.reject("INVALID_MAX_STEPS", "Max steps must be positive: $maxSteps.")
      return
    }

    if (!isAccessibilityServiceEnabled()) {
      promise.reject(
        "ACCESSIBILITY_SERVICE_DISABLED",
        "Enable Customer Phone Agent accessibility service before running actions."
      )
      return
    }

    if (!CustomerScreenCaptureService.isCaptureReady()) {
      promise.reject(
        "SCREEN_CAPTURE_MISSING",
        "Grant screen capture before starting a hosted task."
      )
      return
    }

    Thread {
      try {
        val snapshot = runHostedTaskLoop(
          runtimeUrl = normalizedRuntimeUrl,
          runtimeAccessToken = normalizedRuntimeAccessToken,
          instruction = normalizedInstruction,
          maxSteps = maxSteps.roundToInt()
        )
        mainHandler.post { promise.resolve(snapshot) }
      } catch (error: Exception) {
        mainHandler.post {
          promise.reject(
            "HOSTED_TASK_FAILED",
            error.message ?: "Hosted task failed.",
            error
          )
        }
      }
    }.start()
  }

  private fun runHostedTaskLoop(
    runtimeUrl: String,
    runtimeAccessToken: String,
    instruction: String,
    maxSteps: Int
  ): WritableMap {
    val startResponse = postJson(
      "$runtimeUrl/sessions",
      runtimeAccessToken,
      JSONObject()
        .put("instruction", instruction)
        .put("source", "customer-android")
    )
    val task = startResponse.getJSONObject("task")
    val taskId = task.getString("id")
    val events = mutableListOf<NativeTaskEvent>()
    appendNativeEvent(events, "task.started", "Task started.")
    Log.i(TAG, "Hosted task started: $taskId")

    var lastActionResult: NativeActionResult? = null
    for (stepNumber in 1..maxSteps) {
      Log.i(TAG, "Hosted task $taskId step $stepNumber capture start.")
      val screen = try {
        captureScreenStateJsonBlocking()
      } catch (error: Exception) {
        val message = error.message ?: "Failed to capture screen state."
        Log.w(TAG, "Hosted task $taskId step $stepNumber capture failed: $message", error)
        appendNativeEvent(events, "task.failed", message)
        return createNativeSessionSnapshot(taskId, instruction, "failed", message, events)
      }
      Log.i(
        TAG,
        "Hosted task $taskId step $stepNumber captured package=${screen.optString("currentPackage")}"
      )

      val decision = try {
        postJson(
          "$runtimeUrl/sessions/${encodeUrlPath(taskId)}/steps",
          runtimeAccessToken,
          JSONObject()
            .put("instruction", instruction)
            .put("source", "customer-android")
            .put("stepNumber", stepNumber)
            .put("screen", screen)
            .put("lastActionResult", lastActionResult?.toJson() ?: JSONObject.NULL)
        )
      } catch (error: Exception) {
        val message = error.message ?: "Hosted runtime request failed."
        Log.w(TAG, "Hosted task $taskId step $stepNumber decision failed: $message", error)
        appendNativeEvent(events, "task.failed", message)
        return createNativeSessionSnapshot(taskId, instruction, "failed", message, events)
      }

      val action = decision.getJSONObject("action")
      if (action.optString("_metadata") == "finish") {
        val message = action.getString("message")
        Log.i(TAG, "Hosted task $taskId finished: $message")
        appendNativeEvent(events, "task.finished", message)
        return createNativeSessionSnapshot(taskId, instruction, "finished", message, events)
      }

      val pauseStatus = nativePauseStatus(action)
      if (pauseStatus != null) {
        val message = nativePauseMessage(action)
        appendNativeEvent(events, "task.paused", message)
        return createNativeSessionSnapshot(taskId, instruction, pauseStatus, message, events)
      }

      val actionName = action.getString("action")
      Log.i(TAG, "Hosted task $taskId step $stepNumber action=$actionName.")
      appendNativeEvent(events, "step.action", "$actionName requested.")
      lastActionResult = dispatchHostedActionNative(action)
      Log.i(
        TAG,
        "Hosted task $taskId step $stepNumber result=${lastActionResult.status}: ${lastActionResult.message}"
      )
      appendNativeEvent(events, "step.result", lastActionResult.message)
    }

    throw IllegalStateException(
      "Hosted routine action loop exceeded $maxSteps steps without finish."
    )
  }

  private fun dispatchHostedActionNative(action: JSONObject): NativeActionResult {
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
      Thread.sleep(ACTION_SETTLE_MS)
    }
  }

  private fun captureScreenStateJsonBlocking(): JSONObject {
    val metrics = getDisplayMetrics()
    val frameReference = AtomicReference<CustomerScreenCaptureFrame?>()
    val failureReference = AtomicReference<CustomerScreenCaptureFailure?>()
    val latch = CountDownLatch(1)

    CustomerScreenCaptureService.captureFrame(
      width = metrics.widthPixels,
      height = metrics.heightPixels,
      densityDpi = metrics.densityDpi,
      timeoutMs = SCREEN_CAPTURE_TIMEOUT_MS,
      onResult = { frame ->
        frameReference.set(frame)
        latch.countDown()
      },
      onError = { failure ->
        failureReference.set(failure)
        latch.countDown()
      }
    )

    if (!latch.await(SCREEN_CAPTURE_TIMEOUT_MS + 2500L, TimeUnit.MILLISECONDS)) {
      throw IllegalStateException("Timed out while capturing screen state.")
    }

    val failure = failureReference.get()
    if (failure != null) {
      throw IllegalStateException(failure.message, failure.cause)
    }

    val frame = frameReference.get()
      ?: throw IllegalStateException("Screen capture returned no frame.")
    val service = CustomerAutomationAccessibilityService.current
    return JSONObject()
      .put("frameBase64", frame.frameBase64)
      .put("frameMimeType", "image/jpeg")
      .put("width", frame.width)
      .put("height", frame.height)
      .put("currentPackage", service?.currentPackageName() ?: JSONObject.NULL)
      .put("accessibilitySummary", service?.summarizeWindow() ?: JSONObject.NULL)
  }

  private fun launchAppBlocking(app: String) {
    val target = app.trim()
    if (target.isEmpty()) {
      throw IllegalStateException("Launch app is required.")
    }

    runOnMainBlocking {
      val intent = createLaunchIntent(target)
        ?: throw IllegalStateException("No launchable app found for target: $target.")
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactContext.startActivity(intent)
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
    if (!latch.await(NATIVE_ACTION_TIMEOUT_MS, TimeUnit.MILLISECONDS)) {
      throw IllegalStateException(timeoutMessage)
    }
  }

  private fun convertRelativePoint(point: org.json.JSONArray): Pair<Int, Int> {
    if (point.length() != 2) {
      throw IllegalStateException("Point must be [x, y].")
    }

    val relativeX = point.getDouble(0)
    val relativeY = point.getDouble(1)
    if (relativeX < 0.0 || relativeX > 1000.0 || relativeY < 0.0 || relativeY > 1000.0) {
      throw IllegalStateException("Point coordinates must be between 0 and 1000.")
    }

    val metrics = getDisplayMetrics()
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

  private fun postJson(url: String, runtimeAccessToken: String, body: JSONObject): JSONObject {
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

  private fun normalizeRuntimeUrl(value: String): String? {
    val trimmed = value.trim()
    if (trimmed.isEmpty()) {
      return null
    }

    val withScheme = if (
      trimmed.startsWith("http://", ignoreCase = true) ||
      trimmed.startsWith("https://", ignoreCase = true)
    ) {
      trimmed
    } else {
      "http://$trimmed"
    }
    return withScheme.trimEnd('/')
  }

  private fun encodeUrlPath(value: String): String {
    return URLEncoder.encode(value, "UTF-8")
  }

  private fun appendNativeEvent(
    events: MutableList<NativeTaskEvent>,
    type: String,
    message: String
  ) {
    events.add(NativeTaskEvent(events.size + 1, type, message))
  }

  private fun createNativeSessionSnapshot(
    taskId: String,
    instruction: String,
    status: String,
    summary: String?,
    events: List<NativeTaskEvent>
  ): WritableMap {
    val task = Arguments.createMap().apply {
      putString("id", taskId)
      putString("instruction", instruction)
      putString("status", status)
      putString("summary", summary)
      putNull("error")
    }
    val eventArray = Arguments.createArray()
    events.forEach { event ->
      eventArray.pushMap(
        Arguments.createMap().apply {
          putInt("sequence", event.sequence)
          putString("type", event.type)
          putString("message", event.message)
        }
      )
    }
    return Arguments.createMap().apply {
      putMap("task", task)
      putArray("events", eventArray)
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

  private fun createLaunchIntent(target: String): Intent? {
    if (target.startsWith("intent:", ignoreCase = true) || target.contains("://")) {
      return Intent.parseUri(target, Intent.URI_INTENT_SCHEME)
    }

    return reactContext.packageManager.getLaunchIntentForPackage(target)
  }

  private fun handleScreenCaptureActivityResult(
    requestCode: Int,
    resultCode: Int,
    data: Intent?,
    source: String
  ) {
    if (requestCode != SCREEN_CAPTURE_REQUEST_CODE) {
      return
    }

    Log.i(
      TAG,
      "Received screen capture result from $source: resultCode=$resultCode data=${data != null}"
    )
    val promise = pendingScreenCapturePromise ?: run {
      Log.i(TAG, "Ignoring screen capture result because no promise is pending.")
      return
    }
    pendingScreenCapturePromise = null

    if (resultCode == Activity.RESULT_OK && data != null) {
      CustomerScreenCaptureService.startProjection(
        reactContext,
        resultCode,
        data
      ) { failure ->
        if (failure == null) {
          promise.resolve(createAuthoritySnapshot())
        } else {
          rejectScreenCapture(promise, failure)
        }
      }
      return
    }

    CustomerScreenCaptureService.stopProjection(reactContext)
    promise.reject(
      "SCREEN_CAPTURE_DENIED",
      "Screen capture permission was denied."
    )
  }

  private fun getDisplayMetrics(): DisplayMetrics {
    val metrics = DisplayMetrics()
    val windowManager =
      reactContext.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    @Suppress("DEPRECATION")
    windowManager.defaultDisplay.getRealMetrics(metrics)
    return metrics
  }

  private fun createScreenState(
    width: Int,
    height: Int,
    frameBase64: String
  ): WritableMap {
    val service = CustomerAutomationAccessibilityService.current
    return Arguments.createMap().apply {
      putString("frameBase64", frameBase64)
      putString("frameMimeType", "image/jpeg")
      putInt("width", width)
      putInt("height", height)
      putString("currentPackage", service?.currentPackageName())
      putString("accessibilitySummary", service?.summarizeWindow())
    }
  }

  private fun getServiceOrReject(
    promise: Promise
  ): CustomerAutomationAccessibilityService? {
    val service = CustomerAutomationAccessibilityService.current
    if (service != null) {
      return service
    }

    promise.reject(
      "ACCESSIBILITY_SERVICE_DISABLED",
      "Enable Customer Phone Agent accessibility service before running actions."
    )
    return null
  }

  private fun createAuthoritySnapshot(): WritableMap {
    return Arguments.createMap().apply {
      putString(
        "accessibilityService",
        if (isAccessibilityServiceEnabled()) "enabled" else "disabled"
      )
      putString(
        "screenCapture",
        if (CustomerScreenCaptureService.isCaptureReady()) "granted" else "missing"
      )
    }
  }

  private fun rejectScreenCapture(promise: Promise, failure: CustomerScreenCaptureFailure) {
    if (failure.cause == null) {
      promise.reject(failure.code, failure.message)
    } else {
      promise.reject(failure.code, failure.message, failure.cause)
    }
  }

  private fun isAccessibilityServiceEnabled(): Boolean {
    val enabled = Settings.Secure.getInt(
      reactContext.contentResolver,
      Settings.Secure.ACCESSIBILITY_ENABLED,
      0
    )
    if (enabled != 1) {
      return false
    }

    val expected = ComponentName(
      reactContext,
      CustomerAutomationAccessibilityService::class.java
    )
    val enabledServices = Settings.Secure.getString(
      reactContext.contentResolver,
      Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
    ) ?: return false

    val splitter = TextUtils.SimpleStringSplitter(':')
    splitter.setString(enabledServices)
    while (splitter.hasNext()) {
      val enabledService = ComponentName.unflattenFromString(splitter.next())
      if (enabledService == expected) {
        return true
      }
    }

    return false
  }

  companion object {
    private const val TAG = "CustomerAutomation"
    private const val SCREEN_CAPTURE_REQUEST_CODE = 41031
    private const val SCREEN_CAPTURE_TIMEOUT_MS = 1500L
    private const val NATIVE_ACTION_TIMEOUT_MS = 6000L
    private const val ACTION_SETTLE_MS = 700L
    private const val HOSTED_RUNTIME_TIMEOUT_MS = 30000
    private var activeModule: CustomerAutomationModule? = null

    fun handleActivityResult(
      requestCode: Int,
      resultCode: Int,
      data: Intent?
    ) {
      activeModule?.handleScreenCaptureActivityResult(
        requestCode,
        resultCode,
        data,
        "activity"
      )
    }
  }

  private data class NativeTaskEvent(
    val sequence: Int,
    val type: String,
    val message: String
  )

  private data class NativeActionResult(
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
}
