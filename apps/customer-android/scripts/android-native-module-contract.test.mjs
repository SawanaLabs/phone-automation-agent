import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const RUN_HOSTED_TASK_REACT_METHOD = /@ReactMethod\s+fun runHostedTask\(/;
const CAPTURE_HANDLER_THREAD = /HandlerThread\("CustomerScreenCaptureThread"\)/;
const PROJECTION_REGISTER_CALLBACK_CAPTURE_HANDLER =
  /projection\.registerCallback\([\s\S]*captureHandler/;
const VIRTUAL_DISPLAY_CAPTURE_HANDLER =
  /createVirtualDisplay\([\s\S]*captureHandler/;
const CAPTURE_POLL_POST_DELAY =
  /captureHandler\.postDelayed\([\s\S]*SCREEN_CAPTURE_POLL_INTERVAL_MS/;
const SERVICE_CAPTURE_HANDLER_POST = /service\.captureHandler\.post/;
const IMAGE_AVAILABLE_LISTENER = /setOnImageAvailableListener/;
const MAIN_HANDLER_CAPTURE_FRAME =
  /service\.mainHandler\.post\s*\{\s*service\.captureCurrentFrame/;
const SCREEN_CAPTURE_TIMEOUT_MS = /SCREEN_CAPTURE_TIMEOUT_MS = (\d+)L/;
const ACTION_SETTLE_MS = /ACTION_SETTLE_MS = (\d+)L/;
const QUERIES_MAIN_ACTION =
  /<queries>[\s\S]*?<action android:name="android\.intent\.action\.MAIN"\/>[\s\S]*?<\/queries>/;
const QUERIES_LAUNCHER_CATEGORY =
  /<queries>[\s\S]*?<category android:name="android\.intent\.category\.LAUNCHER"\/>[\s\S]*?<\/queries>/;
const PAUSE_FIELD = /putMap\(\s*"pause"/;
const NEXT_STEP_NUMBER_FIELD = /putInt\(\s*"nextStepNumber"/;
const LAST_ACTION_RESULT_FIELD = /putMap\(\s*"lastActionResult"/;

describe("Android native module contract", () => {
  it("exports native hosted task loop so app-background actions keep running", async () => {
    const moduleSource = await readFile(
      new URL(
        "../android/app/src/main/java/com/sawanalabs/phoneautomation/customer/CustomerAutomationModule.kt",
        import.meta.url
      ),
      "utf8"
    );

    expect(moduleSource).toMatch(RUN_HOSTED_TASK_REACT_METHOD);
  });

  it("handles failed hosted outcomes before reading routine action names", async () => {
    const moduleSource = await readFile(
      new URL(
        "../android/app/src/main/java/com/sawanalabs/phoneautomation/customer/CustomerAutomationModule.kt",
        import.meta.url
      ),
      "utf8"
    );
    const failedOutcomeIndex = moduleSource.indexOf(
      'action.optString("_metadata") == "failed"'
    );
    const actionNameIndex = moduleSource.indexOf(
      'val actionName = action.getString("action")'
    );

    expect(failedOutcomeIndex).toBeGreaterThan(-1);
    expect(actionNameIndex).toBeGreaterThan(-1);
    expect(failedOutcomeIndex).toBeLessThan(actionNameIndex);
  });

  it("runs screen capture on a dedicated handler thread without continuous frame callbacks", async () => {
    const serviceSource = await readFile(
      new URL(
        "../android/app/src/main/java/com/sawanalabs/phoneautomation/customer/CustomerScreenCaptureService.kt",
        import.meta.url
      ),
      "utf8"
    );

    expect(serviceSource).toMatch(CAPTURE_HANDLER_THREAD);
    expect(serviceSource).toMatch(PROJECTION_REGISTER_CALLBACK_CAPTURE_HANDLER);
    expect(serviceSource).toMatch(VIRTUAL_DISPLAY_CAPTURE_HANDLER);
    expect(serviceSource).toMatch(CAPTURE_POLL_POST_DELAY);
    expect(serviceSource).toMatch(SERVICE_CAPTURE_HANDLER_POST);
    expect(serviceSource).not.toMatch(IMAGE_AVAILABLE_LISTENER);
    expect(serviceSource).not.toMatch(MAIN_HANDLER_CAPTURE_FRAME);
  });

  it("keeps hosted screen capture timeout long enough for app transitions", async () => {
    const moduleSource = await readFile(
      new URL(
        "../android/app/src/main/java/com/sawanalabs/phoneautomation/customer/CustomerAutomationModule.kt",
        import.meta.url
      ),
      "utf8"
    );
    const captureTimeout = Number(
      moduleSource.match(SCREEN_CAPTURE_TIMEOUT_MS)?.[1]
    );
    const actionSettle = Number(moduleSource.match(ACTION_SETTLE_MS)?.[1]);

    expect(captureTimeout).toBeGreaterThanOrEqual(5000);
    expect(captureTimeout).toBeGreaterThan(actionSettle * 5);
  });

  it("resolves Launch app targets by installed launcher label before failing", async () => {
    const moduleSource = await readFile(
      new URL(
        "../android/app/src/main/java/com/sawanalabs/phoneautomation/customer/CustomerAutomationModule.kt",
        import.meta.url
      ),
      "utf8"
    );

    expect(moduleSource).toContain("resolveLaunchIntentByLabel");
    expect(moduleSource).toContain("PackageManager.MATCH_DEFAULT_ONLY");
    expect(moduleSource).toContain("loadLabel(packageManager)");
  });

  it("declares launcher package visibility for installed app label lookup", async () => {
    const manifestSource = await readFile(
      new URL("../android/app/src/main/AndroidManifest.xml", import.meta.url),
      "utf8"
    );

    expect(manifestSource).toMatch(QUERIES_MAIN_ACTION);
    expect(manifestSource).toMatch(QUERIES_LAUNCHER_CATEGORY);
  });

  it("downscales screen captures before sending them to model providers", async () => {
    const serviceSource = await readFile(
      new URL(
        "../android/app/src/main/java/com/sawanalabs/phoneautomation/customer/CustomerScreenCaptureService.kt",
        import.meta.url
      ),
      "utf8"
    );

    expect(serviceSource).toContain("MAX_MODEL_IMAGE_SIDE = 2048");
    expect(serviceSource).toContain("Bitmap.createScaledBitmap");
  });

  it("returns pause continuation fields from the native hosted loop", async () => {
    const moduleSource = await readFile(
      new URL(
        "../android/app/src/main/java/com/sawanalabs/phoneautomation/customer/CustomerAutomationModule.kt",
        import.meta.url
      ),
      "utf8"
    );

    expect(moduleSource).toMatch(PAUSE_FIELD);
    expect(moduleSource).toMatch(NEXT_STEP_NUMBER_FIELD);
    expect(moduleSource).toMatch(LAST_ACTION_RESULT_FIELD);
    expect(moduleSource).toContain("jsonObjectToWritableMap(pauseAction)");
  });
});
