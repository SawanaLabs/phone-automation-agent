import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  NativeModules,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { createCompletionSignalNotifier } from "./src/completion-signal-gateway";
import {
  ResultPanel,
  RuntimePanel,
  SetupPanel,
  TaskPanel,
  TracePanel,
} from "./src/customer-app-panels";
import type { CustomerSessionSnapshot } from "./src/customer-session";
import { createCustomerTaskRunController } from "./src/customer-task-run-controller";
import {
  type DeviceAuthoritySnapshot,
  deriveDeviceAuthorityState,
} from "./src/device-authority";
import { createDeviceAuthorityGateway } from "./src/device-authority-gateway";
import {
  createNativeHostedTaskRunner,
  requireCustomerAutomationNativeModule,
} from "./src/native-customer-automation";
import { createRoutineActionExecutor } from "./src/routine-action-executor-gateway";
import { createScreenStateCollector } from "./src/screen-state-gateway";
import { styles } from "./src/styles";
import { describeError, visibleTraceEvents } from "./src/task-state";

const DEFAULT_RUNTIME_URL =
  process.env.EXPO_PUBLIC_CUSTOMER_RUNTIME_URL ?? "http://localhost:8787";
const DEFAULT_RUNTIME_ACCESS_TOKEN =
  process.env.EXPO_PUBLIC_CUSTOMER_RUNTIME_ACCESS_TOKEN ?? "";
const DEFAULT_INSTRUCTION = "打开小红书搜索咖啡店，停在结果页";
const DEFAULT_AUTHORITY_SNAPSHOT: DeviceAuthoritySnapshot = {
  accessibilityService: "disabled",
  screenCapture: "missing",
  notifications: "missing",
};
const authorityGateway = createDeviceAuthorityGateway();
const simulateScreenCaptureLoss = authorityGateway.simulateScreenCaptureLoss;
const routineActionExecutor = createRoutineActionExecutor();
const screenStateCollector = createScreenStateCollector();
const completionSignalNotifier = createCompletionSignalNotifier();
const nativeHostedTaskRunner =
  Platform.OS === "web"
    ? null
    : createNativeHostedTaskRunner(
        requireCustomerAutomationNativeModule(NativeModules)
      );

export default function App() {
  const [runtimeUrl, setRuntimeUrl] = useState(DEFAULT_RUNTIME_URL);
  const [runtimeAccessToken, setRuntimeAccessToken] = useState(
    DEFAULT_RUNTIME_ACCESS_TOKEN
  );
  const [instruction, setInstruction] = useState(DEFAULT_INSTRUCTION);
  const [session, setSession] = useState<CustomerSessionSnapshot | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTaskLoopRunning, setIsTaskLoopRunning] = useState(false);
  const [authoritySnapshot, setAuthoritySnapshot] = useState(
    DEFAULT_AUTHORITY_SNAPSHOT
  );
  const [authorityState, setAuthorityState] = useState(() =>
    deriveDeviceAuthorityState(DEFAULT_AUTHORITY_SNAPSHOT)
  );

  const traceEvents = useMemo(
    () => visibleTraceEvents(session?.events ?? []),
    [session]
  );
  const taskRunInput = useMemo(
    () => ({
      authorityState,
      runtimeUrl,
      runtimeAccessToken,
      instruction,
    }),
    [authorityState, runtimeUrl, runtimeAccessToken, instruction]
  );
  const taskRunController = useMemo(
    () =>
      createCustomerTaskRunController({
        completionSignalNotifier,
        nativeHostedTaskRunner,
        routineActionExecutor,
        screenStateCollector,
        sink: {
          setErrorMessage,
          setIsSubmitting,
          setIsTaskLoopRunning,
          setSession,
          updateSession(updater) {
            setSession((currentSession) => updater(currentSession));
          },
        },
      }),
    []
  );

  const applyAuthoritySnapshot = useCallback(
    (snapshot: DeviceAuthoritySnapshot) => {
      setAuthoritySnapshot(snapshot);
      setAuthorityState((previousState) =>
        deriveDeviceAuthorityState(snapshot, previousState.status)
      );
    },
    []
  );

  useEffect(() => {
    let isMounted = true;

    async function loadAuthoritySnapshot() {
      try {
        const snapshot = await authorityGateway.getSnapshot();
        if (isMounted) {
          applyAuthoritySnapshot(snapshot);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(describeError(error));
        }
      }
    }

    loadAuthoritySnapshot();

    return () => {
      isMounted = false;
    };
  }, [applyAuthoritySnapshot]);

  async function applyAuthorityRequest(
    request: () => Promise<DeviceAuthoritySnapshot>
  ) {
    setErrorMessage(null);
    try {
      applyAuthoritySnapshot(await request());
    } catch (error) {
      setErrorMessage(describeError(error));
    }
  }

  return (
    <View style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboard}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.eyebrow}>Hosted Agent Runtime</Text>
            <Text style={styles.title}>Customer Phone Agent</Text>
          </View>
          <SetupPanel
            authoritySnapshot={authoritySnapshot}
            authorityState={authorityState}
            onOpenAccessibilitySettings={() =>
              applyAuthorityRequest(() =>
                authorityGateway.openAccessibilitySettings()
              )
            }
            onRefreshAuthority={() =>
              applyAuthorityRequest(() => authorityGateway.getSnapshot())
            }
            onRequestNotifications={() =>
              applyAuthorityRequest(() =>
                authorityGateway.requestNotifications()
              )
            }
            onRequestScreenCapture={() =>
              applyAuthorityRequest(() =>
                authorityGateway.requestScreenCapture()
              )
            }
            onSimulatePermissionLoss={
              simulateScreenCaptureLoss
                ? () => applyAuthorityRequest(() => simulateScreenCaptureLoss())
                : undefined
            }
          />
          <RuntimePanel
            runtimeAccessToken={runtimeAccessToken}
            runtimeUrl={runtimeUrl}
            setRuntimeAccessToken={setRuntimeAccessToken}
            setRuntimeUrl={setRuntimeUrl}
          />
          <TaskPanel
            canStartTask={authorityState.canStartTask}
            instruction={instruction}
            isPaused={Boolean(session?.pause)}
            isSubmitting={isSubmitting}
            isTaskLoopRunning={isTaskLoopRunning}
            onStartTask={() => taskRunController.startTask(taskRunInput)}
            onStopTask={() => taskRunController.stopTask(session)}
            setInstruction={setInstruction}
          />
          <ResultPanel
            errorMessage={errorMessage}
            isConfirmationPause={
              session?.task.status === "confirmation_required"
            }
            isTaskLoopRunning={isTaskLoopRunning}
            latestEvent={session?.events.at(-1) ?? null}
            onAllowConfirmedAction={() =>
              taskRunController.allowConfirmedAction(session, taskRunInput)
            }
            onContinuePausedTask={() =>
              taskRunController.continuePausedTask(session, taskRunInput)
            }
            onStopTask={() => taskRunController.stopTask(session)}
            session={session}
          />
          <TracePanel events={traceEvents} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
