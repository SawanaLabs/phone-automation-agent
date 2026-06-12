import { describe, expect, it } from "vitest"

import {
  convertRelativePoint,
  runRoutineActionScript,
  type RoutineActionExecutor,
} from "./routine-actions"

function createRecordingExecutor(): RoutineActionExecutor & {
  calls: string[]
} {
  return {
    calls: [],
    screen: {
      width: 1080,
      height: 2400,
    },
    async tap(point) {
      this.calls.push(`tap:${point.x},${point.y}`)
    },
    async swipe(start, end) {
      this.calls.push(`swipe:${start.x},${start.y}->${end.x},${end.y}`)
    },
    async back() {
      this.calls.push("back")
    },
    async home() {
      this.calls.push("home")
    },
    async launchApp(app) {
      this.calls.push(`launch:${app}`)
    },
    async typeText(text) {
      this.calls.push(`type:${text}`)
    },
    async wait(durationMs) {
      this.calls.push(`wait:${durationMs}`)
    },
  }
}

describe("routine actions", () => {
  it("converts Open-AutoGLM relative coordinates to screen pixels", () => {
    expect(convertRelativePoint([500, 250], { width: 1080, height: 2400 }))
      .toEqual({
        x: 540,
        y: 600,
      })
  })

  it("dispatches routine actions in script order and finishes the task", async () => {
    const executor = createRecordingExecutor()

    const result = await runRoutineActionScript({
      taskId: "customer_task_1",
      instruction: "检查当前页面",
      actions: [
        { _metadata: "do", action: "Tap", element: [500, 250] },
        {
          _metadata: "do",
          action: "Swipe",
          start: [500, 800],
          end: [500, 200],
        },
        { _metadata: "do", action: "Back" },
        { _metadata: "do", action: "Home" },
        { _metadata: "do", action: "Wait", duration: "1 seconds" },
        { _metadata: "finish", message: "done" },
      ],
      executor,
    })

    expect(executor.calls).toEqual([
      "tap:540,600",
      "swipe:540,1920->540,480",
      "back",
      "home",
      "wait:1000",
    ])
    expect(result.task.status).toBe("finished")
    expect(result.task.summary).toBe("done")
    expect(result.events.map((event) => event.type)).toContain("task.finished")
  })

  it("dispatches launch and text-entry actions in script order", async () => {
    const executor = createRecordingExecutor()

    const result = await runRoutineActionScript({
      taskId: "customer_task_1",
      instruction: "打开设置并输入咖啡店",
      actions: [
        {
          _metadata: "do",
          action: "Launch",
          app: "com.android.settings",
        },
        { _metadata: "do", action: "Type", text: "coffee shop" },
        { _metadata: "do", action: "Type_Name", text: "Sawana" },
        { _metadata: "finish", message: "done" },
      ],
      executor,
    })

    expect(executor.calls).toEqual([
      "launch:com.android.settings",
      "type:coffee shop",
      "type:Sawana",
    ])
    expect(result.task.status).toBe("finished")
  })

  it("stops before dispatching the next action when stop is requested", async () => {
    const executor = createRecordingExecutor()
    let checks = 0

    const result = await runRoutineActionScript({
      taskId: "customer_task_1",
      instruction: "检查当前页面",
      actions: [
        { _metadata: "do", action: "Tap", element: [500, 250] },
        { _metadata: "do", action: "Home" },
        { _metadata: "finish", message: "done" },
      ],
      executor,
      shouldStop: () => {
        checks += 1
        return checks > 1
      },
    })

    expect(executor.calls).toEqual(["tap:540,600"])
    expect(result.task.status).toBe("stopped")
    expect(result.events.at(-1)).toMatchObject({
      type: "task.stopped",
      message: "Task stopped by user.",
    })
  })
})
