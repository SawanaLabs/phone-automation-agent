import type { DeviceAuthorityState } from "./device-authority";
import { normalizeOpenAutoGlmAction } from "./open-autoglm-action-contract";
import type { RoutineAction } from "./routine-actions";

export type CustomerTaskStatus =
  | "created"
  | "running"
  | "finished"
  | "failed"
  | "stopped"
  | "takeover_required"
  | "interaction_required"
  | "confirmation_required";

export interface CustomerTask {
  error?: string | null;
  id: string;
  instruction: string;
  status: CustomerTaskStatus;
  summary: string | null;
}

export interface CustomerTaskEvent {
  message: string | null;
  payload?: Record<string, unknown>;
  sequence: number;
  type: string;
}

export interface CustomerSessionSnapshot {
  actions?: RoutineAction[];
  events: CustomerTaskEvent[];
  lastActionResult?: CustomerActionResult | null;
  nextStepNumber?: number;
  pause?: CustomerTaskPause | null;
  task: CustomerTask;
}

export interface CustomerScreenState {
  accessibilitySummary?: string | null;
  currentPackage?: string | null;
  frameBase64: string;
  frameMimeType: string;
  height: number;
  width: number;
}

export interface CustomerActionResult {
  action: string;
  message: string;
  status: "succeeded" | "failed" | "unsupported";
}

export interface CustomerTaskPause {
  action: RoutineAction;
  message: string;
  status: Extract<
    CustomerTaskStatus,
    "takeover_required" | "interaction_required" | "confirmation_required"
  >;
}

export interface CustomerActionDecision {
  action: RoutineAction;
}

export interface StartCustomerTaskInput {
  authorityState: DeviceAuthorityState;
  fetchImpl?: typeof fetch;
  instruction: string;
  runtimeAccessToken: string;
  runtimeUrl: string;
}

export interface RequestNextCustomerActionInput {
  fetchImpl?: typeof fetch;
  instruction: string;
  lastActionResult?: CustomerActionResult | null;
  runtimeAccessToken: string;
  runtimeUrl: string;
  screen: CustomerScreenState;
  stepNumber: number;
  taskId: string;
}

const HTTP_SCHEME_PATTERN = /^https?:\/\//i;
const TRAILING_SLASHES_PATTERN = /\/+$/;

export async function startCustomerTask({
  authorityState,
  runtimeUrl,
  runtimeAccessToken,
  instruction,
  fetchImpl = fetch,
}: StartCustomerTaskInput): Promise<CustomerSessionSnapshot> {
  if (!authorityState.canStartTask) {
    throw new Error(
      `Android permissions are required before starting a task: ${authorityState.missing.join(", ")}.`
    );
  }

  const normalizedInstruction = instruction.trim();
  if (!normalizedInstruction) {
    throw new Error("Instruction is required.");
  }
  const normalizedRuntimeAccessToken =
    normalizeRuntimeAccessToken(runtimeAccessToken);

  let response: Response;
  try {
    response = await fetchImpl(`${normalizeRuntimeUrl(runtimeUrl)}/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${normalizedRuntimeAccessToken}`,
      },
      body: JSON.stringify({
        instruction: normalizedInstruction,
        source: "customer-android",
      }),
    });
  } catch (error) {
    throw new Error(`Hosted runtime request failed: ${describeError(error)}`);
  }

  if (!response.ok) {
    throw new Error(await describeHttpError(response));
  }

  return response.json() as Promise<CustomerSessionSnapshot>;
}

export async function requestNextCustomerAction({
  runtimeUrl,
  runtimeAccessToken,
  taskId,
  instruction,
  stepNumber,
  screen,
  lastActionResult = null,
  fetchImpl = fetch,
}: RequestNextCustomerActionInput): Promise<CustomerActionDecision> {
  const normalizedTaskId = taskId.trim();
  if (!normalizedTaskId) {
    throw new Error("Task id is required.");
  }

  const normalizedInstruction = instruction.trim();
  if (!normalizedInstruction) {
    throw new Error("Instruction is required.");
  }

  const normalizedRuntimeAccessToken =
    normalizeRuntimeAccessToken(runtimeAccessToken);
  assertScreenState(screen);

  let response: Response;
  try {
    response = await fetchImpl(
      `${normalizeRuntimeUrl(runtimeUrl)}/sessions/${encodeURIComponent(
        normalizedTaskId
      )}/steps`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${normalizedRuntimeAccessToken}`,
        },
        body: JSON.stringify({
          instruction: normalizedInstruction,
          source: "customer-android",
          stepNumber,
          screen,
          lastActionResult,
        }),
      }
    );
  } catch (error) {
    throw new Error(`Hosted runtime request failed: ${describeError(error)}`);
  }

  if (!response.ok) {
    throw new Error(await describeHttpError(response));
  }

  const body = (await response.json()) as { action?: unknown };
  return {
    action: normalizeOpenAutoGlmAction(body.action),
  };
}

function assertScreenState(screen: CustomerScreenState) {
  if (!screen.frameBase64.trim()) {
    throw new Error(
      "Screen frame is required before requesting the next action."
    );
  }

  if (!Number.isFinite(screen.width) || screen.width <= 0) {
    throw new Error(`Screen width must be positive: ${screen.width}.`);
  }

  if (!Number.isFinite(screen.height) || screen.height <= 0) {
    throw new Error(`Screen height must be positive: ${screen.height}.`);
  }
}

function normalizeRuntimeUrl(value: string): string {
  const trimmed = value.trim();
  const withScheme = HTTP_SCHEME_PATTERN.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;
  return withScheme.replace(TRAILING_SLASHES_PATTERN, "");
}

function normalizeRuntimeAccessToken(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Runtime access token is required.");
  }

  return trimmed;
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

async function describeHttpError(response: Response): Promise<string> {
  const fallback = `Hosted runtime returned ${response.status}.`;
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string" && body.detail) {
      return body.detail;
    }
  } catch {
    return fallback;
  }

  return fallback;
}
