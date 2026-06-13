import { describe, expect, it } from "vitest"

import {
  createPauseContinueActionResult,
  convertRelativePoint,
  executeConfirmedPauseAction,
  runHostedRoutineActionLoop,
  runRoutineActionScript,
  stopPausedRoutineActionSession,
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
    async doubleTap(point) {
      this.calls.push(`double-tap:${point.x},${point.y}`)
    },
    async longPress(point) {
      this.calls.push(`long-press:${point.x},${point.y}`)
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

  it("dispatches double tap and long press actions", async () => {
    const executor = createRecordingExecutor()

    const result = await runRoutineActionScript({
      taskId: "customer_task_1",
      instruction: "测试复杂手势",
      actions: [
        { _metadata: "do", action: "Double Tap", element: [500, 250] },
        { _metadata: "do", action: "Long Press", element: [250, 500] },
        { _metadata: "finish", message: "done" },
      ],
      executor,
    })

    expect(executor.calls).toEqual([
      "double-tap:540,600",
      "long-press:270,1200",
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

  it("uploads screen state for each hosted step and finishes on terminal action", async () => {
    const executor = createRecordingExecutor()
    const stepRequests: Array<Record<string, unknown>> = []
    let captures = 0
    const fetchImpl: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body))
      stepRequests.push(body)

      if (body.stepNumber === 1) {
        return new Response(
          JSON.stringify({
            action: {
              _metadata: "do",
              action: "Tap",
              element: [500, 250],
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      }

      return new Response(
        JSON.stringify({
          action: {
            _metadata: "finish",
            message: "done",
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    }

    const result = await runHostedRoutineActionLoop({
      taskId: "customer_task_1",
      instruction: "检查当前页面",
      runtimeUrl: "http://localhost:8787",
      executor,
      fetchImpl,
      screenStateCollector: {
        async capture() {
          captures += 1
          return {
            frameBase64: `frame-${captures}`,
            frameMimeType: "image/png",
            width: 1080,
            height: 2400,
            currentPackage: "com.android.settings",
          }
        },
      },
    })

    expect(executor.calls).toEqual(["tap:540,600"])
    expect(result.task.status).toBe("finished")
    expect(result.task.summary).toBe("done")
    expect(stepRequests).toHaveLength(2)
    expect(stepRequests[0]).toMatchObject({
      stepNumber: 1,
      screen: {
        frameBase64: "frame-1",
        width: 1080,
        height: 2400,
      },
      lastActionResult: null,
    })
    expect(stepRequests[1]).toMatchObject({
      stepNumber: 2,
      screen: {
        frameBase64: "frame-2",
      },
      lastActionResult: {
        status: "succeeded",
        action: "Tap",
        message: "Tap completed.",
      },
    })
  })

  it("records runtime-local actions without dispatching physical phone actions", async () => {
    const executor = createRecordingExecutor()
    const stepRequests: Array<Record<string, unknown>> = []
    const fetchImpl: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body))
      stepRequests.push(body)

      if (body.stepNumber === 1) {
        return new Response(
          JSON.stringify({
            action: {
              _metadata: "do",
              action: "Note",
              message: "页面显示三条结果",
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      }

      if (body.stepNumber === 2) {
        return new Response(
          JSON.stringify({
            action: {
              _metadata: "do",
              action: "Call_API",
              instruction: "总结当前页面",
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      }

      return new Response(
        JSON.stringify({
          action: {
            _metadata: "finish",
            message: "done",
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    }

    const result = await runHostedRoutineActionLoop({
      taskId: "customer_task_1",
      instruction: "检查当前页面",
      runtimeUrl: "http://localhost:8787",
      executor,
      fetchImpl,
      screenStateCollector: {
        async capture() {
          return {
            frameBase64: "frame",
            frameMimeType: "image/png",
            width: 1080,
            height: 2400,
          }
        },
      },
    })

    expect(executor.calls).toEqual([])
    expect(result.task.status).toBe("finished")
    expect(stepRequests).toHaveLength(3)
    expect(stepRequests[1]).toMatchObject({
      lastActionResult: {
        status: "succeeded",
        action: "Note",
        message: "Note recorded: 页面显示三条结果",
      },
    })
    expect(stepRequests[2]).toMatchObject({
      lastActionResult: {
        status: "unsupported",
        action: "Call_API",
        message:
          "Call_API is a runtime-local action and is not implemented by this hosted runtime.",
      },
    })
  })

  it("returns a failed snapshot with trace when the hosted runtime rejects a step", async () => {
    const executor = createRecordingExecutor()

    const result = await runHostedRoutineActionLoop({
      taskId: "customer_task_1",
      instruction: "检查当前页面",
      runtimeUrl: "http://localhost:8787",
      executor,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            detail: "Invalid model output.",
          }),
          {
            status: 422,
            headers: { "Content-Type": "application/json" },
          }
        ),
      screenStateCollector: {
        async capture() {
          return {
            frameBase64: "frame",
            frameMimeType: "image/png",
            width: 1080,
            height: 2400,
          }
        },
      },
    })

    expect(executor.calls).toEqual([])
    expect(result.task.status).toBe("failed")
    expect(result.task.summary).toBe("Invalid model output.")
    expect(result.events.at(-1)).toMatchObject({
      type: "task.failed",
      message: "Invalid model output.",
    })
  })

  it("returns a failed snapshot before contacting the runtime when screen capture fails", async () => {
    const executor = createRecordingExecutor()
    let runtimeCalls = 0

    const result = await runHostedRoutineActionLoop({
      taskId: "customer_task_1",
      instruction: "检查当前页面",
      runtimeUrl: "http://localhost:8787",
      executor,
      fetchImpl: async () => {
        runtimeCalls += 1
        return new Response(
          JSON.stringify({
            action: {
              _metadata: "finish",
              message: "done",
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      },
      screenStateCollector: {
        async capture() {
          throw new Error("Grant screen capture before requesting hosted decisions.")
        },
      },
    })

    expect(runtimeCalls).toBe(0)
    expect(executor.calls).toEqual([])
    expect(result.task.status).toBe("failed")
    expect(result.task.summary).toBe(
      "Grant screen capture before requesting hosted decisions."
    )
    expect(result.events.at(-1)).toMatchObject({
      type: "task.failed",
      message: "Grant screen capture before requesting hosted decisions.",
    })
  })

  it("pauses takeover actions and continues with a new screen state", async () => {
    const executor = createRecordingExecutor()
    const stepRequests: Array<Record<string, unknown>> = []
    const fetchImpl: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body))
      stepRequests.push(body)

      if (body.stepNumber === 1) {
        return new Response(
          JSON.stringify({
            action: {
              _metadata: "do",
              action: "Take_over",
              message: "请先完成登录",
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        )
      }

      return new Response(
        JSON.stringify({
          action: {
            _metadata: "finish",
            message: "done",
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    }
    let captures = 0
    const screenStateCollector = {
      async capture() {
        captures += 1
        return {
          frameBase64: `frame-${captures}`,
          frameMimeType: "image/png",
          width: 1080,
          height: 2400,
        }
      },
    }

    const paused = await runHostedRoutineActionLoop({
      taskId: "customer_task_1",
      instruction: "检查当前页面",
      runtimeUrl: "http://localhost:8787",
      executor,
      fetchImpl,
      screenStateCollector,
    })

    expect(paused.task.status).toBe("takeover_required")
    expect(paused.pause).toMatchObject({
      status: "takeover_required",
      message: "请先完成登录",
    })
    expect(paused.nextStepNumber).toBe(2)
    expect(executor.calls).toEqual([])

    const finished = await runHostedRoutineActionLoop({
      taskId: paused.task.id,
      instruction: paused.task.instruction,
      runtimeUrl: "http://localhost:8787",
      executor,
      fetchImpl,
      screenStateCollector,
      initialEvents: paused.events,
      initialStepNumber: paused.nextStepNumber,
      initialLastActionResult: createPauseContinueActionResult(paused.pause),
    })

    expect(finished.task.status).toBe("finished")
    expect(stepRequests[1]).toMatchObject({
      stepNumber: 2,
      screen: {
        frameBase64: "frame-2",
      },
      lastActionResult: {
        status: "succeeded",
        action: "Take_over",
        message: "User continued after Take_over.",
      },
    })
  })

  it("pauses interact actions", async () => {
    const executor = createRecordingExecutor()
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          action: {
            _metadata: "do",
            action: "Interact",
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )

    const paused = await runHostedRoutineActionLoop({
      taskId: "customer_task_1",
      instruction: "检查当前页面",
      runtimeUrl: "http://localhost:8787",
      executor,
      fetchImpl,
      screenStateCollector: {
        async capture() {
          return {
            frameBase64: "frame-1",
            frameMimeType: "image/png",
            width: 1080,
            height: 2400,
          }
        },
      },
    })

    expect(paused.task.status).toBe("interaction_required")
    expect(paused.pause).toMatchObject({
      status: "interaction_required",
      message: "User interaction required.",
    })
  })

  it("pauses sensitive tap actions until confirmation", async () => {
    const executor = createRecordingExecutor()
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          action: {
            _metadata: "do",
            action: "Tap",
            element: [500, 250],
            message: "确认点击提交按钮",
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )

    const paused = await runHostedRoutineActionLoop({
      taskId: "customer_task_1",
      instruction: "检查当前页面",
      runtimeUrl: "http://localhost:8787",
      executor,
      fetchImpl,
      screenStateCollector: {
        async capture() {
          return {
            frameBase64: "frame-1",
            frameMimeType: "image/png",
            width: 1080,
            height: 2400,
          }
        },
      },
    })

    expect(paused.task.status).toBe("confirmation_required")
    expect(executor.calls).toEqual([])

    await expect(
      executeConfirmedPauseAction(paused.pause, executor)
    ).resolves.toEqual({
      status: "succeeded",
      action: "Tap",
      message: "Tap completed.",
    })
    expect(executor.calls).toEqual(["tap:540,600"])
  })

  it("stops paused sessions", async () => {
    const stopped = stopPausedRoutineActionSession({
      task: {
        id: "customer_task_1",
        instruction: "检查当前页面",
        status: "interaction_required",
        summary: "User interaction required.",
      },
      events: [
        {
          sequence: 1,
          type: "task.started",
          message: "Task started.",
        },
      ],
      nextStepNumber: 2,
      pause: {
        status: "interaction_required",
        action: {
          _metadata: "do",
          action: "Interact",
        },
        message: "User interaction required.",
      },
    })

    expect(stopped.task.status).toBe("stopped")
    expect(stopped.pause).toBeNull()
    expect(stopped.events.at(-1)).toMatchObject({
      sequence: 2,
      type: "task.stopped",
      message: "Task stopped by user.",
    })
  })
})
