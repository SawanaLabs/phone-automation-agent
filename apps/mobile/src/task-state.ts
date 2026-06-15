import type { TaskEvent, TaskRecord, TaskStatus } from "./worker-api";

export type ConnectionState = "idle" | "checking" | "online" | "offline";

export function isActiveStatus(status: TaskStatus): boolean {
  return (
    status === "created" ||
    status === "running" ||
    status === "confirmation_required" ||
    status === "takeover_required"
  );
}

export function isTraceEvent(event: TaskEvent): boolean {
  return (
    event.type.startsWith("step.") ||
    event.type.startsWith("gate.") ||
    event.type === "task.finished" ||
    event.type === "task.failed"
  );
}

export function getScreenSummary(
  task: TaskRecord | null,
  events: TaskEvent[]
): string | null {
  const terminalEvent = [...events]
    .reverse()
    .find((event) => event.type === "task.finished");
  const screenSummary = terminalEvent?.payload.screen_summary;
  if (typeof screenSummary === "string" && screenSummary.trim()) {
    return screenSummary;
  }

  return task?.summary ?? null;
}

export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
