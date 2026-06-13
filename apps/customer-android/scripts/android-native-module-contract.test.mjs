import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

describe("Android native module contract", () => {
  it("exports native wait so background Wait actions do not depend on JS timers", async () => {
    const moduleSource = await readFile(
      new URL(
        "../android/app/src/main/java/com/sawanalabs/phoneautomation/customer/CustomerAutomationModule.kt",
        import.meta.url
      ),
      "utf8"
    )

    expect(moduleSource).toMatch(/@ReactMethod\s+fun wait\(/)
  })
})
