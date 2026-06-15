import type {
  CustomerSessionSnapshot,
  CustomerTaskEvent,
  CustomerTaskStatus,
} from "./customer-session";

type CompletionSignalTaskStatus = Extract<
  CustomerTaskStatus,
  | "finished"
  | "failed"
  | "stopped"
  | "takeover_required"
  | "interaction_required"
  | "confirmation_required"
>;

export interface CompletionSignalResult {
  message: string;
  status: "delivered";
}

export interface CompletionSignalNotifier {
  notifyTaskOutcome: (
    session: CustomerSessionSnapshot & {
      task: CustomerSessionSnapshot["task"] & {
        status: CompletionSignalTaskStatus;
      };
    }
  ) => Promise<CompletionSignalResult>;
}

export async function notifyTaskOutcome(
  session: CustomerSessionSnapshot,
  notifier: CompletionSignalNotifier | undefined
): Promise<CustomerSessionSnapshot> {
  if (!(notifier && shouldNotifyTaskOutcome(session.task.status))) {
    return session;
  }

  try {
    const result = await notifier.notifyTaskOutcome(
      session as CustomerSessionSnapshot & {
        task: CustomerSessionSnapshot["task"] & {
          status: CompletionSignalTaskStatus;
        };
      }
    );
    return appendNotificationEvent(session, {
      type: "task.notification.delivered",
      message: result.message,
    });
  } catch (error) {
    return appendNotificationEvent(session, {
      type: "task.notification.failed",
      message: describeError(error),
    });
  }
}

export function shouldNotifyTaskOutcome(
  status: CustomerTaskStatus
): status is CompletionSignalTaskStatus {
  return (
    status === "finished" ||
    status === "failed" ||
    status === "stopped" ||
    status === "takeover_required" ||
    status === "interaction_required" ||
    status === "confirmation_required"
  );
}

function appendNotificationEvent(
  session: CustomerSessionSnapshot,
  event: Pick<CustomerTaskEvent, "type" | "message">
): CustomerSessionSnapshot {
  return {
    ...session,
    events: [
      ...session.events,
      {
        sequence: session.events.length + 1,
        type: event.type,
        message: event.message,
        payload: {},
      },
    ],
  };
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
