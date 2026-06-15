import {
  type CompletionSignalNotifier,
  notifyTaskOutcome,
} from "./completion-signal";
import {
  type CustomerActionDecision,
  type CustomerActionResult,
  type CustomerScreenState,
  type CustomerSessionSnapshot,
  type CustomerTaskEvent,
  type CustomerTaskPause,
  requestNextCustomerAction,
} from "./customer-session";
import {
  createRoutineActionRunner,
  describeUnknownError,
  dispatchRoutineAction,
} from "./routine-action-dispatch";

import type {
  ExecutableRoutineAction,
  HostedRoutineActionLoopInput,
  RoutineActionExecutor,
  RoutineActionRunner,
  RoutineActionScriptInput,
} from "./routine-action-types";

export async function runRoutineActionScript({
  taskId,
  instruction,
  actions,
  executor,
  shouldStop = () => false,
  onEvent,
}: RoutineActionScriptInput): Promise<CustomerSessionSnapshot> {
  const events: CustomerTaskEvent[] = [];

  for (const action of actions) {
    if (shouldStop()) {
      const event = createEvent(
        events,
        "task.stopped",
        "Task stopped by user."
      );
      onEvent?.(event);
      return createSnapshot(taskId, instruction, "stopped", null, events);
    }

    if (action._metadata === "finish") {
      const event = createEvent(events, "task.finished", action.message);
      onEvent?.(event);
      return createSnapshot(
        taskId,
        instruction,
        "finished",
        action.message,
        events
      );
    }

    if (action._metadata === "failed") {
      const event = createEvent(events, "task.failed", action.message);
      onEvent?.(event);
      return createSnapshot(
        taskId,
        instruction,
        "failed",
        action.message,
        events
      );
    }

    const actionEvent = createEvent(
      events,
      "step.action",
      describeRoutineAction(action),
      { action }
    );
    onEvent?.(actionEvent);
    await dispatchRoutineAction(action, executor);
    const resultEvent = createEvent(
      events,
      "step.result",
      `${action.action} completed.`
    );
    onEvent?.(resultEvent);
  }

  throw new Error("Routine action script ended without finish.");
}

export async function runHostedRoutineActionLoop({
  taskId,
  instruction,
  runtimeUrl,
  runtimeAccessToken,
  actionRunner,
  executor,
  screenStateCollector,
  fetchImpl,
  shouldStop = () => false,
  onEvent,
  initialEvents = [],
  initialStepNumber = 1,
  initialLastActionResult = null,
  maxSteps = 50,
  completionSignalNotifier,
}: HostedRoutineActionLoopInput): Promise<CustomerSessionSnapshot> {
  const events: CustomerTaskEvent[] = [...initialEvents];
  const routineActionRunner = resolveRoutineActionRunner(
    actionRunner,
    executor
  );
  let lastActionResult: CustomerActionResult | null = initialLastActionResult;

  for (let offset = 0; offset < maxSteps; offset += 1) {
    const stepNumber = initialStepNumber + offset;
    if (shouldStop()) {
      const event = createEvent(
        events,
        "task.stopped",
        "Task stopped by user."
      );
      onEvent?.(event);
      return completeHostedSession(
        createSnapshot(taskId, instruction, "stopped", null, events),
        completionSignalNotifier,
        onEvent
      );
    }

    let screen: CustomerScreenState;
    let decision: CustomerActionDecision;
    try {
      screen = await screenStateCollector.capture();
      decision = await requestNextCustomerAction({
        runtimeUrl,
        runtimeAccessToken,
        taskId,
        instruction,
        stepNumber,
        screen,
        lastActionResult,
        fetchImpl,
      });
    } catch (error) {
      const message = describeUnknownError(error);
      const event = createEvent(events, "task.failed", message, { stepNumber });
      onEvent?.(event);
      return completeHostedSession(
        createSnapshot(taskId, instruction, "failed", message, events),
        completionSignalNotifier,
        onEvent
      );
    }

    const action = decision.action;

    if (action._metadata === "finish") {
      const event = createEvent(events, "task.finished", action.message);
      onEvent?.(event);
      return completeHostedSession(
        createSnapshot(taskId, instruction, "finished", action.message, events),
        completionSignalNotifier,
        onEvent
      );
    }

    if (action._metadata === "failed") {
      const event = createEvent(events, "task.failed", action.message, {
        stepNumber,
      });
      onEvent?.(event);
      return completeHostedSession(
        createSnapshot(taskId, instruction, "failed", action.message, events),
        completionSignalNotifier,
        onEvent
      );
    }

    const pause = createPauseForAction(action);
    if (pause) {
      const event = createEvent(events, "task.paused", pause.message, {
        pause,
        stepNumber,
      });
      onEvent?.(event);
      return completeHostedSession(
        createSnapshot(
          taskId,
          instruction,
          pause.status,
          pause.message,
          events,
          {
            pause,
            nextStepNumber: stepNumber + 1,
            lastActionResult,
          }
        ),
        completionSignalNotifier,
        onEvent
      );
    }

    const actionEvent = createEvent(
      events,
      "step.action",
      describeRoutineAction(action),
      {
        action,
        stepNumber,
        screen: {
          width: screen.width,
          height: screen.height,
          currentPackage: screen.currentPackage ?? null,
        },
      }
    );
    onEvent?.(actionEvent);

    lastActionResult = await routineActionRunner.execute(action);
    const resultEvent = createEvent(
      events,
      "step.result",
      lastActionResult.message,
      { result: lastActionResult, stepNumber }
    );
    onEvent?.(resultEvent);
  }

  throw new Error(
    `Hosted routine action loop exceeded ${maxSteps} steps without finish.`
  );
}

