export function createHostedAgentRuntime({
  modelProvider,
  maxSteps = 50,
  modelTimeoutMs = 30_000,
  now = () => Date.now(),
  logger = () => {},
}) {
  const sessions = new Map()
  const stepRequests = []

  return {
    createSession({ instruction }) {
      const normalizedInstruction = normalizeRequiredString(
        instruction,
        "Instruction"
      )
      const taskId = `customer_task_${now()}`
      const session = {
        task: {
          id: taskId,
          instruction: normalizedInstruction,
          status: "running",
          summary: null,
          error: null,
        },
        events: [],
        completedSteps: 0,
      }
      appendEvent(session, "task.started", "Task started.")
      sessions.set(taskId, session)
      return createSessionSnapshot(session)
    },

    async createStepDecision(sessionId, body) {
      const session = sessions.get(sessionId)
      if (!session) {
        return createStandaloneFailure(
          404,
          "SESSION_NOT_FOUND",
          "Session not found."
        )
      }

      const validationError = validateStepRequest(body)
      if (validationError) {
        return failSession(session, 400, "INVALID_STEP_REQUEST", validationError)
      }

      const requestSnapshot = createStepRequestSnapshot(sessionId, body)
      stepRequests.push(requestSnapshot)
      logger({ type: "step.request", ...requestSnapshot })
      appendEvent(session, "step.received", `Received step ${body.stepNumber}.`, {
        request: requestSnapshot,
      })

      if (session.completedSteps >= maxSteps) {
        return failSession(
          session,
          409,
          "MAX_STEPS_EXCEEDED",
          `Hosted runtime exceeded max steps: ${maxSteps}.`
        )
      }

      const prompt = createPrompt({
        instruction: session.task.instruction,
        stepNumber: body.stepNumber,
        screen: body.screen,
        lastActionResult: body.lastActionResult ?? null,
      })

      let modelOutput
      try {
        modelOutput = await withTimeout(
          modelProvider.complete({
            prompt,
            instruction: session.task.instruction,
            stepNumber: body.stepNumber,
            screen: body.screen,
            lastActionResult: body.lastActionResult ?? null,
            session: createSessionSnapshot(session),
          }),
          modelTimeoutMs
        )
      } catch (error) {
        if (error instanceof ModelTimeoutError) {
          return failSession(session, 504, "MODEL_TIMEOUT", error.message)
        }

        return failSession(
          session,
          502,
          "MODEL_PROVIDER_FAILED",
          `Model provider failed: ${describeError(error)}`
        )
      }

      appendEvent(session, "model.output", String(modelOutput), {
        stepNumber: body.stepNumber,
      })

      let action
      try {
        action = parseOpenAutoGlmActionText(modelOutput)
      } catch (error) {
        return failSession(session, 422, "INVALID_MODEL_OUTPUT", "Invalid model output.", {
          cause: describeError(error),
          output: String(modelOutput),
        })
      }

      session.completedSteps += 1
      appendEvent(session, "step.decision", describeAction(action), {
        stepNumber: body.stepNumber,
        action,
      })

      if (action._metadata === "finish") {
        session.task.status = "finished"
        session.task.summary = action.message
        appendEvent(session, "task.finished", action.message)
      }

      return {
        ok: true,
        status: 200,
        body: {
          action,
          events: session.events,
        },
      }
    },

    getDebugState() {
      return {
        requests: stepRequests,
        sessions: Array.from(sessions.values()).map(createSessionSnapshot),
      }
    },
  }
}

