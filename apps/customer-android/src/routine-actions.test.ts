import { describe, expect, it } from "vitest";

import {
  convertRelativePoint,
  runHostedRoutineActionLoop,
  runRoutineActionScript,
} from "./routine-actions";
import { createRecordingExecutor } from "./routine-actions.test-support";

describe("routine action scripts", () => {
  it("converts Open-AutoGLM relative coordinates to screen pixels", () => {
    expect(
      convertRelativePoint([500, 250], { width: 1080, height: 2400 })
    ).toEqual({
      x: 540,
      y: 600,
    });
  });

  it("dispatches routine actions in script order and finishes the task", async () => {
    const executor = createRecordingExecutor();

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
    });

    expect(executor.calls).toEqual([
      "tap:540,600",
      "swipe:540,1920->540,480",
      "back",
      "home",
      "wait:1000",
    ]);
    expect(result.task.status).toBe("finished");
    expect(result.task.summary).toBe("done");
    expect(result.events.map((event) => event.type)).toContain("task.finished");
  });

  it("dispatches launch and text-entry actions in script order", async () => {
    const executor = createRecordingExecutor();

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
    });

    expect(executor.calls).toEqual([
      "launch:com.android.settings",
      "type:coffee shop",
      "type:Sawana",
    ]);
    expect(result.task.status).toBe("finished");
  });

  it("dispatches double tap and long press actions", async () => {
    const executor = createRecordingExecutor();

    const result = await runRoutineActionScript({
      taskId: "customer_task_1",
      instruction: "测试复杂手势",
      actions: [
        { _metadata: "do", action: "Double Tap", element: [500, 250] },
        { _metadata: "do", action: "Long Press", element: [250, 500] },
        { _metadata: "finish", message: "done" },
      ],
      executor,
    });

    expect(executor.calls).toEqual([
      "double-tap:540,600",
      "long-press:270,1200",
    ]);
    expect(result.task.status).toBe("finished");
  });

  it("stops before dispatching the next action when stop is requested", async () => {
    const executor = createRecordingExecutor();
    let checks = 0;

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
        checks += 1;
        return checks > 1;
      },
    });

    expect(executor.calls).toEqual(["tap:540,600"]);
    expect(result.task.status).toBe("stopped");
    expect(result.events.at(-1)).toMatchObject({
      type: "task.stopped",
      message: "Task stopped by user.",
    });
  });
});

describe("hosted routine action loop successful execution", () => {
  it("uploads screen state for each hosted step and finishes on terminal action", async () => {
    const executor = createRecordingExecutor();
    const stepRequests: Record<string, unknown>[] = [];
    let captures = 0;
    const fetchImpl: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      stepRequests.push(body);

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
        );
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
      );
    };

    const result = await runHostedRoutineActionLoop({
      taskId: "customer_task_1",
      instruction: "检查当前页面",
      runtimeUrl: "http://localhost:8787",
      runtimeAccessToken: "alpha-token",
      executor,
      fetchImpl,
      screenStateCollector: {
        async capture() {
          captures += 1;
          return {
            frameBase64: `frame-${captures}`,
            frameMimeType: "image/png",
            width: 1080,
            height: 2400,
            currentPackage: "com.android.settings",
          };
        },
      },
    });

    expect(executor.calls).toEqual(["tap:540,600"]);
    expect(result.task.status).toBe("finished");
    expect(result.task.summary).toBe("done");
    expect(stepRequests).toHaveLength(2);
    expect(stepRequests[0]).toMatchObject({
      stepNumber: 1,
      screen: {
        frameBase64: "frame-1",
        width: 1080,
        height: 2400,
      },
      lastActionResult: null,
    });
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
    });
  });

  it("records a completion signal when a hosted task finishes", async () => {
    const executor = createRecordingExecutor();
    const completionSignals: string[] = [];

    const result = await runHostedRoutineActionLoop({
      taskId: "customer_task_1",
      instruction: "检查当前页面",
      runtimeUrl: "http://localhost:8787",
      runtimeAccessToken: "alpha-token",
      executor,
      fetchImpl: async () =>
        new Response(
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
        ),
      screenStateCollector: {
        async capture() {
          return {
            frameBase64: "frame",
            frameMimeType: "image/png",
            width: 1080,
            height: 2400,
          };
        },
      },
      completionSignalNotifier: {
        async notifyTaskOutcome(session) {
          completionSignals.push(
            `${session.task.id}:${session.task.status}:${session.task.summary}`
          );
          return {
            status: "delivered",
            message: "Completion signal delivered.",
          };
        },
      },
    });

    expect(completionSignals).toEqual(["customer_task_1:finished:done"]);
    expect(result.task.status).toBe("finished");
    expect(result.events.at(-1)).toMatchObject({
      type: "task.notification.delivered",
      message: "Completion signal delivered.",
    });
  });
});
