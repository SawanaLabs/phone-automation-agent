import http from "node:http"
import process from "node:process"

const host = process.env.CUSTOMER_RUNTIME_HOST ?? "127.0.0.1"
const port = Number(process.env.CUSTOMER_RUNTIME_PORT ?? "8787")
const scenario = process.env.CUSTOMER_RUNTIME_SCENARIO ?? "routine-basic"
const supportedScenarios = new Set([
  "routine-basic",
  "launch-type",
  "routine-contract",
])
const sessions = new Map()
const stepRequests = []

if (!supportedScenarios.has(scenario)) {
  throw new Error(`Unsupported CUSTOMER_RUNTIME_SCENARIO: ${scenario}`)
}

const server = http.createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    respond(response, 204, null)
    return
  }

  if (request.method === "GET" && request.url === "/debug/step-requests") {
    respond(response, 200, { requests: stepRequests })
    return
  }

  if (request.method === "POST" && request.url === "/sessions") {
    await createSession(request, response)
    return
  }

  const stepMatch = request.url?.match(/^\/sessions\/([^/]+)\/steps$/)
  if (request.method === "POST" && stepMatch) {
    await createStepDecision(stepMatch[1], request, response)
    return
  }

  {
    respond(response, 404, { detail: "Endpoint not found." })
    return
  }
})

server.listen(port, host, () => {
  console.log(`Fake hosted runtime listening on http://${host}:${port}`)
})

async function createSession(request, response) {
  try {
    const body = JSON.parse(await readBody(request))
    const instruction =
      typeof body.instruction === "string" ? body.instruction.trim() : ""

    if (!instruction) {
      respond(response, 400, { detail: "Instruction is required." })
      return
    }

    const taskId = `customer_task_${Date.now()}`
    sessions.set(taskId, { instruction })

    respond(response, 201, {
      task: {
        id: taskId,
        instruction,
        status: "running",
        summary: null,
        error: null,
      },
      events: [
        {
          sequence: 1,
          type: "task.started",
          message: "Task started.",
          payload: {},
        },
      ],
    })
  } catch (error) {
    respond(response, 400, { detail: `Invalid request: ${error}` })
  }
}

async function createStepDecision(sessionId, request, response) {
  if (!sessions.has(sessionId)) {
    respond(response, 404, { detail: "Session not found." })
    return
  }

  try {
    const body = JSON.parse(await readBody(request))
    const validationError = validateStepRequest(body)
    if (validationError) {
      respond(response, 400, { detail: validationError })
      return
    }

    const requestSnapshot = {
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
    stepRequests.push(requestSnapshot)
    console.log(JSON.stringify({ type: "step.request", ...requestSnapshot }))

    respond(response, 200, {
      action: createScenarioAction(body.instruction, body.stepNumber),
    })
  } catch (error) {
    respond(response, 400, { detail: `Invalid request: ${error}` })
  }
}

function respond(response, status, body) {
  response.writeHead(status, {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  })

  if (body === null) {
    response.end()
    return
  }

  response.end(JSON.stringify(body))
}

function validateStepRequest(body) {
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

function createScenarioAction(instruction, stepNumber) {
  if (scenario === "launch-type") {
    return actionAtStep(stepNumber, [
      {
        _metadata: "do",
        action: "Launch",
        app: "com.sawanalabs.phoneautomation.customer",
      },
      { _metadata: "do", action: "Tap", element: [500, 820] },
      { _metadata: "do", action: "Type", text: "coffee shop" },
      { _metadata: "do", action: "Type_Name", text: "Sawana Customer" },
      { _metadata: "do", action: "Wait", duration: "1 seconds" },
      {
        _metadata: "finish",
        message: `Finished hosted launch and text-entry customer task: ${instruction}`,
      },
    ])
  }

  if (scenario === "routine-contract") {
    return actionAtStep(stepNumber, [
      {
        _metadata: "do",
        action: "Launch",
        app: "com.sawanalabs.phoneautomation.customer",
      },
      { _metadata: "do", action: "Tap", element: [500, 500] },
      { _metadata: "do", action: "Type", text: "coffee shop" },
      { _metadata: "do", action: "Type_Name", text: "Sawana" },
      {
        _metadata: "do",
        action: "Swipe",
        start: [500, 800],
        end: [500, 200],
      },
      { _metadata: "do", action: "Double Tap", element: [500, 500] },
      { _metadata: "do", action: "Long Press", element: [500, 500] },
      { _metadata: "do", action: "Back" },
      { _metadata: "do", action: "Home" },
      { _metadata: "do", action: "Wait", duration: "1 seconds" },
      {
        _metadata: "finish",
        message: `Finished hosted routine contract customer task: ${instruction}`,
      },
    ])
  }

  return actionAtStep(stepNumber, [
    { _metadata: "do", action: "Tap", element: [500, 500] },
    {
      _metadata: "do",
      action: "Swipe",
      start: [500, 800],
      end: [500, 200],
    },
    { _metadata: "do", action: "Back" },
    { _metadata: "do", action: "Home" },
    { _metadata: "do", action: "Wait", duration: "3 seconds" },
    {
      _metadata: "finish",
      message: `Finished hosted decision customer task: ${instruction}`,
    },
  ])
}

function actionAtStep(stepNumber, actions) {
  return actions[Math.min(stepNumber - 1, actions.length - 1)]
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let data = ""
    request.setEncoding("utf8")
    request.on("data", (chunk) => {
      data += chunk
    })
    request.on("end", () => resolve(data || "{}"))
    request.on("error", reject)
  })
}
