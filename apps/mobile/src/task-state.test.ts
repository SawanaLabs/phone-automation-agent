import { describe, expect, it } from "vitest"

import { getScreenSummary, isActiveStatus, isTraceEvent } from "./task-state"
import type { TaskEvent, TaskRecord } from "./worker-api"

const baseTask: TaskRecord = {
  id: "task_1",
  instruction: "打开美团搜索附近的火锅店，不要下单，只停在搜索结果页",
  source: "mobile",
  status: "finished",
  summary: "fallback summary",
  error: null,
  created_at: "2026-06-10T00:00:00Z",
  updated_at: "2026-06-10T00:00:01Z",
}

function event(overrides: Partial<TaskEvent>): TaskEvent {
  return {
    sequence: 1,
    task_id: "task_1",
    type: "step.completed",
    message: null,
    payload: {},
    created_at: "2026-06-10T00:00:00Z",
    ...overrides,
  }
}

describe("task state helpers", () => {
  it("keeps mobile polling active only for non-terminal worker states", () => {
    expect(isActiveStatus("created")).toBe(true)
    expect(isActiveStatus("running")).toBe(true)
    expect(isActiveStatus("confirmation_required")).toBe(true)
    expect(isActiveStatus("takeover_required")).toBe(true)
    expect(isActiveStatus("finished")).toBe(false)
    expect(isActiveStatus("failed")).toBe(false)
  })

  it("keeps the visible trace focused on steps, gates, and terminal events", () => {
    expect(isTraceEvent(event({ type: "step.started" }))).toBe(true)
    expect(isTraceEvent(event({ type: "gate.confirmation_required" }))).toBe(
      true
    )
    expect(isTraceEvent(event({ type: "task.finished" }))).toBe(true)
    expect(isTraceEvent(event({ type: "debug.noise" }))).toBe(false)
  })

  it("prefers the final screen summary emitted by the worker", () => {
    const summary = getScreenSummary(baseTask, [
      event({ sequence: 1, type: "step.completed" }),
      event({
        sequence: 2,
        type: "task.finished",
        payload: { screen_summary: "美团火锅搜索结果页" },
      }),
    ])

    expect(summary).toBe("美团火锅搜索结果页")
  })

  it("uses the task summary when no final screen summary is available", () => {
    expect(getScreenSummary(baseTask, [])).toBe("fallback summary")
  })
})
