package com.sawanalabs.phoneautomation.customer

import android.Manifest
import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.os.Build
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
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener
import org.json.JSONObject
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.roundToLong
import kotlin.math.roundToInt

class CustomerAutomationModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext), PermissionListener {
  private var pendingScreenCapturePromise: Promise? = null
  private var pendingNotificationPermissionPromise: Promise? = null
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
      Log.e(TAG, "Screen capture permission request failed: no Android activity.")
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
  fun requestNotifications(promise: Promise) {
    if (hasNotificationPermission()) {
      promise.resolve(createAuthoritySnapshot())
      return
    }

    if (pendingNotificationPermissionPromise != null) {
      promise.reject(
        "NOTIFICATION_REQUEST_IN_PROGRESS",
        "Notification permission is already being requested."
      )
      return
    }

    val activity = reactApplicationContext.currentActivity as? PermissionAwareActivity
    if (activity == null) {
      Log.e(TAG, "Notification permission request failed: no Android activity.")
      promise.reject("NO_ACTIVITY", "No Android activity is available.")
      return
    }

    pendingNotificationPermissionPromise = promise
    Log.i(TAG, "Requesting notification permission.")
    activity.requestPermissions(
      arrayOf(Manifest.permission.POST_NOTIFICATIONS),
      NOTIFICATION_PERMISSION_REQUEST_CODE,
      this
    )
  }

