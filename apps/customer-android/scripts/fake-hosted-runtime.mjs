import http from "node:http";
import process from "node:process";

import {
  createHostedAgentRuntime,
  createModelProviderFromEnv,
} from "./hosted-agent-runtime.mjs";

const host = process.env.CUSTOMER_RUNTIME_HOST ?? "127.0.0.1";
const port = Number(process.env.CUSTOMER_RUNTIME_PORT ?? "8787");
const maxSteps = Number(process.env.CUSTOMER_RUNTIME_MAX_STEPS ?? "50");
const modelTimeoutMs = Number(
  process.env.CUSTOMER_RUNTIME_MODEL_TIMEOUT_MS ?? "30000"
);
const STEP_DECISION_PATH = /^\/sessions\/([^/]+)\/steps$/;

const runtime = createHostedAgentRuntime({
  maxSteps,
  modelTimeoutMs,
  modelProvider: createModelProviderFromEnv(process.env),
  logger(entry) {
    console.log(JSON.stringify(entry));
  },
});

const server = http.createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    respond(response, 204, null);
    return;
  }

  if (request.method === "GET" && request.url === "/debug/step-requests") {
    respond(response, 200, { requests: runtime.getDebugState().requests });
    return;
  }

  if (request.method === "GET" && request.url === "/debug/sessions") {
    respond(response, 200, { sessions: runtime.getDebugState().sessions });
    return;
  }

  if (request.method === "POST" && request.url === "/sessions") {
    await createSession(request, response);
    return;
  }

  const stepMatch = request.url?.match(STEP_DECISION_PATH);
  if (request.method === "POST" && stepMatch) {
    await createStepDecision(stepMatch[1], request, response);
    return;
  }

  respond(response, 404, { detail: "Endpoint not found." });
});

server.listen(port, host, () => {
  console.log(`Hosted agent runtime listening on http://${host}:${port}`);
});

async function createSession(request, response) {
  try {
    const body = JSON.parse(await readBody(request));
    const session = runtime.createSession({ instruction: body.instruction });
    respond(response, 201, session);
  } catch (error) {
    respond(response, 400, {
      detail: `Invalid request: ${describeError(error)}`,
    });
  }
}

async function createStepDecision(sessionId, request, response) {
  try {
    const body = JSON.parse(await readBody(request));
    const result = await runtime.createStepDecision(sessionId, body);
    respond(response, result.status, result.body);
  } catch (error) {
    respond(response, 400, {
      detail: `Invalid request: ${describeError(error)}`,
    });
  }
}

function respond(response, status, body) {
  response.writeHead(status, {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  });

  if (body === null) {
    response.end();
    return;
  }

  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      data += chunk;
    });
    request.on("end", () => resolve(data || "{}"));
    request.on("error", reject);
  });
}

function describeError(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
