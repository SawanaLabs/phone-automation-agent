import { describe, expect, it } from "vitest";
import type {
  CustomerSessionSnapshot,
  CustomerTaskEvent,
  StartCustomerTaskInput,
} from "./customer-session";
import { createCustomerTaskRunController } from "./customer-task-run-controller";
import { deriveDeviceAuthorityState } from "./device-authority";
import type {
  HostedRoutineActionLoopInput,
  RoutineActionRunner,
} from "./routine-action-types";
import { createRecordingExecutor } from "./routine-actions.test-support";

const readyAuthorityState = deriveDeviceAuthorityState({
  accessibilityService: "enabled",
  screenCapture: "granted",
  notifications: "granted",
});

const startInput: StartCustomerTaskInput = {
  authorityState: readyAuthorityState,
  runtimeUrl: "http://localhost:8787",
  runtimeAccessToken: "alpha-token",
  instruction: "打开美团，搜索白切鸡，停在结果页",
};

describe("customer task run controller", () => {
  it("starts a JS hosted task, streams loop events, and stores the final session", async () => {
    const sink = createRecordingSink();
    const routineActionRunner = createRecordingActionRunner();
    const startedSession = createSession("running", "customer_task_1");
    const finalSession = createSession("finished", "customer_task_1", [
      { sequence: 1, type: "task.started", message: "Task started." },
      { sequence: 2, type: "task.finished", message: "done" },
    ]);
    const controller = createCustomerTaskRunController({
      sink,
      routineActionRunner,
      screenStateCollector: {
        async capture() {
          throw new Error("capture should be owned by the hosted loop stub");
        },
      },
      async startCustomerTask(input) {
        expect(input).toMatchObject(startInput);
        return startedSession;
      },
      async runHostedRoutineActionLoop(input) {
        expect(input.actionRunner).toBe(routineActionRunner);
        input.onEvent?.({
          sequence: 2,
          type: "task.finished",
          message: "done",
        });
        return finalSession;
      },
    });

    await controller.startTask(startInput);

    expect(sink.sessions.at(0)).toBe(startedSession);
    expect(sink.sessions.at(-1)).toBe(finalSession);
    expect(sink.errors).toEqual([null, null]);
    expect(sink.submitting).toEqual([true, false]);
    expect(sink.loopRunning).toEqual([true, false]);
    expect(sink.updatedSessions.at(-1)?.events).toEqual([
      { sequence: 2, type: "task.finished", message: "done" },
    ]);
  });

  it("keeps native hosted tasks behind the same start interface", async () => {
    const sink = createRecordingSink();
    const nativeSession = createSession("finished", "native_task_1");
    const controller = createCustomerTaskRunController({
      sink,
      nativeHostedTaskRunner: {
        async startTask(input) {
          expect(input).toMatchObject(startInput);
          return nativeSession;
        },
      },
      routineActionExecutor: createRecordingExecutor(),
      screenStateCollector: {
        async capture() {
          throw new Error("native branch must not capture from JS");
        },
      },
      async startCustomerTask() {
        throw new Error("native branch must not start a JS session");
      },
      async runHostedRoutineActionLoop() {
        throw new Error("native branch must not run a JS loop");
      },
    });

    await controller.startTask(startInput);

    expect(sink.sessions).toEqual([nativeSession]);
    expect(sink.loopRunning).toEqual([true, false]);
  });

  it("continues confirmation pauses after executing the allowed action", async () => {
    const sink = createRecordingSink();
    const executor = createRecordingExecutor();
    const pausedSession: CustomerSessionSnapshot = {
      task: {
        id: "customer_task_1",
        instruction: startInput.instruction,
        status: "confirmation_required",
        summary: "确认点击",
      },
      events: [],
      pause: {
        status: "confirmation_required",
        message: "确认点击",
        action: {
          _metadata: "do",
          action: "Tap",
          element: [500, 250],
          message: "确认点击",
        },
      },
      nextStepNumber: 2,
      lastActionResult: null,
    };
    let resumedFrom: Pick<
      HostedRoutineActionLoopInput,
      "initialLastActionResult" | "initialStepNumber"
    > | null = null;
    const controller = createCustomerTaskRunController({
      sink,
      routineActionExecutor: executor,
      screenStateCollector: {
        async capture() {
          throw new Error("capture should be owned by the hosted loop stub");
        },
      },
      async runHostedRoutineActionLoop(input) {
        resumedFrom = {
          initialLastActionResult: input.initialLastActionResult,
          initialStepNumber: input.initialStepNumber,
        };
        return createSession("finished", "customer_task_1");
      },
    });

    await controller.allowConfirmedAction(pausedSession, startInput);

    expect(executor.calls).toEqual(["tap:540,600"]);
    expect(sink.sessions.at(0)?.events.at(-1)).toMatchObject({
      type: "step.result",
      message: "Tap completed.",
    });
    expect(resumedFrom).toMatchObject({
      initialLastActionResult: {
        status: "succeeded",
        action: "Tap",
        message: "Tap completed.",
      },
      initialStepNumber: 2,
    });
  });
});

function createRecordingSink() {
  const sink = {
    errors: [] as (string | null)[],
    loopRunning: [] as boolean[],
    sessions: [] as (CustomerSessionSnapshot | null)[],
    submitting: [] as boolean[],
    updatedSessions: [] as CustomerSessionSnapshot[],
    setErrorMessage(message: string | null) {
      sink.errors.push(message);
    },
    setIsSubmitting(value: boolean) {
      sink.submitting.push(value);
    },
    setIsTaskLoopRunning(value: boolean) {
      sink.loopRunning.push(value);
    },
    setSession(session: CustomerSessionSnapshot | null) {
      sink.sessions.push(session);
    },
    updateSession(
      updater: (
        currentSession: CustomerSessionSnapshot | null
      ) => CustomerSessionSnapshot
    ) {
      const updated = updater(sink.sessions.at(-1) ?? null);
      sink.updatedSessions.push(updated);
      sink.sessions.push(updated);
    },
  };
  return sink;
}

function createRecordingActionRunner(): RoutineActionRunner {
  return {
    createPauseContinueActionResult(pause) {
      if (!pause) {
        throw new Error("pause is required");
      }

      return {
        status: "succeeded",
        action:
          pause.action._metadata === "do" ? pause.action.action : "finish",
        message: "continued",
      };
    },
    async execute(action) {
      return {
        status: "succeeded",
        action: action.action,
        message: `${action.action} completed.`,
      };
    },
    async executeConfirmedPause(pause) {
      if (pause?.action._metadata !== "do") {
        throw new Error("pause action is required");
      }

      return {
        status: "succeeded",
        action: pause.action.action,
        message: `${pause.action.action} completed.`,
      };
    },
  };
}

function createSession(
  status: CustomerSessionSnapshot["task"]["status"],
  id: string,
  events: CustomerTaskEvent[] = []
): CustomerSessionSnapshot {
  return {
    task: {
      id,
      instruction: startInput.instruction,
      status,
      summary: status === "finished" ? "done" : null,
    },
    events,
    pause: null,
  };
}
