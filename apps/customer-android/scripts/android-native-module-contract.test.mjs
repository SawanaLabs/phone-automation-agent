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

  it("runs screen capture callbacks on a dedicated handler thread", async () => {
    const serviceSource = await readFile(
      new URL(
        "../android/app/src/main/java/com/sawanalabs/phoneautomation/customer/CustomerScreenCaptureService.kt",
        import.meta.url
      ),
      "utf8"
    )

    expect(serviceSource).toMatch(/HandlerThread\("CustomerScreenCaptureThread"\)/)
    expect(serviceSource).toMatch(/projection\.registerCallback\([\s\S]*captureHandler/)
    expect(serviceSource).toMatch(/setOnImageAvailableListener\([\s\S]*captureHandler/)
    expect(serviceSource).toMatch(/createVirtualDisplay\([\s\S]*captureHandler/)
    expect(serviceSource).toMatch(/service\.captureHandler\.post/)
    expect(serviceSource).not.toMatch(/service\.mainHandler\.post\s*\{\s*service\.captureCurrentFrame/)
  })
})