  override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<String>,
    grantResults: IntArray
  ): Boolean {
    if (requestCode != NOTIFICATION_PERMISSION_REQUEST_CODE) {
      return false
    }

    val promise = pendingNotificationPermissionPromise ?: run {
      Log.i(TAG, "Ignoring notification permission result because no promise is pending.")
      return true
    }
    pendingNotificationPermissionPromise = null
    val granted = grantResults.isNotEmpty() &&
      grantResults[0] == PackageManager.PERMISSION_GRANTED
    Log.i(TAG, "Notification permission result: granted=$granted")
    promise.resolve(createAuthoritySnapshot())
    return true
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
      val intent = NativeLaunchIntentResolver(reactContext).createLaunchIntent(target)
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
  fun showCompletionSignal(session: ReadableMap, promise: Promise) {
    try {
      val task = session.getMap("task")
        ?: throw IllegalStateException("Task snapshot is required for completion signal.")
      val taskId = task.getString("id") ?: "customer-task"
      val status = task.getString("status") ?: "unknown"
      val summary = if (task.hasKey("summary") && !task.isNull("summary")) {
        task.getString("summary")
      } else {
        null
      }

      if (!shouldShowCompletionSignal(status)) {
        promise.resolve(
          Arguments.createMap().apply {
            putString("status", "delivered")
            putString("message", "Completion signal not required.")
          }
        )
        return
      }

      showTaskOutcomeNotification(
        taskId = taskId,
        status = status,
        message = summary ?: defaultCompletionSignalMessage(status)
      )
      promise.resolve(
        Arguments.createMap().apply {
          putString("status", "delivered")
          putString("message", "Completion signal delivered.")
        }
      )
    } catch (error: Exception) {
      Log.e(TAG, "Completion signal failed: ${error.message}", error)
      promise.reject(
        "COMPLETION_SIGNAL_FAILED",
        error.message ?: "Completion signal failed.",
        error
      )
    }
  }

  @ReactMethod
  fun runHostedTask(
    runtimeUrl: String,
    runtimeAccessToken: String,
    instruction: String,
    maxSteps: Double,
    resumeStateJson: String?,
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
        val snapshot = createNativeHostedTaskLoop(
          runtimeUrl = normalizedRuntimeUrl,
          runtimeAccessToken = normalizedRuntimeAccessToken
        ).run(
          NativeHostedTaskResumeStateParser.createInput(
            instruction = normalizedInstruction,
            maxSteps = maxSteps.roundToInt(),
            resumeStateJson = resumeStateJson
          )
        )
        mainHandler.post { promise.resolve(snapshot) }
      } catch (error: Exception) {
        Log.e(TAG, "Hosted task failed before returning a snapshot: ${error.message}", error)
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

  private fun createNativeHostedTaskLoop(
    runtimeUrl: String,
    runtimeAccessToken: String
  ): NativeHostedTaskLoop {
    return NativeHostedTaskLoop(
      runtimeClient = NativeHostedRuntimeHttpClient(runtimeUrl, runtimeAccessToken),
      screenStateCollector = object : NativeHostedScreenStateCollector {
        override fun capture(): JSONObject = captureScreenStateJsonBlocking()
      },
      actionExecutor = NativeRoutineActionExecutor(
        context = reactContext,
        mainHandler = mainHandler,
        displayMetricsProvider = ::getDisplayMetrics
      )
    )
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
    Log.e(TAG, "Native action rejected: accessibility service disabled.")
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
      putString(
        "notifications",
        if (hasNotificationPermission()) "granted" else "missing"
      )
    }
  }

  private fun hasNotificationPermission(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
      return true
    }

    return reactContext.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
      PackageManager.PERMISSION_GRANTED
  }

  private fun showTaskOutcomeNotification(
    taskId: String,
    status: String,
    message: String
  ) {
    if (!hasNotificationPermission()) {
      throw IllegalStateException("Notification permission is missing.")
    }

    createCompletionSignalChannel()
    val notificationManager =
      reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val notification = createTaskOutcomeNotification(taskId, status, message)
    val notificationId = COMPLETION_SIGNAL_NOTIFICATION_ID_BASE +
      (taskId.hashCode() and 0x0fffffff)
    notificationManager.notify(notificationId, notification)
    Log.i(TAG, "Completion signal delivered: taskId=$taskId status=$status")
  }

  private fun createTaskOutcomeNotification(
    taskId: String,
    status: String,
    message: String
  ): Notification {
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(reactContext, COMPLETION_SIGNAL_CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(reactContext)
    }

    builder
      .setSmallIcon(completionSignalIcon(status))
      .setContentTitle(completionSignalTitle(status))
      .setContentText(message)
      .setStyle(Notification.BigTextStyle().bigText(message))
      .setContentIntent(createCompletionSignalPendingIntent(taskId))
      .setAutoCancel(true)
      .setShowWhen(true)

    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      @Suppress("DEPRECATION")
      builder.setPriority(Notification.PRIORITY_DEFAULT)
    }

    return builder.build()
  }

  private fun createCompletionSignalPendingIntent(taskId: String): PendingIntent {
    val intent = reactContext.packageManager.getLaunchIntentForPackage(reactContext.packageName)
      ?: Intent(reactContext, MainActivity::class.java)
    intent.addFlags(
      Intent.FLAG_ACTIVITY_CLEAR_TOP or
        Intent.FLAG_ACTIVITY_SINGLE_TOP or
        Intent.FLAG_ACTIVITY_NEW_TASK
    )
    intent.putExtra("customer_task_id", taskId)

    val flags = PendingIntent.FLAG_UPDATE_CURRENT or
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        PendingIntent.FLAG_IMMUTABLE
      } else {
        0
      }
    return PendingIntent.getActivity(
      reactContext,
      taskId.hashCode(),
      intent,
      flags
    )
  }

  private fun createCompletionSignalChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }

    val notificationManager =
      reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val channel = NotificationChannel(
      COMPLETION_SIGNAL_CHANNEL_ID,
      "Task status",
      NotificationManager.IMPORTANCE_DEFAULT
    ).apply {
      description = "Customer Phone Agent task outcomes"
    }
    notificationManager.createNotificationChannel(channel)
  }

  private fun shouldShowCompletionSignal(status: String): Boolean {
    return status == "finished" ||
      status == "failed" ||
      status == "stopped" ||
      status == "takeover_required" ||
      status == "interaction_required" ||
      status == "confirmation_required"
  }

  private fun completionSignalTitle(status: String): String {
    return when (status) {
      "finished" -> "Task finished"
      "failed" -> "Task failed"
      "stopped" -> "Task stopped"
      else -> "Task needs attention"
    }
  }

  private fun defaultCompletionSignalMessage(status: String): String {
    return when (status) {
      "finished" -> "The task finished."
      "failed" -> "The task failed."
      "stopped" -> "The task stopped."
      else -> "The task needs your attention."
    }
  }

  private fun completionSignalIcon(status: String): Int {
    return if (status == "failed") {
      android.R.drawable.stat_notify_error
    } else {
      android.R.drawable.stat_sys_upload_done
    }
  }

  private fun rejectScreenCapture(promise: Promise, failure: CustomerScreenCaptureFailure) {
    Log.e(TAG, "Screen capture failed: ${failure.code}: ${failure.message}", failure.cause)
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
    private const val NOTIFICATION_PERMISSION_REQUEST_CODE = 41032
    private const val SCREEN_CAPTURE_TIMEOUT_MS = 5000L
    private const val COMPLETION_SIGNAL_CHANNEL_ID = "customer_task_status"
    private const val COMPLETION_SIGNAL_NOTIFICATION_ID_BASE = 52000
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
}
