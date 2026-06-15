import {
  requestNextCustomerAction,
  type CustomerActionResult,
  type CustomerScreenState,
  type CustomerSessionSnapshot,
  type CustomerTaskEvent,
  type CustomerTaskPause,
} from "./customer-session"
import {
  notifyTaskOutcome,
  type CompletionSignalNotifier,
} from "./completion-signal"

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
      message?: string
    }
  | {
      _metadata: "do"
      action: "Double Tap"
      element: RelativePoint
    }
  | {
      _metadata: "do"
      action: "Long Press"
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
      _metadata: "do"
      action: "Take_over"
      message: string
    }
  | {
      _metadata: "do"
      action: "Interact"
      message?: string
    }
  | {
      _metadata: "do"
      action: "Note"
      message: string
    }
  | {
      _metadata: "do"
      action: "Call_API"
      instruction: string
    }
  | {
      _metadata: "finish"
      message: string
    }
  | {
      _metadata: "failed"
      message: string
    }

type ExecutableRoutineAction = Extract<RoutineAction, { _metadata: "do" }>

export type RoutineActionExecutor = {
  screen: ScreenSize
  tap: (point: PixelPoint) => Promise<void>
  doubleTap: (point: PixelPoint) => Promise<void>
  longPress: (point: PixelPoint) => Promise<void>
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

export type ScreenStateCollector = {
  capture: () => Promise<CustomerScreenState>
}

export type HostedRoutineActionLoopInput = {
  taskId: string
  instruction: string
  runtimeUrl: string
  runtimeAccessToken: string
  executor: RoutineActionExecutor
  screenStateCollector: ScreenStateCollector
  fetchImpl?: typeof fetch
  shouldStop?: () => boolean
  onEvent?: (event: CustomerTaskEvent) => void
  initialEvents?: CustomerTaskEvent[]
  initialStepNumber?: number
  initialLastActionResult?: CustomerActionResult | null
  maxSteps?: number
  completionSignalNotifier?: CompletionSignalNotifier
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

    if (action._metadata === "failed") {
      const event = createEvent(events, "task.failed", action.message)
      onEvent?.(event)
      return createSnapshot(taskId, instruction, "failed", action.message, events)
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

export async function runHostedRoutineActionLoop({
  taskId,
  instruction,
  runtimeUrl,
  runtimeAccessToken,
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
  const events: CustomerTaskEvent[] = [...initialEvents]
  let lastActionResult: CustomerActionResult | null = initialLastActionResult

  for (let offset = 0; offset < maxSteps; offset += 1) {
    const stepNumber = initialStepNumber + offset
    if (shouldStop()) {
      const event = createEvent(events, "task.stopped", "Task stopped by user.")
      onEvent?.(event)
      return completeHostedSession(
        createSnapshot(taskId, instruction, "stopped", null, events),
        completionSignalNotifier,
        onEvent
      )
    }

    let screen: CustomerScreenState
    let decision
    try {
      screen = await screenStateCollector.capture()
      decision = await requestNextCustomerAction({
        runtimeUrl,
        runtimeAccessToken,
        taskId,
        instruction,
        stepNumber,
        screen,
        lastActionResult,
        fetchImpl,
      })
    } catch (error) {
      const message = describeUnknownError(error)
      const event = createEvent(events, "task.failed", message, { stepNumber })
      onEvent?.(event)
      return completeHostedSession(
        createSnapshot(taskId, instruction, "failed", message, events),
        completionSignalNotifier,
        onEvent
      )
    }

    const action = decision.action

    if (action._metadata === "finish") {
      const event = createEvent(events, "task.finished", action.message)
      onEvent?.(event)
      return completeHostedSession(
        createSnapshot(
          taskId,
          instruction,
          "finished",
          action.message,
          events
        ),
        completionSignalNotifier,
        onEvent
      )
    }

    if (action._metadata === "failed") {
      const event = createEvent(events, "task.failed", action.message, {
        stepNumber,
      })
      onEvent?.(event)
      return completeHostedSession(
        createSnapshot(taskId, instruction, "failed", action.message, events),
        completionSignalNotifier,
        onEvent
      )
    }

    const pause = createPauseForAction(action)
    if (pause) {
      const event = createEvent(events, "task.paused", pause.message, {
        pause,
        stepNumber,
      })
      onEvent?.(event)
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
      )
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
    )
    onEvent?.(actionEvent)

    lastActionResult = await dispatchHostedRoutineAction(action, executor)
    const resultEvent = createEvent(
      events,
      "step.result",
      lastActionResult.message,
      { result: lastActionResult, stepNumber }
    )
    onEvent?.(resultEvent)
  }

  throw new Error(
    `Hosted routine action loop exceeded ${maxSteps} steps without finish.`
  )
}

async function completeHostedSession(
  session: CustomerSessionSnapshot,
  completionSignalNotifier: CompletionSignalNotifier | undefined,
  onEvent: ((event: CustomerTaskEvent) => void) | undefined
): Promise<CustomerSessionSnapshot> {
  const notifiedSession = await notifyTaskOutcome(
    session,
    completionSignalNotifier
  )
  for (const event of notifiedSession.events.slice(session.events.length)) {
    onEvent?.(event)
  }
  return notifiedSession
}

export function createPauseContinueActionResult(
  pause: CustomerTaskPause | null | undefined
): CustomerActionResult {
  if (!pause) {
    throw new Error("A paused task is required before continuing.")
  }

  return {
    status: "succeeded",
    action: pause.action._metadata === "do" ? pause.action.action : "finish",
    message:
      pause.action._metadata === "do"
        ? `User continued after ${pause.action.action}.`
        : "User continued.",
  }
}

export async function executeConfirmedPauseAction(
  pause: CustomerTaskPause | null | undefined,
  executor: RoutineActionExecutor
): Promise<CustomerActionResult> {
  if (
    !pause ||
    pause.status !== "confirmation_required" ||
    pause.action._metadata !== "do" ||
    pause.action.action !== "Tap"
  ) {
    throw new Error("A confirmation pause with a Tap action is required.")
  }

  await executor.tap(convertRelativePoint(pause.action.element, executor.screen))
  return {
    status: "succeeded",
    action: "Tap",
    message: "Tap completed.",
  }
}

export function stopPausedRoutineActionSession(
  session: CustomerSessionSnapshot
): CustomerSessionSnapshot {
  const events = [...session.events]
  createEvent(events, "task.stopped", "Task stopped by user.")
  return {
    ...session,
    task: {
      ...session.task,
      status: "stopped",
      summary: null,
    },
    events,
    pause: null,
  }
}

async function dispatchHostedRoutineAction(
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
    }
  }

  if (action.action === "Call_API") {
    normalizeRequiredString(action.instruction, "Call_API instruction")
    return {
      status: "unsupported",
      action: "Call_API",
      message:
        "Call_API is a runtime-local action and is not implemented by this hosted runtime.",
    }
  }

  try {
    await dispatchRoutineAction(action, executor)
    return {
      status: "succeeded",
      action: action.action,
      message: `${action.action} completed.`,
    }
  } catch (error) {
    return {
      status: "failed",
      action: action.action,
      message: describeUnknownError(error),
    }
  }
}

async function dispatchRoutineAction(
  action: ExecutableRoutineAction,
  executor: RoutineActionExecutor
): Promise<void> {
  if (action.action === "Tap") {
    await executor.tap(convertRelativePoint(action.element, executor.screen))
    return
  }

  if (action.action === "Double Tap") {
    await executor.doubleTap(convertRelativePoint(action.element, executor.screen))
    return
  }

  if (action.action === "Long Press") {
    await executor.longPress(convertRelativePoint(action.element, executor.screen))
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

function createPauseForAction(
  action: ExecutableRoutineAction
): CustomerTaskPause | null {
  if (action.action === "Take_over") {
    return {
      status: "takeover_required",
      action,
      message: action.message,
    }
  }

  if (action.action === "Interact") {
    return {
      status: "interaction_required",
      action,
      message: action.message ?? "User interaction required.",
    }
  }

  if (action.action === "Tap" && action.message) {
    return {
      status: "confirmation_required",
      action,
      message: action.message,
    }
  }

  return null
}

function assertRelativeCoordinate(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 1000) {
    throw new Error(`Relative coordinate must be between 0 and 1000: ${value}`)
  }
}

function describeUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
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
  events: CustomerTaskEvent[],
  options: {
    pause?: CustomerTaskPause | null
    nextStepNumber?: number
    lastActionResult?: CustomerActionResult | null
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
  }
}

function describeRoutineAction(action: ExecutableRoutineAction): string {
  if (action.action === "Tap") {
    return `Tap ${action.element.join(",")}`
  }

  if (action.action === "Double Tap" || action.action === "Long Press") {
    return `${action.action} ${action.element.join(",")}`
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

  if (action.action === "Note") {
    return `Note ${action.message.length} chars`
  }

  if (action.action === "Call_API") {
    return `Call_API ${action.instruction.length} chars`
  }

  return action.action
}
