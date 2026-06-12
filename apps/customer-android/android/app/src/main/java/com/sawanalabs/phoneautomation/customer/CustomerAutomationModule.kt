package com.sawanalabs.phoneautomation.customer

import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.provider.Settings
import android.text.TextUtils
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
  private var screenCaptureGranted = false
  private var pendingScreenCapturePromise: Promise? = null

  private val activityEventListener: ActivityEventListener =
    object : BaseActivityEventListener() {
      override fun onActivityResult(
        activity: Activity,
        requestCode: Int,
        resultCode: Int,
        data: Intent?
      ) {
        if (requestCode != SCREEN_CAPTURE_REQUEST_CODE) {
          return
        }

        val promise = pendingScreenCapturePromise ?: return
        pendingScreenCapturePromise = null

        if (resultCode == Activity.RESULT_OK && data != null) {
          screenCaptureGranted = true
          promise.resolve(createAuthoritySnapshot())
          return
        }

        screenCaptureGranted = false
        promise.reject(
          "SCREEN_CAPTURE_DENIED",
          "Screen capture permission was denied."
        )
      }
    }

  init {
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
    activity.startActivityForResult(
      projectionManager.createScreenCaptureIntent(),
      SCREEN_CAPTURE_REQUEST_CODE
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
      putString("screenCapture", if (screenCaptureGranted) "granted" else "missing")
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
    private const val SCREEN_CAPTURE_REQUEST_CODE = 41031
  }
}
