import { describe, expect, it } from "vitest";

import {
  createPauseContinueActionResult,
  executeConfirmedPauseAction,
  runHostedRoutineActionLoop,
  stopPausedRoutineActionSession,
} from "./routine-actions";
import { createRecordingExecutor } from "./routine-actions.test-support";

describe("hosted routine action takeover pause", () => {
  it("pauses takeover actions and continues with a new screen state", async () => {
    const executor = createRecordingExecutor();
    const stepRequests: Record<string, unknown>[] = [];
    const fetchImpl: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      stepRequests.push(body);

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
    let captures = 0;
    const screenStateCollector = {
      async capture() {
        captures += 1;
        return {
          frameBase64: `frame-${captures}`,
          frameMimeType: "image/png",
          width: 1080,
          height: 2400,
        };
      },
    };

    const paused = await runHostedRoutineActionLoop({
      taskId: "customer_task_1",
      instruction: "检查当前页面",
      runtimeUrl: "http://localhost:8787",
      runtimeAccessToken: "alpha-token",
      executor,
      fetchImpl,
      screenStateCollector,
    });

    expect(paused.task.status).toBe("takeover_required");
    expect(paused.pause).toMatchObject({
      status: "takeover_required",
      message: "请先完成登录",
    });
    expect(paused.nextStepNumber).toBe(2);
    expect(executor.calls).toEqual([]);

    const finished = await runHostedRoutineActionLoop({
      taskId: paused.task.id,
      instruction: paused.task.instruction,
      runtimeUrl: "http://localhost:8787",
      runtimeAccessToken: "alpha-token",
      executor,
      fetchImpl,
      screenStateCollector,
      initialEvents: paused.events,
      initialStepNumber: paused.nextStepNumber,
      initialLastActionResult: createPauseContinueActionResult(paused.pause),
    });

    expect(finished.task.status).toBe("finished");
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
    });
  });
});

describe("hosted routine action interaction and confirmation pause", () => {
  it("pauses interact actions", async () => {
    const executor = createRecordingExecutor();
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
      );

    const paused = await runHostedRoutineActionLoop({
      taskId: "customer_task_1",
      instruction: "检查当前页面",
      runtimeUrl: "http://localhost:8787",
      runtimeAccessToken: "alpha-token",
      executor,
      fetchImpl,
      screenStateCollector: {
        async capture() {
          return {
            frameBase64: "frame-1",
            frameMimeType: "image/png",
            width: 1080,
            height: 2400,
          };
        },
      },
    });

    expect(paused.task.status).toBe("interaction_required");
    expect(paused.pause).toMatchObject({
      status: "interaction_required",
      message: "User interaction required.",
    });
  });

  it("pauses sensitive tap actions until confirmation", async () => {
    const executor = createRecordingExecutor();
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
      );

    const paused = await runHostedRoutineActionLoop({
      taskId: "customer_task_1",
      instruction: "检查当前页面",
      runtimeUrl: "http://localhost:8787",
      runtimeAccessToken: "alpha-token",
      executor,
      fetchImpl,
      screenStateCollector: {
        async capture() {
          return {
            frameBase64: "frame-1",
            frameMimeType: "image/png",
            width: 1080,
            height: 2400,
          };
        },
      },
    });

    expect(paused.task.status).toBe("confirmation_required");
    expect(executor.calls).toEqual([]);

    await expect(
      executeConfirmedPauseAction(paused.pause, executor)
    ).resolves.toEqual({
      status: "succeeded",
      action: "Tap",
      message: "Tap completed.",
    });
    expect(executor.calls).toEqual(["tap:540,600"]);
  });
});

describe("hosted routine action paused session stopping", () => {
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
    });

    expect(stopped.task.status).toBe("stopped");
    expect(stopped.pause).toBeNull();
    expect(stopped.events.at(-1)).toMatchObject({
      sequence: 2,
      type: "task.stopped",
      message: "Task stopped by user.",
    });
  });
});
