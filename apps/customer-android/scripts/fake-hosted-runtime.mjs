import http from "node:http"
import process from "node:process"

const host = process.env.CUSTOMER_RUNTIME_HOST ?? "127.0.0.1"
const port = Number(process.env.CUSTOMER_RUNTIME_PORT ?? "8787")
const scenario = process.env.CUSTOMER_RUNTIME_SCENARIO ?? "routine-basic"
const supportedScenarios = new Set(["routine-basic", "launch-type"])

if (!supportedScenarios.has(scenario)) {
  throw new Error(`Unsupported CUSTOMER_RUNTIME_SCENARIO: ${scenario}`)
}

const server = http.createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    respond(response, 204, null)
    return
  }

  if (request.method !== "POST" || request.url !== "/sessions") {
    respond(response, 404, { detail: "Endpoint not found." })
    return
  }

  try {
    const body = JSON.parse(await readBody(request))
    const instruction =
      typeof body.instruction === "string" ? body.instruction.trim() : ""

    if (!instruction) {
      respond(response, 400, { detail: "Instruction is required." })
      return
    }

    respond(response, 201, {
      task: {
        id: `customer_task_${Date.now()}`,
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
      actions: createScenarioActions(instruction),
    })
  } catch (error) {
    respond(response, 400, { detail: `Invalid request: ${error}` })
  }
})

server.listen(port, host, () => {
  console.log(`Fake hosted runtime listening on http://${host}:${port}`)
})

function respond(response, status, body) {
  response.writeHead(status, {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  })

  if (body === null) {
    response.end()
    return
  }

  response.end(JSON.stringify(body))
}

function createScenarioActions(instruction) {
  if (scenario === "launch-type") {
    return [
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
        message: `Finished launch and text-entry customer task: ${instruction}`,
      },
    ]
  }

  return [
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
      message: `Finished scripted customer task: ${instruction}`,
    },
  ]
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
