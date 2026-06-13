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

  it("handles failed hosted outcomes before reading routine action names", async () => {
    const moduleSource = await readFile(
      new URL(
        "../android/app/src/main/java/com/sawanalabs/phoneautomation/customer/CustomerAutomationModule.kt",
        import.meta.url
      ),
      "utf8"
    )
    const failedOutcomeIndex = moduleSource.indexOf(
      'action.optString("_metadata") == "failed"'
    )
    const actionNameIndex = moduleSource.indexOf(
      'val actionName = action.getString("action")'
    )

    expect(failedOutcomeIndex).toBeGreaterThan(-1)
    expect(actionNameIndex).toBeGreaterThan(-1)
    expect(failedOutcomeIndex).toBeLessThan(actionNameIndex)
  })

  it("runs screen capture on a dedicated handler thread without continuous frame callbacks", async () => {
    const serviceSource = await readFile(
      new URL(
        "../android/app/src/main/java/com/sawanalabs/phoneautomation/customer/CustomerScreenCaptureService.kt",
        import.meta.url
      ),
      "utf8"
    )

    expect(serviceSource).toMatch(/HandlerThread\("CustomerScreenCaptureThread"\)/)
    expect(serviceSource).toMatch(/projection\.registerCallback\([\s\S]*captureHandler/)
    expect(serviceSource).toMatch(/createVirtualDisplay\([\s\S]*captureHandler/)
    expect(serviceSource).toMatch(/captureHandler\.postDelayed\([\s\S]*SCREEN_CAPTURE_POLL_INTERVAL_MS/)
    expect(serviceSource).toMatch(/service\.captureHandler\.post/)
    expect(serviceSource).not.toMatch(/setOnImageAvailableListener/)
    expect(serviceSource).not.toMatch(/service\.mainHandler\.post\s*\{\s*service\.captureCurrentFrame/)
  })
})