export function createModelProviderFromEnv(env, { fetchImpl = fetch } = {}) {
  const provider = env.CUSTOMER_RUNTIME_MODEL_PROVIDER ?? "scripted"
  if (provider === "scripted") {
    return createScriptedModelProvider({
      scenario: env.CUSTOMER_RUNTIME_SCENARIO ?? "routine-basic",
    })
  }

  if (provider === "openai-compatible") {
    const baseUrl = normalizeRequiredString(
      env.CUSTOMER_RUNTIME_MODEL_BASE_URL,
      "CUSTOMER_RUNTIME_MODEL_BASE_URL"
    )
    const model = normalizeRequiredString(
      env.CUSTOMER_RUNTIME_MODEL_NAME,
      "CUSTOMER_RUNTIME_MODEL_NAME"
    )
    const apiKey = requireModelApiKey(env.CUSTOMER_RUNTIME_MODEL_API_KEY)
    if (isPlaceholderSecret(apiKey)) {
      throw new Error("CUSTOMER_RUNTIME_MODEL_API_KEY is still a placeholder.")
    }

    return {
      async complete({ prompt }) {
        const response = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
            temperature: 0,
          }),
        })

        if (!response.ok) {
          throw new Error(`provider returned ${response.status}`)
        }

        const body = await response.json()
        const content = body?.choices?.[0]?.message?.content
        if (typeof content !== "string" || !content.trim()) {
          throw new Error("provider response did not include message content")
        }

        return content
      },
    }
  }

  throw new Error(`Unsupported CUSTOMER_RUNTIME_MODEL_PROVIDER: ${provider}`)
}

export function createScriptedModelProvider({ scenario = "routine-basic" } = {}) {
  const supportedScenarios = new Set([
    "routine-basic",
    "launch-type",
    "routine-contract",
  ])
  if (!supportedScenarios.has(scenario)) {
    throw new Error(`Unsupported CUSTOMER_RUNTIME_SCENARIO: ${scenario}`)
  }

  return {
    async complete({ instruction, stepNumber }) {
      return actionAtStep(stepNumber, createScenarioOutputs(scenario, instruction))
    },
  }
}

export function parseOpenAutoGlmActionText(output) {
  if (typeof output !== "string") {
    throw new Error("Model output must be a string.")
  }

  const invocation = extractActionInvocation(output)
  const match = invocation.match(/^(do|finish)\((.*)\)$/s)
  if (!match) {
    throw new Error("Model output must contain do(...) or finish(...).")
  }

  const kind = match[1]
  const args = parseNamedArguments(match[2])
  if (kind === "finish") {
    return {
      _metadata: "finish",
      message: normalizeRequiredString(args.message, "Finish message"),
    }
  }

  return normalizeRoutineAction(args)
}

function normalizeRoutineAction(args) {
  const actionName = normalizeRequiredString(args.action, "Action name")
  switch (actionName) {
    case "Launch":
      return {
        _metadata: "do",
        action: "Launch",
        app: normalizeRequiredString(args.app, "Launch app"),
      }
    case "Tap":
      return {
        _metadata: "do",
        action: "Tap",
        element: requireRelativePoint(args.element, "Tap element"),
      }
    case "Type":
    case "Type_Name":
      return {
        _metadata: "do",
        action: "Type",
        text: requireText(args.text, "Type text"),
      }
    case "Swipe":
      return {
        _metadata: "do",
        action: "Swipe",
        start: requireRelativePoint(args.start, "Swipe start"),
        end: requireRelativePoint(args.end, "Swipe end"),
      }
    case "Back":
      return { _metadata: "do", action: "Back" }
    case "Home":
      return { _metadata: "do", action: "Home" }
    case "Wait":
      return {
        _metadata: "do",
        action: "Wait",
        duration: normalizeWaitDuration(args.duration),
      }
    case "Double Tap":
      return {
        _metadata: "do",
        action: "Double Tap",
        element: requireRelativePoint(args.element, "Double Tap element"),
      }
    case "Long Press":
      return {
        _metadata: "do",
        action: "Long Press",
        element: requireRelativePoint(args.element, "Long Press element"),
      }
    default:
      throw new Error(`Unsupported Open-AutoGLM action: ${actionName}.`)
  }
}

function extractActionInvocation(output) {
  const cleaned = output.trim().replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim()
  const lines = cleaned.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const invocation = [...lines]
    .reverse()
    .find((line) => line.startsWith("do(") || line.startsWith("finish("))
  if (!invocation) {
    throw new Error("Model output must contain do(...) or finish(...).")
  }

  return invocation
}

