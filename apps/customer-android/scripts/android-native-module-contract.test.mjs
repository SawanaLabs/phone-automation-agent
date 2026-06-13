import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

describe("Android native module contract", () => {
  it("exports native hosted task loop so app-background actions keep running", async () => {
    const moduleSource = await readFile(
      new URL(
        "../android/app/src/main/java/com/sawanalabs/phoneautomation/customer/CustomerAutomationModule.kt",
        import.meta.url
      ),
      "utf8"
    )

    expect(moduleSource).toMatch(/@ReactMethod\s+fun runHostedTask\(/)
  })
})
