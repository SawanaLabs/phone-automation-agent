import type {
  CustomerActionResult,
  CustomerTaskPause,
} from "./customer-session";
import type {
  ExecutableRoutineAction,
  PixelPoint,
  RelativePoint,
  RoutineActionExecutor,
  ScreenSize,
} from "./routine-action-types";

export function convertRelativePoint(
  point: RelativePoint,
  screen: ScreenSize
): PixelPoint {
  const [relativeX, relativeY] = point;
  assertRelativeCoordinate(relativeX);
  assertRelativeCoordinate(relativeY);

  return {
    x: Math.round((relativeX / 1000) * screen.width),
    y: Math.round((relativeY / 1000) * screen.height),
  };
}

export function createPauseContinueActionResult(
  pause: CustomerTaskPause | null | undefined
): CustomerActionResult {
  if (!pause) {
    throw new Error("A paused task is required before continuing.");
  }

  return {
    status: "succeeded",
    action: pause.action._metadata === "do" ? pause.action.action : "finish",
    message:
      pause.action._metadata === "do"
        ? `User continued after ${pause.action.action}.`
        : "User continued.",
  };
}

export async function executeConfirmedPauseAction(
  pause: CustomerTaskPause | null | undefined,
  executor: RoutineActionExecutor
): Promise<CustomerActionResult> {
  if (
    pause?.status !== "confirmation_required" ||
    pause.action._metadata !== "do" ||
    pause.action.action !== "Tap"
  ) {
    throw new Error("A confirmation pause with a Tap action is required.");
  }

  await executor.tap(
    convertRelativePoint(pause.action.element, executor.screen)
  );
  return {
    status: "succeeded",
    action: "Tap",
    message: "Tap completed.",
  };
}

export async function dispatchHostedRoutineAction(
  action: ExecutableRoutineAction,
  executor: RoutineActionExecutor
): Promise<CustomerActionResult> {
  if (action.action === "Note") {
    return {
      status: "succeeded",
      action: "Note",
      message: `Note recorded: ${normalizeRequiredString(
        action.message,
        "Note message"
      )}`,
    };
  }

  if (action.action === "Call_API") {
    normalizeRequiredString(action.instruction, "Call_API instruction");
    return {
      status: "unsupported",
      action: "Call_API",
      message:
        "Call_API is a runtime-local action and is not implemented by this hosted runtime.",
    };
  }

  try {
    await dispatchRoutineAction(action, executor);
    return {
      status: "succeeded",
      action: action.action,
      message: `${action.action} completed.`,
    };
  } catch (error) {
    return {
      status: "failed",
      action: action.action,
      message: describeUnknownError(error),
    };
  }
}

export async function dispatchRoutineAction(
  action: ExecutableRoutineAction,
  executor: RoutineActionExecutor
): Promise<void> {
  if (action.action === "Tap") {
    await executor.tap(convertRelativePoint(action.element, executor.screen));
    return;
  }

  if (action.action === "Double Tap") {
    await executor.doubleTap(
      convertRelativePoint(action.element, executor.screen)
    );
    return;
  }

  if (action.action === "Long Press") {
    await executor.longPress(
      convertRelativePoint(action.element, executor.screen)
    );
    return;
  }

  if (action.action === "Launch") {
    await executor.launchApp(normalizeRequiredString(action.app, "Launch app"));
    return;
  }

  if (action.action === "Type" || action.action === "Type_Name") {
    await executor.typeText(action.text);
    return;
  }

  if (action.action === "Swipe") {
    await executor.swipe(
      convertRelativePoint(action.start, executor.screen),
      convertRelativePoint(action.end, executor.screen)
    );
    return;
  }

  if (action.action === "Back") {
    await executor.back();
    return;
  }

  if (action.action === "Home") {
    await executor.home();
    return;
  }

  if (action.action === "Wait") {
    await executor.wait(parseWaitDurationMs(action.duration));
    return;
  }

  throw new Error(`Unsupported routine action: ${JSON.stringify(action)}`);
}

export function describeUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function normalizeRequiredString(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }

  return trimmed;
}

function parseWaitDurationMs(duration: string | undefined): number {
  if (!duration) {
    return 1000;
  }

  const value = Number.parseFloat(duration);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid Wait duration: ${duration}`);
  }

  if (duration.toLowerCase().includes("ms")) {
    return Math.round(value);
  }

  return Math.round(value * 1000);
}

function assertRelativeCoordinate(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 1000) {
    throw new Error(`Relative coordinate must be between 0 and 1000: ${value}`);
  }
}