function parseNamedArguments(input) {
  const args = {}
  for (const part of splitTopLevel(input)) {
    const separatorIndex = part.indexOf("=")
    if (separatorIndex <= 0) {
      throw new Error(`Invalid argument: ${part}`)
    }

    const key = part.slice(0, separatorIndex).trim()
    const value = part.slice(separatorIndex + 1).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error(`Invalid argument name: ${key}`)
    }
    args[key] = parseValue(value)
  }

  return args
}

function splitTopLevel(input) {
  const parts = []
  let current = ""
  let quote = null
  let bracketDepth = 0

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    const previous = input[index - 1]
    if (quote) {
      current += char
      if (char === quote && previous !== "\\") {
        quote = null
      }
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      current += char
      continue
    }

    if (char === "[") {
      bracketDepth += 1
      current += char
      continue
    }

    if (char === "]") {
      bracketDepth -= 1
      current += char
      continue
    }

    if (char === "," && bracketDepth === 0) {
      parts.push(current.trim())
      current = ""
      continue
    }

    current += char
  }

  if (current.trim()) {
    parts.push(current.trim())
  }

  return parts
}

function parseValue(value) {
  if (value.startsWith('"')) {
    return JSON.parse(value)
  }

  if (value.startsWith("'")) {
    return value.slice(1, -1).replace(/\\'/g, "'")
  }

  if (value.startsWith("[") && value.endsWith("]")) {
    const body = value.slice(1, -1).trim()
    if (!body) {
      return []
    }
    return body.split(",").map((part) => Number(part.trim()))
  }

  if (value === "True") {
    return true
  }

  if (value === "False") {
    return false
  }

  const number = Number(value)
  if (Number.isFinite(number)) {
    return number
  }

  return value
}

function createPrompt({ instruction, stepNumber, screen, lastActionResult }) {
  return [
    "You are an Open-AutoGLM-style phone automation agent.",
    "Return exactly one do(...) action or finish(message=\"...\").",
    `Instruction: ${instruction}`,
    `Step: ${stepNumber}`,
    `Screen: ${screen.width}x${screen.height} ${screen.frameMimeType}`,
    `Current package: ${screen.currentPackage ?? "unknown"}`,
    `Accessibility summary: ${screen.accessibilitySummary ?? "unavailable"}`,
    `Last action result: ${lastActionResult ? JSON.stringify(lastActionResult) : "none"}`,
  ].join("\n")
}

function validateStepRequest(body) {
  if (!body || typeof body !== "object") {
    return "Step request body is required."
  }

  const instruction =
    typeof body.instruction === "string" ? body.instruction.trim() : ""
  if (!instruction) {
    return "Instruction is required."
  }

  if (!Number.isInteger(body.stepNumber) || body.stepNumber < 1) {
    return "Step number must be a positive integer."
  }

  if (!body.screen || typeof body.screen !== "object") {
    return "Screen state is required."
  }

  if (
    typeof body.screen.frameBase64 !== "string" ||
    body.screen.frameBase64.trim() === ""
  ) {
    return "Screen frame is required."
  }

  if (!Number.isFinite(body.screen.width) || body.screen.width <= 0) {
    return "Screen width must be positive."
  }

  if (!Number.isFinite(body.screen.height) || body.screen.height <= 0) {
    return "Screen height must be positive."
  }

  return null
}

function createStepRequestSnapshot(sessionId, body) {
  return {
    sessionId,
    instruction: body.instruction,
    stepNumber: body.stepNumber,
    screen: {
      frameMimeType: body.screen.frameMimeType,
      frameBytes: body.screen.frameBase64.length,
      width: body.screen.width,
      height: body.screen.height,
      currentPackage: body.screen.currentPackage ?? null,
      accessibilitySummary: body.screen.accessibilitySummary ?? null,
    },
    lastActionResult: body.lastActionResult ?? null,
  }
}

function failSession(session, status, code, message, payload = {}) {
  session.task.status = "failed"
  session.task.error = message
  appendEvent(session, "task.failed", message, { code, ...payload })
  return {
    ok: false,
    status,
    body: {
      detail: message,
      error: {
        code,
        message,
      },
      events: session.events,
    },
  }
}

function createStandaloneFailure(status, code, message) {
  return {
    ok: false,
    status,
    body: {
      detail: message,
      error: {
        code,
        message,
      },
      events: [],
    },
  }
}

function appendEvent(session, type, message, payload = {}) {
  const event = {
    sequence: session.events.length + 1,
    type,
    message,
    payload,
  }
  session.events.push(event)
  return event
}

function createSessionSnapshot(session) {
  return {
    task: { ...session.task },
    events: [...session.events],
  }
}

function describeAction(action) {
  if (action._metadata === "finish") {
    return action.message
  }

  return action.action
}

function normalizeRequiredString(value, label) {
  if (typeof value !== "string") {
    throw new Error(`${label} is required.`)
  }

  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error(`${label} is required.`)
  }

  return trimmed
}

