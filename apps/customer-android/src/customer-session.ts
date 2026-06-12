import type { DeviceAuthorityState } from "./device-authority"
import type { RoutineAction } from "./routine-actions"

export type CustomerTaskStatus =
  | "created"
  | "running"
  | "finished"
  | "failed"
  | "stopped"

export type CustomerTask = {
  id: string
  instruction: string
  status: CustomerTaskStatus
  summary: string | null
  error?: string | null
}

export type CustomerTaskEvent = {
  sequence: number
  type: string
  message: string | null
  payload?: Record<string, unknown>
}

export type CustomerSessionSnapshot = {
  task: CustomerTask
  events: CustomerTaskEvent[]
  actions?: RoutineAction[]
}

export type CustomerScreenState = {
  frameBase64: string
  frameMimeType: string
  width: number
  height: number
  currentPackage?: string | null
  accessibilitySummary?: string | null
}

export type CustomerActionResult = {
  status: "succeeded" | "failed"
  action: string
  message: string
}

export type CustomerActionDecision = {
  action: RoutineAction
}

export type StartCustomerTaskInput = {
  authorityState: DeviceAuthorityState
  runtimeUrl: string
  instruction: string
  fetchImpl?: typeof fetch
}

export type RequestNextCustomerActionInput = {
  runtimeUrl: string
  taskId: string
  instruction: string
  stepNumber: number
  screen: CustomerScreenState
  lastActionResult?: CustomerActionResult | null
  fetchImpl?: typeof fetch
}

export async function startCustomerTask({
  authorityState,
  runtimeUrl,
  instruction,
  fetchImpl = fetch,
}: StartCustomerTaskInput): Promise<CustomerSessionSnapshot> {
  if (!authorityState.canStartTask) {
    throw new Error(
      `Android permissions are required before starting a task: ${authorityState.missing.join(", ")}.`
    )
  }

  const normalizedInstruction = instruction.trim()
  if (!normalizedInstruction) {
    throw new Error("Instruction is required.")
  }

  let response: Response
  try {
    response = await fetchImpl(`${normalizeRuntimeUrl(runtimeUrl)}/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        instruction: normalizedInstruction,
        source: "customer-android",
      }),
    })
  } catch (error) {
    throw new Error(`Hosted runtime request failed: ${describeError(error)}`)
  }

  if (!response.ok) {
    throw new Error(await describeHttpError(response))
  }

  return response.json() as Promise<CustomerSessionSnapshot>
}

export async function requestNextCustomerAction({
  runtimeUrl,
  taskId,
  instruction,
  stepNumber,
  screen,
  lastActionResult = null,
  fetchImpl = fetch,
}: RequestNextCustomerActionInput): Promise<CustomerActionDecision> {
  const normalizedTaskId = taskId.trim()
  if (!normalizedTaskId) {
    throw new Error("Task id is required.")
  }

  const normalizedInstruction = instruction.trim()
  if (!normalizedInstruction) {
    throw new Error("Instruction is required.")
  }

  assertScreenState(screen)

  let response: Response
  try {
    response = await fetchImpl(
      `${normalizeRuntimeUrl(runtimeUrl)}/sessions/${encodeURIComponent(
        normalizedTaskId
      )}/steps`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          instruction: normalizedInstruction,
          source: "customer-android",
          stepNumber,
          screen,
          lastActionResult,
        }),
      }
    )
  } catch (error) {
    throw new Error(`Hosted runtime request failed: ${describeError(error)}`)
  }

  if (!response.ok) {
    throw new Error(await describeHttpError(response))
  }

  return response.json() as Promise<CustomerActionDecision>
}

function assertScreenState(screen: CustomerScreenState) {
  if (!screen.frameBase64.trim()) {
    throw new Error("Screen frame is required before requesting the next action.")
  }

  if (!Number.isFinite(screen.width) || screen.width <= 0) {
    throw new Error(`Screen width must be positive: ${screen.width}.`)
  }

  if (!Number.isFinite(screen.height) || screen.height <= 0) {
    throw new Error(`Screen height must be positive: ${screen.height}.`)
  }
}

function normalizeRuntimeUrl(value: string): string {
  const trimmed = value.trim()
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`
  return withScheme.replace(/\/+$/, "")
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

async function describeHttpError(response: Response): Promise<string> {
  const fallback = `Hosted runtime returned ${response.status}.`
  try {
    const body = (await response.json()) as { detail?: unknown }
    if (typeof body.detail === "string" && body.detail) {
      return body.detail
    }
  } catch {
    return fallback
  }

  return fallback
}
