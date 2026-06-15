import { describe, expect, it } from "vitest";
import type {
  CustomerSessionSnapshot,
  StartCustomerTaskInput,
} from "./customer-session";
import { deriveDeviceAuthorityState } from "./device-authority";
import {
  type CustomerAutomationNativeModule,
  createNativeDeviceAuthorityGateway,
  createNativeHostedTaskRunner,
  createNativeRoutineActionExecutor,
  createNativeScreenStateCollector,
  requireCustomerAutomationNativeModule,
} from "./native-customer-automation";
import type { RoutineAction } from "./routine-action-types";

const readyNativeModule: CustomerAutomationNativeModule = {
  async getAuthoritySnapshot() {
    return {
      accessibilityService: "enabled",
      screenCapture: "granted",
      notifications: "granted",
    };
  },
  async openAccessibilitySettings() {
    return {
      accessibilityService: "enabled",
      screenCapture: "granted",
      notifications: "granted",
    };
  },
  async requestScreenCapture() {
    return {
      accessibilityService: "enabled",
      screenCapture: "granted",
      notifications: "granted",
    };
  },
  async requestNotifications() {
    return {
      accessibilityService: "enabled",
      screenCapture: "granted",
      notifications: "granted",
    };
  },
  async showCompletionSignal() {
    return {
      status: "delivered",
      message: "Completion signal delivered.",
    };
  },
  async captureScreenState() {
    return {
      frameBase64: "ZmFrZS1mcmFtZQ==",
      frameMimeType: "image/png",
      width: 1080,
      height: 2400,
      currentPackage: "com.android.settings",
      accessibilitySummary: "Settings",
    };
  },
  async tap() {},
  async doubleTap() {},
  async longPress() {},
  async swipe() {},
  async back() {},
  async home() {},
  async launchApp() {},
  async typeText() {},
  async wait() {},
  async runHostedTask() {
    return {
      task: {
        id: "customer_task_1",
        instruction: "检查当前页面",
        status: "finished",
        summary: "Done",
      },
      events: [],
    };
  },
  async stopHostedTask() {},
};

describe("customer automation native bridge", () => {
  it("fails fast when the native module is missing", () => {
    expect(() => requireCustomerAutomationNativeModule({})).toThrow(
      "CustomerAutomation native module is not installed."
    );
  });
});

describe("native device authority gateway", () => {
  it("uses native authority snapshots for the Android setup gate", async () => {
    const gateway = createNativeDeviceAuthorityGateway(readyNativeModule);

    await expect(gateway.getSnapshot()).resolves.toEqual({
      accessibilityService: "enabled",
      screenCapture: "granted",
      notifications: "granted",
    });
  });

  it("requests notification permission through the native authority gateway", async () => {
    const gateway = createNativeDeviceAuthorityGateway(readyNativeModule);

    await expect(gateway.requestNotifications()).resolves.toEqual({
      accessibilityService: "enabled",
      screenCapture: "granted",
      notifications: "granted",
    });
  });
});

describe("native screen state collector", () => {
  it("captures native screen state for hosted decisions", async () => {
    const collector = createNativeScreenStateCollector(readyNativeModule);

    await expect(collector.capture()).resolves.toEqual({
      frameBase64: "ZmFrZS1mcmFtZQ==",
      frameMimeType: "image/png",
      width: 1080,
      height: 2400,
      currentPackage: "com.android.settings",
      accessibilitySummary: "Settings",
    });
  });
});

