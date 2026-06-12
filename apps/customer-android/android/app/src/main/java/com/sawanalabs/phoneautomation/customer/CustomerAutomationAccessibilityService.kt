package com.sawanalabs.phoneautomation.customer

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.graphics.Rect
import android.os.Bundle
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

class CustomerAutomationAccessibilityService : AccessibilityService() {
  companion object {
    var current: CustomerAutomationAccessibilityService? = null
      private set
  }

  private var lastTappedInput: AccessibilityNodeInfo? = null

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
    dispatch(path, 0L, 80L, TapPoint(x, y), onComplete, onCancel)
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
    dispatch(path, 0L, 450L, null, onComplete, onCancel)
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

    val inputTarget = findInputTarget(root)
    if (inputTarget == null) {
      onFailure("No focused input target is available for Type action.")
      return
    }

    val arguments = Bundle().apply {
      putCharSequence(
        AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
        text
      )
    }
    if (inputTarget.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments)) {
      onComplete()
      return
    }

    onFailure("Focused input target rejected Type action.")
  }

  fun currentPackageName(): String? {
    return rootInActiveWindow?.packageName?.toString()
  }

  fun summarizeWindow(maxNodes: Int = 32): String? {
    val root = rootInActiveWindow ?: return null
    val nodes = mutableListOf<String>()
    collectNodeSummary(root, nodes, maxNodes)
    return nodes.joinToString("\n")
  }

  private fun dispatch(
    path: Path,
    startTimeMs: Long,
    durationMs: Long,
    tapPoint: TapPoint?,
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
          if (tapPoint != null) {
            rememberInputAt(tapPoint.x, tapPoint.y)
          }
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

  private fun collectNodeSummary(
    node: AccessibilityNodeInfo,
    nodes: MutableList<String>,
    maxNodes: Int
  ) {
    if (nodes.size >= maxNodes || !node.isVisibleToUser) {
      return
    }

    val bounds = Rect()
    node.getBoundsInScreen(bounds)
    val parts = mutableListOf<String>()
    parts.add(node.className?.toString() ?: "node")
    addSummaryPart(parts, "text", node.text?.toString())
    addSummaryPart(parts, "description", node.contentDescription?.toString())
    addSummaryPart(parts, "viewId", node.viewIdResourceName)
    if (node.isClickable) {
      parts.add("clickable")
    }
    if (node.isEditable) {
      parts.add("editable")
    }
    parts.add("bounds=${bounds.left},${bounds.top},${bounds.right},${bounds.bottom}")
    nodes.add(parts.joinToString(" "))

    for (index in 0 until node.childCount) {
      val child = node.getChild(index) ?: continue
      collectNodeSummary(child, nodes, maxNodes)
      if (nodes.size >= maxNodes) {
        return
      }
    }
  }

  private fun addSummaryPart(
    parts: MutableList<String>,
    label: String,
    value: String?
  ) {
    val normalized = value?.trim()
    if (!normalized.isNullOrEmpty()) {
      parts.add("$label=${normalized.take(80)}")
    }
  }

  private fun rememberInputAt(x: Int, y: Int) {
    val root = rootInActiveWindow
    if (root == null) {
      clearLastTappedInput()
      return
    }

    val input = findEditableNodeAt(root, x, y)
    if (input == null) {
      clearLastTappedInput()
      return
    }

    input.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
    lastTappedInput = input
  }

  private fun findInputTarget(root: AccessibilityNodeInfo): AccessibilityNodeInfo? {
    val focusedInput = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
    if (isUsableInput(focusedInput)) {
      return focusedInput
    }

    val tappedInput = lastTappedInput
    if (tappedInput != null && tappedInput.refresh() && isUsableInput(tappedInput)) {
      return tappedInput
    }

    clearLastTappedInput()
    return null
  }

  private fun findEditableNodeAt(
    node: AccessibilityNodeInfo,
    x: Int,
    y: Int
  ): AccessibilityNodeInfo? {
    val bounds = Rect()
    node.getBoundsInScreen(bounds)
    if (!node.isVisibleToUser || !bounds.contains(x, y)) {
      return null
    }

    for (index in 0 until node.childCount) {
      val child = node.getChild(index) ?: continue
      val editableChild = findEditableNodeAt(child, x, y)
      if (editableChild != null) {
        return editableChild
      }
    }

    if (isUsableInput(node)) {
      return node
    }

    return null
  }

  private fun isUsableInput(node: AccessibilityNodeInfo?): Boolean {
    return node != null && node.isVisibleToUser && node.isEnabled && node.isEditable
  }

  private fun clearLastTappedInput() {
    lastTappedInput = null
  }

  private data class TapPoint(val x: Int, val y: Int)
}
