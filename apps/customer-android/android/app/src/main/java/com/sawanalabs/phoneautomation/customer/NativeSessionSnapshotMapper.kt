package com.sawanalabs.phoneautomation.customer

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import org.json.JSONArray
import org.json.JSONObject

internal class NativeSessionSnapshotMapper {
  fun create(
    taskId: String,
    instruction: String,
    status: String,
    summary: String?,
    events: List<NativeTaskEvent>,
    pauseAction: JSONObject? = null,
    nextStepNumber: Int? = null,
    lastActionResult: NativeActionResult? = null
  ): WritableMap {
    val task = Arguments.createMap().apply {
      putString("id", taskId)
      putString("instruction", instruction)
      putString("status", status)
      putString("summary", summary)
      if (status == "failed") {
        putString("error", summary)
      } else {
        putNull("error")
      }
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
      if (pauseAction != null) {
        putMap(
          "pause",
          Arguments.createMap().apply {
            putString("status", status)
            putMap("action", jsonObjectToWritableMap(pauseAction))
            putString("message", summary ?: "User interaction required.")
          }
        )
      } else {
        putNull("pause")
      }
      if (nextStepNumber != null) {
        putInt("nextStepNumber", nextStepNumber)
      }
      if (lastActionResult != null) {
        putMap("lastActionResult", jsonObjectToWritableMap(lastActionResult.toJson()))
      } else {
        putNull("lastActionResult")
      }
    }
  }

  private fun jsonObjectToWritableMap(source: JSONObject): WritableMap {
    val map = Arguments.createMap()
    val keys = source.keys()
    while (keys.hasNext()) {
      val key = keys.next()
      putJsonValue(map, key, source.opt(key))
    }
    return map
  }

  private fun jsonArrayToWritableArray(source: JSONArray): WritableArray {
    val array = Arguments.createArray()
    for (index in 0 until source.length()) {
      pushJsonValue(array, source.opt(index))
    }
    return array
  }

  private fun putJsonValue(map: WritableMap, key: String, value: Any?) {
    when (value) {
      null, JSONObject.NULL -> map.putNull(key)
      is Boolean -> map.putBoolean(key, value)
      is Int -> map.putInt(key, value)
      is Long -> {
        if (value >= Int.MIN_VALUE && value <= Int.MAX_VALUE) {
          map.putInt(key, value.toInt())
        } else {
          map.putDouble(key, value.toDouble())
        }
      }
      is Number -> map.putDouble(key, value.toDouble())
      is String -> map.putString(key, value)
      is JSONObject -> map.putMap(key, jsonObjectToWritableMap(value))
      is JSONArray -> map.putArray(key, jsonArrayToWritableArray(value))
      else -> map.putString(key, value.toString())
    }
  }

  private fun pushJsonValue(array: WritableArray, value: Any?) {
    when (value) {
      null, JSONObject.NULL -> array.pushNull()
      is Boolean -> array.pushBoolean(value)
      is Int -> array.pushInt(value)
      is Long -> {
        if (value >= Int.MIN_VALUE && value <= Int.MAX_VALUE) {
          array.pushInt(value.toInt())
        } else {
          array.pushDouble(value.toDouble())
        }
      }
      is Number -> array.pushDouble(value.toDouble())
      is String -> array.pushString(value)
      is JSONObject -> array.pushMap(jsonObjectToWritableMap(value))
      is JSONArray -> array.pushArray(jsonArrayToWritableArray(value))
      else -> array.pushString(value.toString())
    }
  }
}