describe("native hosted task runner", () => {
  it("runs hosted tasks through the native Android loop", async () => {
    const calls: string[] = [];
    const nativeModule: CustomerAutomationNativeModule = {
      ...readyNativeModule,
      async runHostedTask(
        runtimeUrl,
        runtimeAccessToken,
        instruction,
        maxSteps,
        resumeStateJson
      ) {
        calls.push(
          `${runtimeUrl}|${runtimeAccessToken}|${instruction}|${maxSteps}|${resumeStateJson ?? "null"}`
        );
        return {
          task: {
            id: "customer_task_1",
            instruction,
            status: "finished",
            summary: "Done",
          },
          events: [],
        };
      },
    };
    const runner = createNativeHostedTaskRunner(nativeModule);

    const session = await runner.startTask({
      authorityState: deriveDeviceAuthorityState({
        accessibilityService: "enabled",
        screenCapture: "granted",
        notifications: "granted",
      }),
      runtimeUrl: "http://localhost:8787",
      runtimeAccessToken: "alpha-token",
      instruction: " 检查当前页面 ",
    });

    expect(calls).toEqual([
      "http://localhost:8787|alpha-token|检查当前页面|50|null",
    ]);
    expect(session.task.status).toBe("finished");
  });

  it("delivers a completion signal after the native Android loop returns a task outcome", async () => {
    const notifications: string[] = [];
    const nativeModule: CustomerAutomationNativeModule = {
      ...readyNativeModule,
      async runHostedTask() {
        return {
          task: {
            id: "customer_task_1",
            instruction: "检查当前页面",
            status: "finished",
            summary: "Done",
          },
          events: [],
        };
      },
      async showCompletionSignal(session) {
        notifications.push(`${session.task.id}:${session.task.status}`);
        return {
          status: "delivered",
          message: "Completion signal delivered.",
        };
      },
    };
    const runner = createNativeHostedTaskRunner(nativeModule);

    const session = await runner.startTask({
      authorityState: deriveDeviceAuthorityState({
        accessibilityService: "enabled",
        screenCapture: "granted",
        notifications: "granted",
      }),
      runtimeUrl: "http://localhost:8787",
      runtimeAccessToken: "alpha-token",
      instruction: "检查当前页面",
    });

    expect(notifications).toEqual(["customer_task_1:finished"]);
    expect(session.events.at(-1)).toMatchObject({
      type: "task.notification.delivered",
      message: "Completion signal delivered.",
    });
  });

  it("rejects native hosted tasks before Android permissions are granted", async () => {
    const runner = createNativeHostedTaskRunner(readyNativeModule);

    await expect(
      runner.startTask({
        authorityState: deriveDeviceAuthorityState({
          accessibilityService: "disabled",
          screenCapture: "missing",
          notifications: "missing",
        }),
        runtimeUrl: "http://localhost:8787",
        runtimeAccessToken: "alpha-token",
        instruction: "检查当前页面",
      })
    ).rejects.toThrow(
      "Android permissions are required before starting a task: accessibility_service, screen_capture, notifications."
    );
  });
});

describe("native hosted task runner pause resume", () => {
  it("continues native pauses with resume state behind the bridge", async () => {
    let resumeState: unknown = null;
    const nativeModule: CustomerAutomationNativeModule = {
      ...readyNativeModule,
      async runHostedTask(
        _runtimeUrl,
        _runtimeAccessToken,
        instruction,
        _maxSteps,
        resumeStateJson
      ) {
        resumeState = JSON.parse(resumeStateJson ?? "null");
        return createFinishedSession(instruction);
      },
    };
    const runner = createNativeHostedTaskRunner(nativeModule);

    await runner.continuePausedTask(
      createPausedNativeSession("interaction_required"),
      createReadyHostedTaskInput()
    );

    expect(resumeState).toMatchObject({
      mode: "continue",
      taskId: "customer_task_1",
      nextStepNumber: 3,
      lastActionResult: {
        status: "succeeded",
        action: "Interact",
        message: "User continued after Interact.",
      },
      pause: {
        status: "interaction_required",
        action: {
          _metadata: "do",
          action: "Interact",
        },
      },
      events: [
        {
          sequence: 1,
          type: "task.paused",
          message: "Paused",
        },
      ],
    });
  });

  it("approves native confirmation pauses with resume state behind the bridge", async () => {
    let resumeState: unknown = null;
    const nativeModule: CustomerAutomationNativeModule = {
      ...readyNativeModule,
      async runHostedTask(
        _runtimeUrl,
        _runtimeAccessToken,
        instruction,
        _maxSteps,
        resumeStateJson
      ) {
        resumeState = JSON.parse(resumeStateJson ?? "null");
        return createFinishedSession(instruction);
      },
    };
    const runner = createNativeHostedTaskRunner(nativeModule);

    await runner.allowConfirmedAction(
      createPausedNativeSession("confirmation_required"),
      createReadyHostedTaskInput()
    );

    expect(resumeState).toMatchObject({
      mode: "allow_confirmed_action",
      taskId: "customer_task_1",
      nextStepNumber: 3,
      lastActionResult: null,
      pause: {
        status: "confirmation_required",
        action: {
          _metadata: "do",
          action: "Tap",
          element: [500, 250],
          message: "确认点击",
        },
      },
    });
  });

  it("stops native paused sessions through the hosted task runner", () => {
    const runner = createNativeHostedTaskRunner(readyNativeModule);

    const stopped = runner.stopPausedTask(
      createPausedNativeSession("interaction_required")
    );

    expect(stopped).toMatchObject({
      task: {
        status: "stopped",
        summary: null,
      },
      pause: null,
      events: [
        {
          sequence: 1,
          type: "task.paused",
          message: "Paused",
        },
        {
          sequence: 2,
          type: "task.stopped",
          message: "Task stopped by user.",
        },
      ],
    });
  });
});

