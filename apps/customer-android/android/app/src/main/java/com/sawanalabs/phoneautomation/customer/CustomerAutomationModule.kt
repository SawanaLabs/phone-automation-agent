package com.sawanalabs.phoneautomation.customer

import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
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
import kotlin.math.roundToInt

class CustomerAutomationModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  private var pendingScreenCapturePromise: Promise? = null

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
