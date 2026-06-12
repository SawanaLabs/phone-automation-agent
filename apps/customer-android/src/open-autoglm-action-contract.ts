import type { RelativePoint, RoutineAction } from "./routine-actions"

type RawActionObject = Record<string, unknown>

export function normalizeOpenAutoGlmAction(input: unknown): RoutineAction {
  const action = requireObject(input, "Open-AutoGLM action")

  if (action._metadata === "finish") {
    return {
      _metadata: "finish",
      message: requireTrimmedString(action.message, "Finish message"),
    }
  }

  const actionName = requireTrimmedString(action.action, "Action name")
  switch (actionName) {
    case "Launch":
      return {
        _metadata: "do",
        action: "Launch",
        app: requireTrimmedString(action.app, "Launch app"),
      }
    case "Tap":
      return withOptionalMessage(
        {
          _metadata: "do",
          action: "Tap",
          element: requireRelativePoint(action.element, "Tap element"),
        },
        action.message
      )
    case "Take_over":
      return {
        _metadata: "do",
        action: "Take_over",
        message: requireTrimmedString(action.message, "Take_over message"),
      }
    case "Interact":
      return withOptionalMessage(
        { _metadata: "do", action: "Interact" },
        action.message
      )
    case "Note":
      return {
        _metadata: "do",
        action: "Note",
        message: requireTrimmedString(action.message, "Note message"),
      }
    case "Call_API":
      return {
        _metadata: "do",
        action: "Call_API",
        instruction: requireTrimmedString(
          action.instruction,
          "Call_API instruction"
        ),
      }
    case "Type":
    case "Type_Name":
      return {
        _metadata: "do",
        action: "Type",
        text: requirePresentText(action.text, "Type text"),
      }
    case "Swipe":
      return {
        _metadata: "do",
        action: "Swipe",
        start: requireRelativePoint(action.start, "Swipe start"),
        end: requireRelativePoint(action.end, "Swipe end"),
      }
    case "Back":
      return { _metadata: "do", action: "Back" }
    case "Home":
      return { _metadata: "do", action: "Home" }
    case "Wait":
      return {
        _metadata: "do",
        action: "Wait",
        duration: normalizeWaitDuration(action.duration),
      }
    case "Double Tap":
      return {
        _metadata: "do",
        action: "Double Tap",
        element: requireRelativePoint(action.element, "Double Tap element"),
      }
    case "Long Press":
      return {
        _metadata: "do",
        action: "Long Press",
        element: requireRelativePoint(action.element, "Long Press element"),
      }
    default:
      throw new Error(`Unsupported Open-AutoGLM action: ${actionName}.`)
  }
}

function requireObject(value: unknown, label: string): RawActionObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`)
  }

  return value as RawActionObject
}

function requireTrimmedString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} is required.`)
  }

  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error(`${label} is required.`)
  }

  return trimmed
}

function requirePresentText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`)
  }

  return value
}

function withOptionalMessage<T extends object>(
  action: T,
  value: unknown
): T | (T & { message: string }) {
  if (value === undefined || value === null) {
    return action
  }

  return {
    ...action,
    message: requireTrimmedString(value, "Action message"),
  }
}

function requireRelativePoint(value: unknown, label: string): RelativePoint {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error(`${label} must be [x, y].`)
  }

  const [x, y] = value
  return [
    requireRelativeCoordinate(x, `${label} coordinate`),
    requireRelativeCoordinate(y, `${label} coordinate`),
  ]
}

function requireRelativeCoordinate(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`)
  }

  if (value < 0 || value > 1000) {
    throw new Error(`${label} must be between 0 and 1000: ${value}.`)
  }

  return value
}

function normalizeWaitDuration(value: unknown): string {
  if (value === undefined || value === null) {
    return "1 seconds"
  }

  const duration = requireTrimmedString(value, "Wait duration")
  const amount = Number.parseFloat(duration)
  if (!Number.isFinite(amount)) {
    throw new Error(`Invalid Wait duration: ${duration}.`)
  }

  if (amount <= 0) {
    throw new Error(`Wait duration must be positive: ${duration}.`)
  }

  return duration
}
