import { describe, expect, it } from "vitest"

import {
  OPEN_AUTOGLM_ACTION_E2E_COVERAGE,
  SENSITIVE_TAP_E2E_COVERAGE,
} from "./action-e2e-coverage"

const EXPECTED_RECOGNIZED_ACTIONS = [
  "Launch",
  "Tap",
  "Type",
  "Type_Name",
  "Interact",
  "Swipe",
  "Note",
  "Call_API",
  "Long Press",
  "Double Tap",
  "Take_over",
  "Back",
  "Home",
  "Wait",
  "finish",
]

describe("Open-AutoGLM action E2E coverage", () => {
  it("accounts for each recognized action exactly once", () => {
    const coveredActions = OPEN_AUTOGLM_ACTION_E2E_COVERAGE.map(
      (entry) => entry.action
    )

    expect(coveredActions).toHaveLength(EXPECTED_RECOGNIZED_ACTIONS.length)
    expect(new Set(coveredActions).size).toBe(coveredActions.length)
    expect(coveredActions.toSorted()).toEqual(
      EXPECTED_RECOGNIZED_ACTIONS.toSorted()
    )
  })

  it("groups action coverage by execution semantics", () => {
    expect(OPEN_AUTOGLM_ACTION_E2E_COVERAGE).toEqual([
      { action: "Launch", group: "routine" },
      { action: "Tap", group: "routine" },
      { action: "Type", group: "routine" },
      { action: "Type_Name", group: "routine" },
      { action: "Swipe", group: "routine" },
      { action: "Back", group: "routine" },
      { action: "Home", group: "routine" },
      { action: "Wait", group: "routine" },
      { action: "Double Tap", group: "routine" },
      { action: "Long Press", group: "routine" },
      { action: "Take_over", group: "pause" },
      { action: "Interact", group: "pause" },
      { action: "Note", group: "runtime-local" },
      { action: "Call_API", group: "runtime-local" },
      { action: "finish", group: "finish" },
    ])
  })

  it("tracks the sensitive Tap confirmation variant as required pause coverage", () => {
    expect(SENSITIVE_TAP_E2E_COVERAGE).toEqual({
      action: "Tap",
      variant: "message",
      group: "pause",
    })
  })
})
