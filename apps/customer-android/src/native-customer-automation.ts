import {
  type CompletionSignalNotifier,
  type CompletionSignalResult,
  notifyTaskOutcome,
} from "./completion-signal";
import type {
  CustomerScreenState,
  CustomerSessionSnapshot,
  StartCustomerTaskInput,
} from "./customer-session";
import type { DeviceAuthoritySnapshot } from "./device-authority";
import type { DeviceAuthorityGateway } from "./device-authority-gateway";
import { createPauseContinueActionResult } from "./routine-action-dispatch";
import type {
  PixelPoint,
  RoutineActionExecutor,
  ScreenSize,
  ScreenStateCollector,
} from "./routine-action-types";
import { stopPausedRoutineActionSession } from "./routine-actions";

export interface CustomerAutomationNativeModule {
  back: () => Promise<void>;
  captureScreenState: () => Promise<CustomerScreenState>;
  doubleTap: (x: number, y: number) => Promise<void>;
  getAuthoritySnapshot: () => Promise<DeviceAuthoritySnapshot>;
  home: () => Promise<void>;
  launchApp: (app: string) => Promise<void>;
  longPress: (x: number, y: number) => Promise<void>;
  openAccessibilitySettings: () => Promise<DeviceAuthoritySnapshot>;
  requestNotifications: () => Promise<DeviceAuthoritySnapshot>;
  requestScreenCapture: () => Promise<DeviceAuthoritySnapshot>;
  runHostedTask: (
    runtimeUrl: string,
    runtimeAccessToken: string,
    instruction: string,
    maxSteps: number,
    resumeStateJson: string | null
  ) => Promise<CustomerSessionSnapshot>;
  showCompletionSignal: (
    session: CustomerSessionSnapshot
  ) => Promise<CompletionSignalResult>;
  stopHostedTask: () => Promise<void>;
  swipe: (
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ) => Promise<void>;
  tap: (x: number, y: number) => Promise<void>;
  typeText: (text: string) => Promise<void>;
  wait: (durationMs: number) => Promise<void>;
}

export interface HostedTaskRunner {
  allowConfirmedAction: (
    session: CustomerSessionSnapshot,
    input: StartCustomerTaskInput
  ) => Promise<CustomerSessionSnapshot>;
  continuePausedTask: (
    session: CustomerSessionSnapshot,
    input: StartCustomerTaskInput
  ) => Promise<CustomerSessionSnapshot>;
  startTask: (
    input: Pick<
      StartCustomerTaskInput,
      "authorityState" | "runtimeUrl" | "runtimeAccessToken" | "instruction"
    >
  ) => Promise<CustomerSessionSnapshot>;
  stopPausedTask: (session: CustomerSessionSnapshot) => CustomerSessionSnapshot;
  stopRunningTask: () => Promise<void>;
}

interface NativeModuleRegistry {
  CustomerAutomation?: CustomerAutomationNativeModule;
}

type NativeHostedTaskRunnerInput = Pick<
  StartCustomerTaskInput,
  "authorityState" | "runtimeUrl" | "runtimeAccessToken" | "instruction"
>;

type NativeHostedResumeMode = "continue" | "allow_confirmed_action";

export function requireCustomerAutomationNativeModule(
  modules: NativeModuleRegistry
): CustomerAutomationNativeModule {
  if (!modules.CustomerAutomation) {
    throw new Error("CustomerAutomation native module is not installed.");
  }

  return modules.CustomerAutomation;
}

export function createNativeDeviceAuthorityGateway(
  nativeModule: CustomerAutomationNativeModule
): DeviceAuthorityGateway {
  return {
    getSnapshot: nativeModule.getAuthoritySnapshot,
    openAccessibilitySettings: nativeModule.openAccessibilitySettings,
    requestScreenCapture: nativeModule.requestScreenCapture,
    requestNotifications: nativeModule.requestNotifications,
  };
}

export function createNativeScreenStateCollector(
  nativeModule: CustomerAutomationNativeModule
): ScreenStateCollector {
  return {
    capture: nativeModule.captureScreenState,
  };
}

export function createNativeCompletionSignalNotifier(
  nativeModule: CustomerAutomationNativeModule
): CompletionSignalNotifier {
  return {
    notifyTaskOutcome: nativeModule.showCompletionSignal,
  };
}

