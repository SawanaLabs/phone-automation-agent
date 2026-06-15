import { describe, expect, it } from "vitest";

import {
  requestNextCustomerAction,
  startCustomerTask,
} from "./customer-session";
import { deriveDeviceAuthorityState } from "./device-authority";

const readyAuthorityState = deriveDeviceAuthorityState({
  accessibilityService: "enabled",
  screenCapture: "granted",
  notifications: "granted",
});

describe("customer hosted session", () => {
  it("starts a hosted session with the alpha bearer token and returns the terminal trace", async () => {
    const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      fetchCalls.push({ url: String(url), init });

      return new Response(
        JSON.stringify({
          task: {
            id: "customer_task_1",
            instruction: "打开小红书搜索咖啡店，停在结果页",
            status: "finished",
            summary: "已停在咖啡店搜索结果页",
          },
          events: [
            {
              sequence: 1,
              type: "task.started",
              message: "Task started.",
            },
            {
              sequence: 2,
              type: "task.finished",
              message: "已停在咖啡店搜索结果页",
            },
          ],
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }
      );
    };

    const session = await startCustomerTask({
      authorityState: readyAuthorityState,
      runtimeUrl: " http://localhost:8787/ ",
      runtimeAccessToken: " alpha-token ",
      instruction: " 打开小红书搜索咖啡店，停在结果页 ",
      fetchImpl,
    });

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]).toMatchObject({
      url: "http://localhost:8787/sessions",
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer alpha-token",
        },
        body: JSON.stringify({
          instruction: "打开小红书搜索咖啡店，停在结果页",
          source: "customer-android",
        }),
      },
    });
    expect(session.task.status).toBe("finished");
    expect(session.task.summary).toBe("已停在咖啡店搜索结果页");
    expect(session.events.map((event) => event.type)).toEqual([
      "task.started",
      "task.finished",
    ]);
  });

  it("throws before calling the runtime when the instruction is empty", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error("fetch should not be called");
    };

    await expect(
      startCustomerTask({
        authorityState: readyAuthorityState,
        runtimeUrl: "http://localhost:8787",
        runtimeAccessToken: "alpha-token",
        instruction: "   ",
        fetchImpl,
      })
    ).rejects.toThrow("Instruction is required.");
  });

  it("throws before calling the runtime when the alpha token is empty", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error("fetch should not be called");
    };

    await expect(
      startCustomerTask({
        authorityState: readyAuthorityState,
        runtimeUrl: "http://localhost:8787",
        runtimeAccessToken: "   ",
        instruction: "检查当前页面",
        fetchImpl,
      })
    ).rejects.toThrow("Runtime access token is required.");
  });

  it("describes network failures from the hosted runtime", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error("connection refused");
    };

    await expect(
      startCustomerTask({
        authorityState: readyAuthorityState,
        runtimeUrl: "http://localhost:8787",
        runtimeAccessToken: "alpha-token",
        instruction: "检查当前页面",
        fetchImpl,
      })
    ).rejects.toThrow("Hosted runtime request failed: connection refused");
  });

  it("uses runtime error details when the hosted runtime rejects the task", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          detail: "Hosted runtime is unavailable.",
        }),
        {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }
      );

    await expect(
      startCustomerTask({
        authorityState: readyAuthorityState,
        runtimeUrl: "http://localhost:8787",
        runtimeAccessToken: "alpha-token",
        instruction: "检查当前页面",
        fetchImpl,
      })
    ).rejects.toThrow("Hosted runtime is unavailable.");
  });

  it("rejects before calling the runtime when Android authority is missing", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error("fetch should not be called");
    };

    await expect(
      startCustomerTask({
        authorityState: deriveDeviceAuthorityState({
          accessibilityService: "disabled",
          screenCapture: "missing",
          notifications: "missing",
        }),
        runtimeUrl: "http://localhost:8787",
        runtimeAccessToken: "alpha-token",
        instruction: "检查当前页面",
        fetchImpl,
      })
    ).rejects.toThrow(
      "Android permissions are required before starting a task: accessibility_service, screen_capture, notifications."
    );
  });

  it("requests one hosted action with the latest screen state and last action result", async () => {
    const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      fetchCalls.push({ url: String(url), init });

      return new Response(
        JSON.stringify({
          action: {
            _metadata: "do",
            action: "Tap",
            element: [500, 250],
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    };

    const decision = await requestNextCustomerAction({
      runtimeUrl: "localhost:8787",
      runtimeAccessToken: "alpha-token",
      taskId: "customer_task_1",
      instruction: "检查当前页面",
      stepNumber: 2,
      screen: {
        frameBase64: "ZmFrZS1zY3JlZW4=",
        frameMimeType: "image/png",
        width: 1080,
        height: 2400,
        currentPackage: "com.android.settings",
        accessibilitySummary: "Button Settings",
      },
      lastActionResult: {
        status: "succeeded",
        action: "Launch",
        message: "Launch completed.",
      },
      fetchImpl,
    });

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]).toMatchObject({
      url: "http://localhost:8787/sessions/customer_task_1/steps",
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer alpha-token",
        },
        body: JSON.stringify({
          instruction: "检查当前页面",
          source: "customer-android",
          stepNumber: 2,
          screen: {
            frameBase64: "ZmFrZS1zY3JlZW4=",
            frameMimeType: "image/png",
            width: 1080,
            height: 2400,
            currentPackage: "com.android.settings",
            accessibilitySummary: "Button Settings",
          },
          lastActionResult: {
            status: "succeeded",
            action: "Launch",
            message: "Launch completed.",
          },
        }),
      },
    });
    expect(decision.action).toEqual({
      _metadata: "do",
      action: "Tap",
      element: [500, 250],
    });
  });

  it("normalizes the hosted runtime action before returning it", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          action: {
            _metadata: "do",
            action: "Type_Name",
            text: "Sawana",
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );

    const decision = await requestNextCustomerAction({
      runtimeUrl: "localhost:8787",
      runtimeAccessToken: "alpha-token",
      taskId: "customer_task_1",
      instruction: "输入姓名",
      stepNumber: 1,
      screen: {
        frameBase64: "ZmFrZS1zY3JlZW4=",
        frameMimeType: "image/png",
        width: 1080,
        height: 2400,
      },
      fetchImpl,
    });

    expect(decision.action).toEqual({
      _metadata: "do",
      action: "Type",
      text: "Sawana",
    });
  });

  it("rejects invalid hosted runtime actions", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          action: {
            _metadata: "do",
            action: "Scroll",
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );

    await expect(
      requestNextCustomerAction({
        runtimeUrl: "localhost:8787",
        runtimeAccessToken: "alpha-token",
        taskId: "customer_task_1",
        instruction: "检查当前页面",
        stepNumber: 1,
        screen: {
          frameBase64: "ZmFrZS1zY3JlZW4=",
          frameMimeType: "image/png",
          width: 1080,
          height: 2400,
        },
        fetchImpl,
      })
    ).rejects.toThrow("Unsupported Open-AutoGLM action: Scroll.");
  });

  it("rejects before calling the runtime when the screen frame is missing", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error("fetch should not be called");
    };

    await expect(
      requestNextCustomerAction({
        runtimeUrl: "http://localhost:8787",
        runtimeAccessToken: "alpha-token",
        taskId: "customer_task_1",
        instruction: "检查当前页面",
        stepNumber: 1,
        screen: {
          frameBase64: "   ",
          frameMimeType: "image/png",
          width: 1080,
          height: 2400,
        },
        fetchImpl,
      })
    ).rejects.toThrow(
      "Screen frame is required before requesting the next action."
    );
  });
});
