import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const RUN_HOSTED_TASK_REACT_METHOD = /@ReactMethod\s+fun runHostedTask\(/;
const STOP_HOSTED_TASK_REACT_METHOD = /@ReactMethod\s+fun stopHostedTask\(/;
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
const PRIVATE_RUN_HOSTED_TASK_LOOP = /private fun runHostedTaskLoop\(/;
const NATIVE_HOSTED_TASK_LOOP_CLASS = /class NativeHostedTaskLoop\(/;
const NATIVE_HOSTED_RUNTIME_CLIENT_PORT = /interface NativeHostedRuntimeClient/;
const NATIVE_HOSTED_CANCELLATION_PORT =
  /interface NativeHostedTaskCancellation/;
const NATIVE_HOSTED_STOP_CHECKS =
  /cancellation\.shouldStop\(\)[\s\S]*screenStateCollector\.capture\(\)[\s\S]*cancellation\.shouldStop\(\)[\s\S]*runtimeClient\.requestStep[\s\S]*cancellation\.shouldStop\(\)[\s\S]*actionExecutor\.dispatch/;
const RUN_HOSTED_TASK_RESUME_PARAM = /resumeStateJson: String\?/;
const NATIVE_HOSTED_RESUME_PARSER = /object NativeHostedTaskResumeStateParser/;
const NATIVE_HOSTED_INPUT_RESUME_FIELDS =
  /initialEvents: List<NativeTaskEvent>[\s\S]*initialStepNumber: Int[\s\S]*approvedPauseAction: JSONObject\?/;
const NATIVE_ROUTINE_ACTION_EXECUTOR_CLASS =
  /class NativeRoutineActionExecutor\(/;
const PRIVATE_NATIVE_ROUTINE_DISPATCH =
  /private fun dispatchRoutineActionNative\(/;

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

  it("exposes a native hosted stop seam for running Android loops", async () => {
    const moduleSource = await readFile(
      new URL(
        "../android/app/src/main/java/com/sawanalabs/phoneautomation/customer/CustomerAutomationModule.kt",
        import.meta.url
      ),
      "utf8"
    );
    const loopSource = await readFile(
      new URL(
        "../android/app/src/main/java/com/sawanalabs/phoneautomation/customer/NativeHostedTaskLoop.kt",
        import.meta.url
      ),
      "utf8"
    );

    expect(moduleSource).toMatch(STOP_HOSTED_TASK_REACT_METHOD);
    expect(moduleSource).toContain("activeHostedTaskCancellation");
    expect(loopSource).toMatch(NATIVE_HOSTED_CANCELLATION_PORT);
    expect(loopSource).toMatch(NATIVE_HOSTED_STOP_CHECKS);
  });

  it("accepts native hosted resume state through a named parser", async () => {
    const moduleSource = await readFile(
      new URL(
        "../android/app/src/main/java/com/sawanalabs/phoneautomation/customer/CustomerAutomationModule.kt",
        import.meta.url
      ),
      "utf8"
    );
    const loopSource = await readFile(
      new URL(
        "../android/app/src/main/java/com/sawanalabs/phoneautomation/customer/NativeHostedTaskLoop.kt",
        import.meta.url
      ),
      "utf8"
    );
    const resumeSource = await readFile(
      new URL(
        "../android/app/src/main/java/com/sawanalabs/phoneautomation/customer/NativeHostedTaskResumeState.kt",
        import.meta.url
      ),
      "utf8"
    );

    expect(moduleSource).toMatch(RUN_HOSTED_TASK_RESUME_PARAM);
    expect(loopSource).toMatch(NATIVE_HOSTED_INPUT_RESUME_FIELDS);
    expect(resumeSource).toMatch(NATIVE_HOSTED_RESUME_PARSER);
    expect(resumeSource).toContain("allow_confirmed_action");
    expect(resumeSource).toContain("initialLastActionResult");
  });

  it("keeps the hosted task loop outside the React Native bridge module", async () => {
    const moduleSource = await readFile(
      new URL(
        "../android/app/src/main/java/com/sawanalabs/phoneautomation/customer/CustomerAutomationModule.kt",
        import.meta.url
      ),
      "utf8"
    );
    const loopSource = await readFile(
      new URL(
        "../android/app/src/main/java/com/sawanalabs/phoneautomation/customer/NativeHostedTaskLoop.kt",
        import.meta.url
      ),
      "utf8"
    );

    expect(moduleSource).not.toMatch(PRIVATE_RUN_HOSTED_TASK_LOOP);
    expect(loopSource).toMatch(NATIVE_HOSTED_TASK_LOOP_CLASS);
    expect(loopSource).toMatch(NATIVE_HOSTED_RUNTIME_CLIENT_PORT);
  });

  it("handles failed hosted outcomes before reading routine action names", async () => {
    const loopSource = await readFile(
      new URL(
        "../android/app/src/main/java/com/sawanalabs/phoneautomation/customer/NativeHostedTaskLoop.kt",
        import.meta.url
      ),
      "utf8"
    );
    const failedOutcomeIndex = loopSource.indexOf(
      'action.optString("_metadata") == "failed"'
    );
    const actionDispatchIndex = loopSource.indexOf(
      "actionExecutor.dispatch(action)"
    );

    expect(failedOutcomeIndex).toBeGreaterThan(-1);
    expect(actionDispatchIndex).toBeGreaterThan(-1);
    expect(failedOutcomeIndex).toBeLessThan(actionDispatchIndex);
  });

  it("keeps native routine action dispatch outside the React Native bridge module", async () => {
    const moduleSource = await readFile(
      new URL(
        "../android/app/src/main/java/com/sawanalabs/phoneautomation/customer/CustomerAutomationModule.kt",
        import.meta.url
      ),
      "utf8"
    );
    const executorSource = await readFile(
      new URL(
        "../android/app/src/main/java/com/sawanalabs/phoneautomation/customer/NativeRoutineActionExecutor.kt",
        import.meta.url
      ),
      "utf8"
    );

    expect(moduleSource).not.toMatch(PRIVATE_NATIVE_ROUTINE_DISPATCH);
    expect(executorSource).toMatch(NATIVE_ROUTINE_ACTION_EXECUTOR_CLASS);
    expect(executorSource).toContain("NativeHostedActionExecutor");
    expect(executorSource).toContain("Call_API is a runtime-local action");
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
    const actionExecutorSource = await readFile(
      new URL(
        "../android/app/src/main/java/com/sawanalabs/phoneautomation/customer/NativeRoutineActionExecutor.kt",
        import.meta.url
      ),
      "utf8"
    );
    const actionSettle = Number(
      actionExecutorSource.match(ACTION_SETTLE_MS)?.[1]
    );

    expect(captureTimeout).toBeGreaterThanOrEqual(5000);
    expect(captureTimeout).toBeGreaterThan(actionSettle * 5);
  });

  it("resolves Launch app targets by installed launcher label before failing", async () => {
    const actionExecutorSource = await readFile(
      new URL(
        "../android/app/src/main/java/com/sawanalabs/phoneautomation/customer/NativeRoutineActionExecutor.kt",
        import.meta.url
      ),
      "utf8"
    );

    expect(actionExecutorSource).toContain("resolveLaunchIntentByLabel");
    expect(actionExecutorSource).toContain("PackageManager.MATCH_DEFAULT_ONLY");
    expect(actionExecutorSource).toContain("loadLabel(packageManager)");
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
    const mapperSource = await readFile(
      new URL(
        "../android/app/src/main/java/com/sawanalabs/phoneautomation/customer/NativeSessionSnapshotMapper.kt",
        import.meta.url
      ),
      "utf8"
    );

    expect(mapperSource).toMatch(PAUSE_FIELD);
    expect(mapperSource).toMatch(NEXT_STEP_NUMBER_FIELD);
    expect(mapperSource).toMatch(LAST_ACTION_RESULT_FIELD);
    expect(mapperSource).toContain("jsonObjectToWritableMap(pauseAction)");
  });
});
