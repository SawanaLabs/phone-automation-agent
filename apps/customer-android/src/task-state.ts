import type { CustomerTaskEvent } from "./customer-session"

export function visibleTraceEvents(
  events: CustomerTaskEvent[]
): CustomerTaskEvent[] {
  return events
    .filter(
      (event) =>
        event.type.startsWith("task.") || event.type.startsWith("step.")
    )
    .slice(-8)
    .reverse()
}

export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}
