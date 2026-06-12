import type { DeviceAuthorityState } from "./device-authority"

export type CustomerTaskStatus = "created" | "running" | "finished" | "failed"

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
}

export type StartCustomerTaskInput = {
  authorityState: DeviceAuthorityState
  runtimeUrl: string
  instruction: string
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