function requireModelApiKey(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(
      "CUSTOMER_RUNTIME_MODEL_API_KEY is required for openai-compatible runtime provider."
    )
  }

  return value.trim()
}

function requireText(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`)
  }

  return value
}

function requireRelativePoint(value, label) {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error(`${label} must be [x, y].`)
  }

  return [
    requireRelativeCoordinate(value[0], `${label} coordinate`),
    requireRelativeCoordinate(value[1], `${label} coordinate`),
  ]
}

function requireRelativeCoordinate(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`)
  }

  if (value < 0 || value > 1000) {
    throw new Error(`${label} must be between 0 and 1000: ${value}.`)
  }

  return value
}

function normalizeWaitDuration(value) {
  if (value === undefined || value === null) {
    return "1 seconds"
  }

  const duration = normalizeRequiredString(value, "Wait duration")
  const amount = Number.parseFloat(duration)
  if (!Number.isFinite(amount)) {
    throw new Error(`Invalid Wait duration: ${duration}.`)
  }

  if (amount <= 0) {
    throw new Error(`Wait duration must be positive: ${duration}.`)
  }

  return duration
}

function isPlaceholderSecret(value) {
  const normalized = value.trim().toLowerCase()
  return ["change_me", "your-api-key", "placeholder", "todo"].includes(normalized)
}

function createScenarioOutputs(scenario, instruction) {
  if (scenario === "launch-type") {
    return [
      'do(action="Launch", app="com.sawanalabs.phoneautomation.customer")',
      'do(action="Tap", element=[500,820])',
      'do(action="Type", text="coffee shop")',
      'do(action="Type_Name", text="Sawana Customer")',
      'do(action="Wait", duration="1 seconds")',
      `finish(message="Finished hosted launch and text-entry customer task: ${instruction}")`,
    ]
  }

  if (scenario === "routine-contract") {
    return [
      'do(action="Launch", app="com.sawanalabs.phoneautomation.customer")',
      'do(action="Tap", element=[500,500])',
      'do(action="Type", text="coffee shop")',
      'do(action="Type_Name", text="Sawana")',
      'do(action="Swipe", start=[500,800], end=[500,200])',
      'do(action="Double Tap", element=[500,500])',
      'do(action="Long Press", element=[500,500])',
      'do(action="Back")',
      'do(action="Home")',
      'do(action="Wait", duration="1 seconds")',
      `finish(message="Finished hosted routine contract customer task: ${instruction}")`,
    ]
  }

  return [
    'do(action="Tap", element=[500,500])',
    'do(action="Swipe", start=[500,800], end=[500,200])',
    'do(action="Back")',
    'do(action="Home")',
    'do(action="Wait", duration="3 seconds")',
    `finish(message="Finished hosted decision customer task: ${instruction}")`,
  ]
}

function actionAtStep(stepNumber, actions) {
  return actions[Math.min(stepNumber - 1, actions.length - 1)]
}

async function withTimeout(promise, timeoutMs) {
  let timeoutId
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new ModelTimeoutError(timeoutMs))
        }, timeoutMs)
      }),
    ])
  } finally {
    clearTimeout(timeoutId)
  }
}

function describeError(error) {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

class ModelTimeoutError extends Error {
  constructor(timeoutMs) {
    super(`Model provider timed out after ${timeoutMs}ms.`)
  }
}
