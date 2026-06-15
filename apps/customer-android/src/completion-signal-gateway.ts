import { NativeModules, Platform } from "react-native";

import type { CompletionSignalNotifier } from "./completion-signal";
import {
  createNativeCompletionSignalNotifier,
  requireCustomerAutomationNativeModule,
} from "./native-customer-automation";

export function createCompletionSignalNotifier(): CompletionSignalNotifier {
  if (Platform.OS === "web") {
    return createDevelopmentCompletionSignalNotifier();
  }

  return createNativeCompletionSignalNotifier(
    requireCustomerAutomationNativeModule(NativeModules)
  );
}

function createDevelopmentCompletionSignalNotifier(): CompletionSignalNotifier {
  return {
    notifyTaskOutcome(session) {
      return Promise.resolve({
        status: "delivered",
        message: `Completion signal recorded: ${session.task.status}.`,
      });
    },
  };
}