async function completeHostedSession(
  session: CustomerSessionSnapshot,
  completionSignalNotifier: CompletionSignalNotifier | undefined,
  onEvent: ((event: CustomerTaskEvent) => void) | undefined
): Promise<CustomerSessionSnapshot> {
  const notifiedSession = await notifyTaskOutcome(
    session,
    completionSignalNotifier
  );
  for (const event of notifiedSession.events.slice(session.events.length)) {
    onEvent?.(event);
  }
  return notifiedSession;
}

function resolveRoutineActionRunner(
  actionRunner: RoutineActionRunner | undefined,
  executor: RoutineActionExecutor | undefined
): RoutineActionRunner {
  if (actionRunner) {
    return actionRunner;
  }

  if (executor) {
    return createRoutineActionRunner(executor);
  }

  throw new Error("Routine action runner or executor is required.");
}

export function stopPausedRoutineActionSession(
  session: CustomerSessionSnapshot
): CustomerSessionSnapshot {
  const events = [...session.events];
  createEvent(events, "task.stopped", "Task stopped by user.");
  return {
    ...session,
    task: {
      ...session.task,
      status: "stopped",
      summary: null,
    },
    events,
    pause: null,
  };
}

function createPauseForAction(
  action: ExecutableRoutineAction
): CustomerTaskPause | null {
  if (action.action === "Take_over") {
    return {
      status: "takeover_required",
      action,
      message: action.message,
    };
  }

  if (action.action === "Interact") {
    return {
      status: "interaction_required",
      action,
      message: action.message ?? "User interaction required.",
    };
  }

  if (action.action === "Tap" && action.message) {
    return {
      status: "confirmation_required",
      action,
      message: action.message,
    };
  }

  return null;
}

function createEvent(
  events: CustomerTaskEvent[],
  type: string,
  message: string,
  payload?: Record<string, unknown>
): CustomerTaskEvent {
  const event: CustomerTaskEvent = {
    sequence: events.length + 1,
    type,
    message,
    payload,
  };
  events.push(event);
  return event;
}

function createSnapshot(
  taskId: string,
  instruction: string,
  status: CustomerSessionSnapshot["task"]["status"],
  summary: string | null,
  events: CustomerTaskEvent[],
  options: {
    pause?: CustomerTaskPause | null;
    nextStepNumber?: number;
    lastActionResult?: CustomerActionResult | null;
  } = {}
): CustomerSessionSnapshot {
  return {
    task: {
      id: taskId,
      instruction,
      status,
      summary,
    },
    events,
    pause: options.pause ?? null,
    nextStepNumber: options.nextStepNumber,
    lastActionResult: options.lastActionResult,
  };
}

function describeRoutineAction(action: ExecutableRoutineAction): string {
  if (action.action === "Tap") {
    return `Tap ${action.element.join(",")}`;
  }

  if (action.action === "Double Tap" || action.action === "Long Press") {
    return `${action.action} ${action.element.join(",")}`;
  }

  if (action.action === "Launch") {
    return `Launch ${action.app}`;
  }

  if (action.action === "Type" || action.action === "Type_Name") {
    return `${action.action} ${action.text.length} chars`;
  }

  if (action.action === "Swipe") {
    return `Swipe ${action.start.join(",")} -> ${action.end.join(",")}`;
  }

  if (action.action === "Wait") {
    return `Wait ${action.duration ?? "1 seconds"}`;
  }

  if (action.action === "Note") {
    return `Note ${action.message.length} chars`;
  }

  if (action.action === "Call_API") {
    return `Call_API ${action.instruction.length} chars`;
  }

  return action.action;
}
