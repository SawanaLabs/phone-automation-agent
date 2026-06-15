import type { CompletionSignalNotifier } from "./completion-signal";
import {
  type CustomerActionResult,
  type CustomerSessionSnapshot,
  type CustomerTaskEvent,
  type StartCustomerTaskInput,
  startCustomerTask as startHostedCustomerTask,
} from "./customer-session";
import {
  createPauseContinueActionResult as createPauseContinueResult,
  executeConfirmedPauseAction as executeConfirmedAction,
} from "./routine-action-dispatch";
import type {
  RoutineActionExecutor,
  ScreenStateCollector,
} from "./routine-action-types";
import {
  runHostedRoutineActionLoop as runHostedLoop,
  stopPausedRoutineActionSession as stopPausedSession,
} from "./routine-actions";
import { describeError as describeTaskError } from "./task-state";

export interface CustomerTaskRunSink {
  setErrorMessage: (message: string | null) => void;
  setIsSubmitting: (value: boolean) => void;
  setIsTaskLoopRunning: (value: boolean) => void;
  setSession: (session: CustomerSessionSnapshot | null) => void;
  updateSession: (
    updater: (
      currentSession: CustomerSessionSnapshot | null
    ) => CustomerSessionSnapshot
  ) => void;
}

export interface CustomerTaskRunController {
  allowConfirmedAction: (
    session: CustomerSessionSnapshot | null,
    input: StartCustomerTaskInput
  ) => Promise<void>;
  continuePausedTask: (
    session: CustomerSessionSnapshot | null,
    input: StartCustomerTaskInput
  ) => Promise<void>;
  startTask: (input: StartCustomerTaskInput) => Promise<void>;
  stopTask: (session: CustomerSessionSnapshot | null) => void;
}

export interface CustomerTaskRunControllerInput {
  completionSignalNotifier?: CompletionSignalNotifier;
  createPauseContinueActionResult?: typeof createPauseContinueResult;
  describeError?: (error: unknown) => string;
  executeConfirmedPauseAction?: typeof executeConfirmedAction;
  nativeHostedTaskRunner?: {
    startTask: (
      input: StartCustomerTaskInput
    ) => Promise<CustomerSessionSnapshot>;
  } | null;
  routineActionExecutor: RoutineActionExecutor;
  runHostedRoutineActionLoop?: typeof runHostedLoop;
  screenStateCollector: ScreenStateCollector;
  sink: CustomerTaskRunSink;
  startCustomerTask?: typeof startHostedCustomerTask;
  stopPausedRoutineActionSession?: typeof stopPausedSession;
}

export function createCustomerTaskRunController({
  completionSignalNotifier,
  createPauseContinueActionResult = createPauseContinueResult,
  describeError = describeTaskError,
  executeConfirmedPauseAction = executeConfirmedAction,
  nativeHostedTaskRunner = null,
  routineActionExecutor,
  runHostedRoutineActionLoop = runHostedLoop,
  screenStateCollector,
  sink,
  startCustomerTask = startHostedCustomerTask,
  stopPausedRoutineActionSession = stopPausedSession,
}: CustomerTaskRunControllerInput): CustomerTaskRunController {
  let stopRequested = false;

  async function startTask(input: StartCustomerTaskInput) {
    sink.setIsSubmitting(true);
    sink.setErrorMessage(null);
    stopRequested = false;
    try {
      if (nativeHostedTaskRunner) {
        sink.setIsTaskLoopRunning(true);
        sink.setSession(await nativeHostedTaskRunner.startTask(input));
        return;
      }

      const nextSession = await startCustomerTask(input);
      sink.setSession(nextSession);
      await runTaskLoopFromSession(nextSession, input);
    } catch (error) {
      sink.setSession(null);
      sink.setErrorMessage(describeError(error));
    } finally {
      sink.setIsSubmitting(false);
      if (nativeHostedTaskRunner) {
        sink.setIsTaskLoopRunning(false);
      }
    }
  }

  function stopTask(session: CustomerSessionSnapshot | null) {
    if (session?.pause) {
      sink.setSession(stopPausedRoutineActionSession(session));
      return;
    }

    stopRequested = true;
  }

  async function continuePausedTask(
    session: CustomerSessionSnapshot | null,
    input: StartCustomerTaskInput
  ) {
    if (!session?.pause) {
      return;
    }

    await runTaskLoopFromSession(session, input, {
      initialLastActionResult: createPauseContinueActionResult(session.pause),
      initialStepNumber: session.nextStepNumber,
    });
  }

  async function allowConfirmedAction(
    session: CustomerSessionSnapshot | null,
    input: StartCustomerTaskInput
  ) {
    if (!session?.pause) {
      return;
    }

    sink.setIsTaskLoopRunning(true);
    sink.setErrorMessage(null);
    stopRequested = false;
    try {
      const result = await executeConfirmedPauseAction(
        session.pause,
        routineActionExecutor
      );
      const confirmedSession = appendSessionEvent(session, {
        sequence: session.events.length + 1,
        type: "step.result",
        message: result.message,
        payload: {
          result,
          stepNumber: Math.max(1, (session.nextStepNumber ?? 2) - 1),
        },
      });
      sink.setSession(confirmedSession);
      await runTaskLoopFromSession(
        confirmedSession,
        input,
        {
          initialLastActionResult: result,
          initialStepNumber: session.nextStepNumber,
        },
        { alreadyLooping: true }
      );
    } catch (error) {
      sink.setErrorMessage(describeError(error));
    } finally {
      sink.setIsTaskLoopRunning(false);
    }
  }

  async function runTaskLoopFromSession(
    baseSession: CustomerSessionSnapshot,
    input: StartCustomerTaskInput,
    options: {
      initialLastActionResult?: CustomerActionResult | null;
      initialStepNumber?: number;
    } = {},
    loopOptions: { alreadyLooping?: boolean } = {}
  ) {
    if (!loopOptions.alreadyLooping) {
      sink.setIsTaskLoopRunning(true);
    }
    sink.setErrorMessage(null);
    stopRequested = false;
    try {
      const finalSession = await runHostedRoutineActionLoop({
        taskId: baseSession.task.id,
        instruction: baseSession.task.instruction,
        runtimeUrl: input.runtimeUrl,
        runtimeAccessToken: input.runtimeAccessToken,
        executor: routineActionExecutor,
        screenStateCollector,
        initialEvents: baseSession.events,
        initialLastActionResult: options.initialLastActionResult,
        initialStepNumber: options.initialStepNumber,
        completionSignalNotifier,
        shouldStop: () => stopRequested,
        onEvent: (event) => {
          sink.updateSession((currentSession) =>
            appendSessionEvent(currentSession ?? baseSession, event)
          );
        },
      });
      sink.setSession(finalSession);
    } catch (error) {
      sink.setErrorMessage(describeError(error));
    } finally {
      if (!loopOptions.alreadyLooping) {
        sink.setIsTaskLoopRunning(false);
      }
    }
  }

  return {
    allowConfirmedAction,
    continuePausedTask,
    startTask,
    stopTask,
  };
}

export function appendSessionEvent(
  session: CustomerSessionSnapshot,
  event: CustomerTaskEvent
): CustomerSessionSnapshot {
  return {
    ...session,
    events: [...session.events, event],
  };
}
