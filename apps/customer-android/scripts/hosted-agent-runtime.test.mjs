import { describe, expect, it } from "vitest";

import {
  createHostedAgentRuntime,
  createModelProviderFromEnv,
  parseOpenAutoGlmActionText,
} from "./hosted-agent-runtime.mjs";

const screen = {
  frameBase64: "ZmFrZS1zY3JlZW4=",
  frameMimeType: "image/png",
  width: 1080,
  height: 2400,
  currentPackage: "com.android.settings",
  accessibilitySummary: "android.widget.TextView text=Settings",
};

describe("hosted agent runtime", () => {
  it("parses Open-AutoGLM-style model output into normalized actions", () => {
    expect(
      parseOpenAutoGlmActionText('do(action="Tap", element=[500,250])')
    ).toEqual({
      _metadata: "do",
      action: "Tap",
      element: [500, 250],
    });

    expect(
      parseOpenAutoGlmActionText(
        'do(action="Tap", element=[500,250], message="确认点击提交按钮")'
      )
    ).toEqual({
      _metadata: "do",
      action: "Tap",
      element: [500, 250],
      message: "确认点击提交按钮",
    });

    expect(
      parseOpenAutoGlmActionText(
        'do(action="Take_over", message="请先完成登录")'
      )
    ).toEqual({
      _metadata: "do",
      action: "Take_over",
      message: "请先完成登录",
    });

    expect(
      parseOpenAutoGlmActionText(
        'do(action="Interact", message="请选择目标项目")'
      )
    ).toEqual({
      _metadata: "do",
      action: "Interact",
      message: "请选择目标项目",
    });

    expect(
      parseOpenAutoGlmActionText(
        'do(action="Note", message="页面显示三条结果")'
      )
    ).toEqual({
      _metadata: "do",
      action: "Note",
      message: "页面显示三条结果",
    });

    expect(
      parseOpenAutoGlmActionText(
        'do(action="Call_API", instruction="总结当前页面")'
      )
    ).toEqual({
      _metadata: "do",
      action: "Call_API",
      instruction: "总结当前页面",
    });

    expect(
      parseOpenAutoGlmActionText(
        'do(action="Swipe", start=[500,800], end=[500,200])'
      )
    ).toEqual({
      _metadata: "do",
      action: "Swipe",
      start: [500, 800],
      end: [500, 200],
    });

    expect(parseOpenAutoGlmActionText('finish(message="done")')).toEqual({
      _metadata: "finish",
      message: "done",
    });
  });

  it("calls the configured model path with phone state and returns one action", async () => {
    const modelCalls = [];
    const runtime = createHostedAgentRuntime({
      modelProvider: {
        async complete(input) {
          modelCalls.push(input);
          return 'do(action="Tap", element=[500,250])';
        },
      },
    });
    const session = runtime.createSession({ instruction: "检查设置页面" });

    const result = await runtime.createStepDecision(session.task.id, {
      instruction: "检查设置页面",
      stepNumber: 1,
      screen,
      lastActionResult: null,
    });

    expect(result).toMatchObject({
      ok: true,
      status: 200,
      body: {
        action: {
          _metadata: "do",
          action: "Tap",
          element: [500, 250],
        },
      },
    });
    expect(modelCalls).toHaveLength(1);
    expect(modelCalls[0]).toMatchObject({
      instruction: "检查设置页面",
      stepNumber: 1,
      screen,
    });
    expect(modelCalls[0].prompt).toContain(
      "Current package: com.android.settings"
    );
  });

  it("provides a scripted settings-return acceptance scenario", async () => {
    const provider = createModelProviderFromEnv({
      CUSTOMER_RUNTIME_MODEL_PROVIDER: "scripted",
      CUSTOMER_RUNTIME_SCENARIO: "settings-return",
    });

    await expect(provider.complete({ stepNumber: 1 })).resolves.toBe(
      'do(action="Launch", app="com.android.settings")'
    );
    await expect(provider.complete({ stepNumber: 2 })).resolves.toBe(
      'do(action="Wait", duration="1 seconds")'
    );
    await expect(provider.complete({ stepNumber: 3 })).resolves.toBe(
      'do(action="Back")'
    );
    await expect(
      provider.complete({ stepNumber: 4, instruction: "打开设置后返回" })
    ).resolves.toBe(
      'finish(message="Finished settings return customer task: 打开设置后返回")'
    );
  });

  it("returns a terminal finish response from model output", async () => {
    const runtime = createHostedAgentRuntime({
      modelProvider: {
        async complete() {
          return 'finish(message="done")';
        },
      },
    });
    const session = runtime.createSession({ instruction: "结束任务" });

    const result = await runtime.createStepDecision(session.task.id, {
      instruction: "结束任务",
      stepNumber: 1,
      screen,
      lastActionResult: null,
    });

    expect(result).toMatchObject({
      ok: true,
      status: 200,
      body: {
        action: {
          _metadata: "finish",
          message: "done",
        },
      },
    });
  });

  it("normalizes invalid model output into a failed task response", async () => {
    const runtime = createHostedAgentRuntime({
      modelProvider: {
        async complete() {
          return "tap the middle";
        },
      },
    });
    const session = runtime.createSession({ instruction: "检查设置页面" });

    const result = await runtime.createStepDecision(session.task.id, {
      instruction: "检查设置页面",
      stepNumber: 1,
      screen,
      lastActionResult: null,
    });

    expect(result).toMatchObject({
      ok: false,
      status: 422,
      body: {
        detail: "Invalid model output.",
        error: {
          code: "INVALID_MODEL_OUTPUT",
          message: "Invalid model output.",
        },
      },
    });
    expect(result.body.events.at(-1)).toMatchObject({
      type: "task.failed",
      message: "Invalid model output.",
    });
  });

  it("normalizes provider failures", async () => {
    const runtime = createHostedAgentRuntime({
      modelProvider: {
        async complete() {
          throw new Error("provider unavailable");
        },
      },
    });
    const session = runtime.createSession({ instruction: "检查设置页面" });

    const result = await runtime.createStepDecision(session.task.id, {
      instruction: "检查设置页面",
      stepNumber: 1,
      screen,
      lastActionResult: null,
    });

    expect(result).toMatchObject({
      ok: false,
      status: 502,
      body: {
        detail: "Model provider failed: provider unavailable",
        error: {
          code: "MODEL_PROVIDER_FAILED",
        },
      },
    });
  });

  it("normalizes model timeout", async () => {
    const runtime = createHostedAgentRuntime({
      modelTimeoutMs: 5,
      modelProvider: {
        async complete() {
          return new Promise(() => {});
        },
      },
    });
    const session = runtime.createSession({ instruction: "检查设置页面" });

    const result = await runtime.createStepDecision(session.task.id, {
      instruction: "检查设置页面",
      stepNumber: 1,
      screen,
      lastActionResult: null,
    });

    expect(result).toMatchObject({
      ok: false,
      status: 504,
      body: {
        detail: "Model provider timed out after 5ms.",
        error: {
          code: "MODEL_TIMEOUT",
        },
      },
    });
  });

  it("enforces max steps before calling the model", async () => {
    let modelCalls = 0;
    const runtime = createHostedAgentRuntime({
      maxSteps: 1,
      modelProvider: {
        async complete() {
          modelCalls += 1;
          return 'do(action="Tap", element=[500,250])';
        },
      },
    });
    const session = runtime.createSession({ instruction: "检查设置页面" });

    await runtime.createStepDecision(session.task.id, {
      instruction: "检查设置页面",
      stepNumber: 1,
      screen,
      lastActionResult: null,
    });
    const result = await runtime.createStepDecision(session.task.id, {
      instruction: "检查设置页面",
      stepNumber: 2,
      screen,
      lastActionResult: {
        status: "succeeded",
        action: "Tap",
        message: "Tap completed.",
      },
    });

    expect(modelCalls).toBe(1);
    expect(result).toMatchObject({
      ok: false,
      status: 409,
      body: {
        detail: "Hosted runtime exceeded max steps: 1.",
        error: {
          code: "MAX_STEPS_EXCEEDED",
        },
      },
    });
  });

  it("fails early for missing or placeholder server-side model credentials", () => {
    expect(() =>
      createModelProviderFromEnv({
        CUSTOMER_RUNTIME_MODEL_PROVIDER: "openai-compatible",
        CUSTOMER_RUNTIME_MODEL_BASE_URL: "https://example.com/v1",
        CUSTOMER_RUNTIME_MODEL_NAME: "autoglm-phone",
      })
    ).toThrow(
      "CUSTOMER_RUNTIME_MODEL_API_KEY is required for openai-compatible runtime provider."
    );

    expect(() =>
      createModelProviderFromEnv({
        CUSTOMER_RUNTIME_MODEL_PROVIDER: "openai-compatible",
        CUSTOMER_RUNTIME_MODEL_BASE_URL: "https://example.com/v1",
        CUSTOMER_RUNTIME_MODEL_NAME: "autoglm-phone",
        CUSTOMER_RUNTIME_MODEL_API_KEY: "CHANGE_ME",
      })
    ).toThrow("CUSTOMER_RUNTIME_MODEL_API_KEY is still a placeholder.");
  });
});
