export type TaskStatus =
  | "created"
  | "running"
  | "finished"
  | "failed"
  | "confirmation_required"
  | "takeover_required"

export type TaskRecord = {
  id: string
  instruction: string
  source: "mobile"
  status: TaskStatus
  summary: string | null
  error: string | null
  created_at: string
  updated_at: string
}

export type TaskEvent = {
  sequence: number
  task_id: string
  type: string
  message: string | null
  payload: Record<string, unknown>
  created_at: string
}

export type DeviceRecord = {
  id: string
  kind: "android"
  status: "available" | "unavailable"
  label: string | null
  detail: string | null
}

export type WorkerSnapshot = {
  task: TaskRecord
  events: TaskEvent[]
}

export function normalizeWorkerUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error("Worker URL is required.")
  }

  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`
  return withScheme.replace(/\/+$/, "")
}

export async function checkWorker(workerUrl: string): Promise<DeviceRecord[]> {
  const baseUrl = normalizeWorkerUrl(workerUrl)
  await requestJson<{ status: string }>(`${baseUrl}/healthz`)
  const devices = await requestJson<{ devices: DeviceRecord[] }>(
    `${baseUrl}/devices`
  )
  return devices.devices
}

export async function createTask(
  workerUrl: string,
  instruction: string
): Promise<TaskRecord> {
  const baseUrl = normalizeWorkerUrl(workerUrl)
  const normalizedInstruction = instruction.trim()
  if (!normalizedInstruction) {
    throw new Error("Instruction is required.")
  }

  return requestJson<TaskRecord>(`${baseUrl}/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      instruction: normalizedInstruction,
      source: "mobile",
    }),
  })
}

export async function getTaskSnapshot(
  workerUrl: string,
  taskId: string
): Promise<WorkerSnapshot> {
  const baseUrl = normalizeWorkerUrl(workerUrl)
  const [task, eventResponse] = await Promise.all([
    requestJson<TaskRecord>(`${baseUrl}/tasks/${taskId}`),
    requestJson<{ events: TaskEvent[] }>(`${baseUrl}/tasks/${taskId}/events`),
  ])

  return {
    task,
    events: eventResponse.events,
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, init)
  } catch (error) {
    throw new Error(`Worker request failed: ${describeError(error)}`)
  }

  if (!response.ok) {
    throw new Error(await describeHttpError(response))
  }

  return response.json() as Promise<T>
}

async function describeHttpError(response: Response): Promise<string> {
  const fallback = `Worker returned ${response.status}.`
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

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}