export function createNativeHostedTaskRunner(
  nativeModule: CustomerAutomationNativeModule,
  completionSignalNotifier: CompletionSignalNotifier = createNativeCompletionSignalNotifier(
    nativeModule
  )
): HostedTaskRunner {
  return {
    allowConfirmedAction(session, input) {
      return runNativeHostedTask(
        nativeModule,
        completionSignalNotifier,
        input,
        createNativeHostedResumeStateJson("allow_confirmed_action", session)
      );
    },
    continuePausedTask(session, input) {
      return runNativeHostedTask(
        nativeModule,
        completionSignalNotifier,
        input,
        createNativeHostedResumeStateJson("continue", session)
      );
    },
    startTask({ authorityState, runtimeUrl, runtimeAccessToken, instruction }) {
      return runNativeHostedTask(
        nativeModule,
        completionSignalNotifier,
        {
          authorityState,
          runtimeUrl,
          runtimeAccessToken,
          instruction,
        },
        null
      );
    },
    stopPausedTask(session) {
      return stopPausedRoutineActionSession(session);
    },
    stopRunningTask() {
      return nativeModule.stopHostedTask();
    },
  };
}

async function runNativeHostedTask(
  nativeModule: CustomerAutomationNativeModule,
  completionSignalNotifier: CompletionSignalNotifier,
  input: NativeHostedTaskRunnerInput,
  resumeStateJson: string | null
): Promise<CustomerSessionSnapshot> {
  const normalizedInput = normalizeNativeHostedTaskInput(input);
  return notifyTaskOutcome(
    await nativeModule.runHostedTask(
      normalizedInput.runtimeUrl,
      normalizedInput.runtimeAccessToken,
      normalizedInput.instruction,
      50,
      resumeStateJson
    ),
    completionSignalNotifier
  );
}

function normalizeNativeHostedTaskInput({
  authorityState,
  runtimeUrl,
  runtimeAccessToken,
  instruction,
}: NativeHostedTaskRunnerInput): {
  instruction: string;
  runtimeAccessToken: string;
  runtimeUrl: string;
} {
  if (!authorityState.canStartTask) {
    throw new Error(
      `Android permissions are required before starting a task: ${authorityState.missing.join(", ")}.`
    );
  }

  const normalizedInstruction = instruction.trim();
  if (!normalizedInstruction) {
    throw new Error("Instruction is required.");
  }

  const normalizedRuntimeAccessToken = runtimeAccessToken.trim();
  if (!normalizedRuntimeAccessToken) {
    throw new Error("Runtime access token is required.");
  }

  return {
    instruction: normalizedInstruction,
    runtimeAccessToken: normalizedRuntimeAccessToken,
    runtimeUrl,
  };
}

function createNativeHostedResumeStateJson(
  mode: NativeHostedResumeMode,
  session: CustomerSessionSnapshot
): string {
  if (!session.pause) {
    throw new Error(
      "A paused task is required before resuming native hosted execution."
    );
  }

  return JSON.stringify({
    mode,
    taskId: session.task.id,
    events: session.events,
    nextStepNumber: session.nextStepNumber ?? 1,
    lastActionResult:
      mode === "continue"
        ? createPauseContinueActionResult(session.pause)
        : (session.lastActionResult ?? null),
    pause: session.pause,
  });
}

export function createNativeRoutineActionExecutor(
  nativeModule: CustomerAutomationNativeModule,
  screen: ScreenSize
): RoutineActionExecutor {
  return {
    screen,
    async tap(point) {
      const roundedPoint = roundPixelPoint(point);
      await nativeModule.tap(roundedPoint.x, roundedPoint.y);
    },
    async doubleTap(point) {
      const roundedPoint = roundPixelPoint(point);
      await nativeModule.doubleTap(roundedPoint.x, roundedPoint.y);
    },
    async longPress(point) {
      const roundedPoint = roundPixelPoint(point);
      await nativeModule.longPress(roundedPoint.x, roundedPoint.y);
    },
    async swipe(start, end) {
      const roundedStart = roundPixelPoint(start);
      const roundedEnd = roundPixelPoint(end);
      await nativeModule.swipe(
        roundedStart.x,
        roundedStart.y,
        roundedEnd.x,
        roundedEnd.y
      );
    },
    async back() {
      await nativeModule.back();
    },
    async home() {
      await nativeModule.home();
    },
    async launchApp(app) {
      await nativeModule.launchApp(app);
    },
    async typeText(text) {
      await nativeModule.typeText(text);
    },
    async wait(durationMs) {
      await delay(durationMs);
    },
  };
}

export function roundPixelPoint(point: PixelPoint): PixelPoint {
  return {
    x: Math.round(point.x),
    y: Math.round(point.y),
  };
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}