describe("native routine action executor", () => {
  it("dispatches native routine actions with pixel coordinates", async () => {
    const calls: string[] = [];
    const nativeModule: CustomerAutomationNativeModule = {
      ...readyNativeModule,
      async tap(x, y) {
        calls.push(`tap:${x},${y}`);
      },
      async doubleTap(x, y) {
        calls.push(`double-tap:${x},${y}`);
      },
      async longPress(x, y) {
        calls.push(`long-press:${x},${y}`);
      },
      async swipe(startX, startY, endX, endY) {
        calls.push(`swipe:${startX},${startY}->${endX},${endY}`);
      },
      async back() {
        calls.push("back");
      },
      async home() {
        calls.push("home");
      },
      async launchApp(app) {
        calls.push(`launch:${app}`);
      },
      async typeText(text) {
        calls.push(`type:${text}`);
      },
      async wait() {
        throw new Error("native wait must not be used");
      },
    };
    const executor = createNativeRoutineActionExecutor(nativeModule, {
      width: 1080,
      height: 2400,
    });

    await executor.tap({ x: 540, y: 600 });
    await executor.doubleTap({ x: 540, y: 600 });
    await executor.longPress({ x: 270, y: 1200 });
    await executor.swipe({ x: 540, y: 1920 }, { x: 540, y: 480 });
    await executor.back();
    await executor.home();
    await executor.launchApp("com.android.settings");
    await executor.typeText("coffee shop");
    await executor.wait(0);

    expect(calls).toEqual([
      "tap:540,600",
      "double-tap:540,600",
      "long-press:270,1200",
      "swipe:540,1920->540,480",
      "back",
      "home",
      "launch:com.android.settings",
      "type:coffee shop",
    ]);
  });

  it("surfaces native text-entry failures", async () => {
    const nativeModule: CustomerAutomationNativeModule = {
      ...readyNativeModule,
      async typeText() {
        throw new Error(
          "No focused input target is available for Type action."
        );
      },
    };
    const executor = createNativeRoutineActionExecutor(nativeModule, {
      width: 1080,
      height: 2400,
    });

    await expect(executor.typeText("coffee shop")).rejects.toThrow(
      "No focused input target is available for Type action."
    );
  });
});

function createReadyHostedTaskInput(): StartCustomerTaskInput {
  return {
    authorityState: deriveDeviceAuthorityState({
      accessibilityService: "enabled",
      screenCapture: "granted",
      notifications: "granted",
    }),
    runtimeUrl: "http://localhost:8787",
    runtimeAccessToken: "alpha-token",
    instruction: "检查当前页面",
  };
}

function createFinishedSession(instruction: string): CustomerSessionSnapshot {
  return {
    task: {
      id: "customer_task_1",
      instruction,
      status: "finished",
      summary: "Done",
    },
    events: [],
  };
}

function createPausedNativeSession(
  status: "interaction_required" | "confirmation_required"
): CustomerSessionSnapshot {
  const action: RoutineAction =
    status === "confirmation_required"
      ? {
          _metadata: "do",
          action: "Tap",
          element: [500, 250],
          message: "确认点击",
        }
      : {
          _metadata: "do",
          action: "Interact",
          message: "User interaction required.",
        };

  return {
    task: {
      id: "customer_task_1",
      instruction: "检查当前页面",
      status,
      summary: "Paused",
    },
    events: [
      {
        sequence: 1,
        type: "task.paused",
        message: "Paused",
      },
    ],
    pause: {
      status,
      action,
      message: "Paused",
    },
    nextStepNumber: 3,
    lastActionResult: null,
  };
}
