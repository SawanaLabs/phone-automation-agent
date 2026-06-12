import { describe, expect, it } from "vitest"

import { normalizeOpenAutoGlmAction } from "./open-autoglm-action-contract"

describe("Open-AutoGLM routine action contract", () => {
  it("normalizes the full routine action set", () => {
    expect(
      [
        normalizeOpenAutoGlmAction({
          _metadata: "do",
          action: "Launch",
          app: " com.android.settings ",
        }),
        normalizeOpenAutoGlmAction({
          _metadata: "do",
          action: "Tap",
          element: [500, 250],
        }),
        normalizeOpenAutoGlmAction({
          _metadata: "do",
          action: "Type",
          text: "coffee shop",
        }),
        normalizeOpenAutoGlmAction({
          _metadata: "do",
          action: "Type_Name",
          text: "Sawana",
        }),
        normalizeOpenAutoGlmAction({
          _metadata: "do",
          action: "Swipe",
          start: [500, 800],
          end: [500, 200],
        }),
        normalizeOpenAutoGlmAction({
          _metadata: "do",
          action: "Back",
        }),
        normalizeOpenAutoGlmAction({
          _metadata: "do",
          action: "Home",
        }),
        normalizeOpenAutoGlmAction({
          _metadata: "do",
          action: "Wait",
          duration: "3 seconds",
        }),
        normalizeOpenAutoGlmAction({
          _metadata: "do",
          action: "Double Tap",
          element: [500, 500],
        }),
        normalizeOpenAutoGlmAction({
          _metadata: "do",
          action: "Long Press",
          element: [200, 700],
        }),
        normalizeOpenAutoGlmAction({
          _metadata: "finish",
          message: " done ",
        }),
      ]
    ).toEqual([
      { _metadata: "do", action: "Launch", app: "com.android.settings" },
      { _metadata: "do", action: "Tap", element: [500, 250] },
      { _metadata: "do", action: "Type", text: "coffee shop" },
      { _metadata: "do", action: "Type", text: "Sawana" },
      {
        _metadata: "do",
        action: "Swipe",
        start: [500, 800],
        end: [500, 200],
      },
      { _metadata: "do", action: "Back" },
      { _metadata: "do", action: "Home" },
      { _metadata: "do", action: "Wait", duration: "3 seconds" },
      { _metadata: "do", action: "Double Tap", element: [500, 500] },
      { _metadata: "do", action: "Long Press", element: [200, 700] },
      { _metadata: "finish", message: "done" },
    ])
  })

  it("defaults missing wait duration to one second", () => {
    expect(
      normalizeOpenAutoGlmAction({
        _metadata: "do",
        action: "Wait",
      })
    ).toEqual({ _metadata: "do", action: "Wait", duration: "1 seconds" })
  })

  it("rejects invalid action names", () => {
    expect(() =>
      normalizeOpenAutoGlmAction({
        _metadata: "do",
        action: "Scroll",
      })
    ).toThrow("Unsupported Open-AutoGLM action: Scroll.")
  })

  it("rejects invalid coordinates", () => {
    expect(() =>
      normalizeOpenAutoGlmAction({
        _metadata: "do",
        action: "Tap",
        element: [500, 1001],
      })
    ).toThrow("Tap element coordinate must be between 0 and 1000: 1001.")
  })

  it("rejects missing required fields", () => {
    expect(() =>
      normalizeOpenAutoGlmAction({
        _metadata: "do",
        action: "Launch",
      })
    ).toThrow("Launch app is required.")

    expect(() =>
      normalizeOpenAutoGlmAction({
        _metadata: "do",
        action: "Type",
      })
    ).toThrow("Type text is required.")

    expect(() =>
      normalizeOpenAutoGlmAction({
        _metadata: "finish",
      })
    ).toThrow("Finish message is required.")
  })

  it("rejects invalid wait durations", () => {
    expect(() =>
      normalizeOpenAutoGlmAction({
        _metadata: "do",
        action: "Wait",
        duration: "later",
      })
    ).toThrow("Invalid Wait duration: later.")

    expect(() =>
      normalizeOpenAutoGlmAction({
        _metadata: "do",
        action: "Wait",
        duration: "-1 seconds",
      })
    ).toThrow("Wait duration must be positive: -1 seconds.")
  })
})
