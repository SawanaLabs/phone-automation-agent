package com.sawanalabs.phoneautomation.customer

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.os.Bundle
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

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

  fun typeText(
    text: String,
    onComplete: () -> Unit,
    onFailure: (String) -> Unit
  ) {
    val root = rootInActiveWindow
    if (root == null) {
      onFailure("No active accessibility window is available for Type action.")
      return
    }

    val focusedInput = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
    if (focusedInput == null) {
      onFailure("No focused input target is available for Type action.")
      return
    }

    val arguments = Bundle().apply {
      putCharSequence(
        AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
        text
      )
    }
    if (focusedInput.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments)) {
      onComplete()
      return
    }

    onFailure("Focused input target rejected Type action.")
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
