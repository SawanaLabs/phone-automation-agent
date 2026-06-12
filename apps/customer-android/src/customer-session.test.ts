import { describe, expect, it } from "vitest"

import { startCustomerTask } from "./customer-session"

describe("customer hosted session", () => {
  it("starts a hosted session and returns the terminal trace", async () => {
    const fetchCalls: Array<{ url: string; init?: RequestInit }> = []
    const fetchImpl: typeof fetch = async (url, init) => {
      fetchCalls.push({ url: String(url), init })

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
      )
    }

    const session = await startCustomerTask({
      runtimeUrl: " http://localhost:8787/ ",
      instruction: " 打开小红书搜索咖啡店，停在结果页 ",
      fetchImpl,
    })

    expect(fetchCalls).toHaveLength(1)
    expect(fetchCalls[0]).toMatchObject({
      url: "http://localhost:8787/sessions",
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          instruction: "打开小红书搜索咖啡店，停在结果页",
          source: "customer-android",
        }),
      },
    })
    expect(session.task.status).toBe("finished")
    expect(session.task.summary).toBe("已停在咖啡店搜索结果页")
    expect(session.events.map((event) => event.type)).toEqual([
      "task.started",
      "task.finished",
    ])
  })

  it("throws before calling the runtime when the instruction is empty", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error("fetch should not be called")
    }

    await expect(
      startCustomerTask({
        runtimeUrl: "http://localhost:8787",
        instruction: "   ",
        fetchImpl,
      })
    ).rejects.toThrow("Instruction is required.")
  })

  it("describes network failures from the hosted runtime", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error("connection refused")
    }

    await expect(
      startCustomerTask({
        runtimeUrl: "http://localhost:8787",
        instruction: "检查当前页面",
        fetchImpl,
      })
    ).rejects.toThrow("Hosted runtime request failed: connection refused")
  })

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
      )

    await expect(
      startCustomerTask({
        runtimeUrl: "http://localhost:8787",
        instruction: "检查当前页面",
        fetchImpl,
      })
    ).rejects.toThrow("Hosted runtime is unavailable.")
  })
})
