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

  it("resolves Launch app targets by installed launcher label before failing", async () => {
    const moduleSource = await readFile(
      new URL(
        "../android/app/src/main/java/com/sawanalabs/phoneautomation/customer/CustomerAutomationModule.kt",
        import.meta.url
      ),
      "utf8"
    )

    expect(moduleSource).toContain("resolveLaunchIntentByLabel")
    expect(moduleSource).toContain("PackageManager.MATCH_DEFAULT_ONLY")
    expect(moduleSource).toContain("loadLabel(packageManager)")
  })

  it("declares launcher package visibility for installed app label lookup", async () => {
    const manifestSource = await readFile(
      new URL("../android/app/src/main/AndroidManifest.xml", import.meta.url),
      "utf8"
    )

    expect(manifestSource).toMatch(
      /<queries>[\s\S]*?<action android:name="android\.intent\.action\.MAIN"\/>[\s\S]*?<\/queries>/
    )
    expect(manifestSource).toMatch(
      /<queries>[\s\S]*?<category android:name="android\.intent\.category\.LAUNCHER"\/>[\s\S]*?<\/queries>/
    )
  })

  it("downscales screen captures before sending them to model providers", async () => {
    const serviceSource = await readFile(
      new URL(
        "../android/app/src/main/java/com/sawanalabs/phoneautomation/customer/CustomerScreenCaptureService.kt",
        import.meta.url
      ),
      "utf8"
    )

    expect(serviceSource).toContain("MAX_MODEL_IMAGE_SIDE = 2048")
    expect(serviceSource).toContain("Bitmap.createScaledBitmap")
  })

  it("returns pause continuation fields from the native hosted loop", async () => {
    const moduleSource = await readFile(
      new URL(
        "../android/app/src/main/java/com/sawanalabs/phoneautomation/customer/CustomerAutomationModule.kt",
        import.meta.url
      ),
      "utf8"
    )

    expect(moduleSource).toMatch(/putMap\(\s*"pause"/)
    expect(moduleSource).toMatch(/putInt\(\s*"nextStepNumber"/)
    expect(moduleSource).toMatch(/putMap\(\s*"lastActionResult"/)
    expect(moduleSource).toContain("jsonObjectToWritableMap(pauseAction)")
  })
})
