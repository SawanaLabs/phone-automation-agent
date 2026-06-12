package com.sawanalabs.phoneautomation.customer

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.view.accessibility.AccessibilityEvent

class CustomerAutomationAccessibilityService : AccessibilityService() {
  companion object {
    var current: CustomerAutomationAccessibilityService? = null
      private set
  }

  override fun onServiceConnected() {
    current = this
  }

  override fun onUnbind(intent: android.content.Intent?): Boolean {
    if (current === this) {
      current = null
    }
    return super.onUnbind(intent)
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) = Unit

  override fun onInterrupt() = Unit

  fun tap(
    x: Int,
    y: Int,
    onComplete: () -> Unit,
    onCancel: () -> Unit
  ) {
    val path = Path().apply {
      moveTo(x.toFloat(), y.toFloat())
    }
    dispatch(path, 0L, 80L, onComplete, onCancel)
  }

  fun swipe(
    startX: Int,
    startY: Int,
    endX: Int,
    endY: Int,
    onComplete: () -> Unit,
    onCancel: () -> Unit
  ) {
    val path = Path().apply {
      moveTo(startX.toFloat(), startY.toFloat())
      lineTo(endX.toFloat(), endY.toFloat())
    }
    dispatch(path, 0L, 450L, onComplete, onCancel)
  }

  private fun dispatch(
    path: Path,
    startTimeMs: Long,
    durationMs: Long,
    onComplete: () -> Unit,
    onCancel: () -> Unit
  ) {
    val gesture = GestureDescription.Builder()
      .addStroke(GestureDescription.StrokeDescription(path, startTimeMs, durationMs))
      .build()

    val accepted = dispatchGesture(
      gesture,
      object : GestureResultCallback() {
        override fun onCompleted(gestureDescription: GestureDescription?) {
          onComplete()
        }

        override fun onCancelled(gestureDescription: GestureDescription?) {
          onCancel()
        }
      },
      null
    )

    if (!accepted) {
      onCancel()
    }
  }
}
