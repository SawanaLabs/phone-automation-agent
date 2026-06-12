import type { CustomerSessionSnapshot, CustomerTaskEvent } from "./customer-session"

export type RelativePoint = [number, number]

export type ScreenSize = {
  width: number
  height: number
}

export type PixelPoint = {
  x: number
  y: number
}

export type RoutineAction =
  | {
      _metadata: "do"
      action: "Launch"
      app: string
    }
  | {
      _metadata: "do"
      action: "Tap"
      element: RelativePoint
    }
  | {
      _metadata: "do"
      action: "Swipe"
      start: RelativePoint
      end: RelativePoint
    }
  | {
      _metadata: "do"
      action: "Back"
    }
  | {
      _metadata: "do"
      action: "Home"
    }
  | {
      _metadata: "do"
      action: "Wait"
      duration?: string
    }
  | {
      _metadata: "do"
      action: "Type" | "Type_Name"
      text: string
    }
  | {
      _metadata: "finish"
      message: string
    }

export type RoutineActionExecutor = {
  screen: ScreenSize
  tap: (point: PixelPoint) => Promise<void>
  swipe: (start: PixelPoint, end: PixelPoint) => Promise<void>
  back: () => Promise<void>
  home: () => Promise<void>
  launchApp: (app: string) => Promise<void>
  typeText: (text: string) => Promise<void>
  wait: (durationMs: number) => Promise<void>
}

export type RoutineActionScriptInput = {
  taskId: string
  instruction: string
  actions: RoutineAction[]
  executor: RoutineActionExecutor
  shouldStop?: () => boolean
  onEvent?: (event: CustomerTaskEvent) => void
}

export function convertRelativePoint(
  point: RelativePoint,
  screen: ScreenSize
): PixelPoint {
  const [relativeX, relativeY] = point
  assertRelativeCoordinate(relativeX)
  assertRelativeCoordinate(relativeY)

  return {
    x: Math.round((relativeX / 1000) * screen.width),
    y: Math.round((relativeY / 1000) * screen.height),
  }
}

export async function runRoutineActionScript({
  taskId,
  instruction,
  actions,
  executor,
  shouldStop = () => false,
  onEvent,
}: RoutineActionScriptInput): Promise<CustomerSessionSnapshot> {
  const events: CustomerTaskEvent[] = []

  for (const action of actions) {
    if (shouldStop()) {
      const event = createEvent(events, "task.stopped", "Task stopped by user.")
      onEvent?.(event)
      return createSnapshot(taskId, instruction, "stopped", null, events)
    }

    if (action._metadata === "finish") {
      const event = createEvent(events, "task.finished", action.message)
      onEvent?.(event)
      return createSnapshot(taskId, instruction, "finished", action.message, events)
    }

    const actionEvent = createEvent(
      events,
      "step.action",
      describeRoutineAction(action),
      { action }
    )
    onEvent?.(actionEvent)
    await dispatchRoutineAction(action, executor)
    const resultEvent = createEvent(
      events,
      "step.result",
      `${action.action} completed.`
    )
    onEvent?.(resultEvent)
  }

  throw new Error("Routine action script ended without finish.")
}

async function dispatchRoutineAction(
  action: Exclude<RoutineAction, { _metadata: "finish" }>,
  executor: RoutineActionExecutor
): Promise<void> {
  if (action.action === "Tap") {
    await executor.tap(convertRelativePoint(action.element, executor.screen))
    return
  }

  if (action.action === "Launch") {
    await executor.launchApp(normalizeRequiredString(action.app, "Launch app"))
    return
  }

  if (action.action === "Type" || action.action === "Type_Name") {
    await executor.typeText(action.text)
    return
  }

  if (action.action === "Swipe") {
    await executor.swipe(
      convertRelativePoint(action.start, executor.screen),
      convertRelativePoint(action.end, executor.screen)
    )
    return
  }

  if (action.action === "Back") {
    await executor.back()
    return
  }

  if (action.action === "Home") {
    await executor.home()
    return
  }

  if (action.action === "Wait") {
    await executor.wait(parseWaitDurationMs(action.duration))
    return
  }

  throw new Error(`Unsupported routine action: ${JSON.stringify(action)}`)
}

function normalizeRequiredString(value: string, label: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error(`${label} is required.`)
  }

  return trimmed
}

function parseWaitDurationMs(duration: string | undefined): number {
  if (!duration) {
    return 1000
  }

  const value = Number.parseFloat(duration)
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid Wait duration: ${duration}`)
  }

  if (duration.toLowerCase().includes("ms")) {
    return Math.round(value)
  }

  return Math.round(value * 1000)
}

function assertRelativeCoordinate(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 1000) {
    throw new Error(`Relative coordinate must be between 0 and 1000: ${value}`)
  }
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
  }
  events.push(event)
  return event
}

function createSnapshot(
  taskId: string,
  instruction: string,
  status: CustomerSessionSnapshot["task"]["status"],
  summary: string | null,
  events: CustomerTaskEvent[]
): CustomerSessionSnapshot {
  return {
    task: {
      id: taskId,
      instruction,
      status,
      summary,
    },
    events,
  }
}

function describeRoutineAction(action: Exclude<RoutineAction, { _metadata: "finish" }>): string {
  if (action.action === "Tap") {
    return `Tap ${action.element.join(",")}`
  }

  if (action.action === "Launch") {
    return `Launch ${action.app}`
  }

  if (action.action === "Type" || action.action === "Type_Name") {
    return `${action.action} ${action.text.length} chars`
  }

  if (action.action === "Swipe") {
    return `Swipe ${action.start.join(",")} -> ${action.end.join(",")}`
  }

  if (action.action === "Wait") {
    return `Wait ${action.duration ?? "1 seconds"}`
  }

  return action.action
}
