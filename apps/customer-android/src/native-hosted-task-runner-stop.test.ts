import { describe, expect, it } from "vitest";
import type { CustomerAutomationNativeModule } from "./native-customer-automation";
import { createNativeHostedTaskRunner } from "./native-customer-automation";

describe("native hosted task runner stop", () => {
  it("requests the native Android loop to stop running hosted tasks", async () => {
    const calls: string[] = [];
    const runner = createNativeHostedTaskRunner(
      createNativeModuleStub({
        async stopHostedTask() {
          calls.push("stop-hosted-task");
        },
      })
    );

    await runner.stopRunningTask();

    expect(calls).toEqual(["stop-hosted-task"]);
  });
});

function createNativeModuleStub(
  overrides: Partial<CustomerAutomationNativeModule>
): CustomerAutomationNativeModule {
  return {
    async back() {},
    async captureScreenState() {
      throw new Error("captureScreenState is not used by this test.");
    },
    async doubleTap() {},
    async getAuthoritySnapshot() {
      throw new Error("getAuthoritySnapshot is not used by this test.");
    },
    async home() {},
    async launchApp() {},
    async longPress() {},
    async openAccessibilitySettings() {
      throw new Error("openAccessibilitySettings is not used by this test.");
    },
    async requestNotifications() {
      throw new Error("requestNotifications is not used by this test.");
    },
    async requestScreenCapture() {
      throw new Error("requestScreenCapture is not used by this test.");
    },
    async runHostedTask() {
      throw new Error("runHostedTask is not used by this test.");
    },
    async showCompletionSignal() {
      throw new Error("showCompletionSignal is not used by this test.");
    },
    async stopHostedTask() {},
    async swipe() {},
    async tap() {},
    async typeText() {},
    async wait() {},
    ...overrides,
  };
}
