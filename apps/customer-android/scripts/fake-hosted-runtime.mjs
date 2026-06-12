import http from "node:http"
import process from "node:process"

const host = process.env.CUSTOMER_RUNTIME_HOST ?? "127.0.0.1"
const port = Number(process.env.CUSTOMER_RUNTIME_PORT ?? "8787")

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
        status: "finished",
        summary: `Finished scripted customer task: ${instruction}`,
        error: null,
      },
      events: [
        {
          sequence: 1,
          type: "task.started",
          message: "Task started.",
          payload: {},
        },
        {
          sequence: 2,
          type: "task.finished",
          message: `Finished scripted customer task: ${instruction}`,
          payload: {
            scripted: true,
          },
        },
      ],
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
