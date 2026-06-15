import { describe, expect, it } from "vitest";

import { runHostedRoutineActionLoop } from "./routine-actions";
import { createRecordingExecutor } from "./routine-actions.test-support";

describe("hosted routine action loop runtime-local actions", () => {
  it("can execute hosted steps through a semantic action runner", async () => {
    const executedActions: string[] = [];
    const result = await runHostedRoutineActionLoop({
      actionRunner: {
        async execute(action) {
          executedActions.push(action.action);
          return {
            status: "succeeded",
            action: action.action,
            message: `${action.action} completed.`,
          };
        },
        async executeConfirmedPause() {
          throw new Error("confirmation pauses are handled by the app");
        },
        createPauseContinueActionResult() {
          throw new Error("pause continuation is handled by the app");
        },
      },
      taskId: "customer_task_1",
      instruction: "检查当前页面",
      runtimeUrl: "http://localhost:8787",
      runtimeAccessToken: "alpha-token",
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
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
      },
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
    });

    expect(executedActions).toEqual(["Tap"]);
    expect(result.task.status).toBe("finished");
  });

  it("records runtime-local actions without dispatching physical phone actions", async () => {
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
              action: "Note",
              message: "页面显示三条结果",
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
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
          return {
            frameBase64: "frame",
            frameMimeType: "image/png",
            width: 1080,
            height: 2400,
          };
        },
      },
    });

    expect(executor.calls).toEqual([]);
    expect(result.task.status).toBe("finished");
    expect(stepRequests).toHaveLength(3);
    expect(stepRequests[1]).toMatchObject({
      lastActionResult: {
        status: "succeeded",
        action: "Note",
        message: "Note recorded: 页面显示三条结果",
      },
    });
    expect(stepRequests[2]).toMatchObject({
      lastActionResult: {
        status: "unsupported",
        action: "Call_API",
        message:
          "Call_API is a runtime-local action and is not implemented by this hosted runtime.",
      },
    });
  });
});

describe("hosted routine action loop failure handling", () => {
  it("returns a failed snapshot with trace when the hosted runtime rejects a step", async () => {
    const executor = createRecordingExecutor();

    const result = await runHostedRoutineActionLoop({
      taskId: "customer_task_1",
      instruction: "检查当前页面",
      runtimeUrl: "http://localhost:8787",
      runtimeAccessToken: "alpha-token",
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
          };
        },
      },
    });

    expect(executor.calls).toEqual([]);
    expect(result.task.status).toBe("failed");
    expect(result.task.summary).toBe("Invalid model output.");
    expect(result.events.at(-1)).toMatchObject({
      type: "task.failed",
      message: "Invalid model output.",
    });
  });

  it("returns a failed snapshot when the hosted runtime returns a failed outcome", async () => {
    const executor = createRecordingExecutor();

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
              _metadata: "failed",
              message:
                "Invalid model output: Model output must contain do(...) or finish(...).",
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
    });

    expect(executor.calls).toEqual([]);
    expect(result.task.status).toBe("failed");
    expect(result.task.summary).toBe(
      "Invalid model output: Model output must contain do(...) or finish(...)."
    );
    expect(result.events.at(-1)).toMatchObject({
      type: "task.failed",
      message:
        "Invalid model output: Model output must contain do(...) or finish(...).",
    });
  });

  it("returns a failed snapshot before contacting the runtime when screen capture fails", async () => {
    const executor = createRecordingExecutor();
    let runtimeCalls = 0;

    const result = await runHostedRoutineActionLoop({
      taskId: "customer_task_1",
      instruction: "检查当前页面",
      runtimeUrl: "http://localhost:8787",
      runtimeAccessToken: "alpha-token",
      executor,
      fetchImpl: async () => {
        runtimeCalls += 1;
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
      },
      screenStateCollector: {
        async capture() {
          throw new Error(
            "Grant screen capture before requesting hosted decisions."
          );
        },
      },
    });

    expect(runtimeCalls).toBe(0);
    expect(executor.calls).toEqual([]);
    expect(result.task.status).toBe("failed");
    expect(result.task.summary).toBe(
      "Grant screen capture before requesting hosted decisions."
    );
    expect(result.events.at(-1)).toMatchObject({
      type: "task.failed",
      message: "Grant screen capture before requesting hosted decisions.",
    });
  });
});
