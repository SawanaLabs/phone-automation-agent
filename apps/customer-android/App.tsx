// biome-ignore lint/nursery/noExcessiveLinesPerFile: existing screen file exceeds 500 lines; split during the customer-android architecture pass.
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  NativeModules,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { createCompletionSignalNotifier } from "./src/completion-signal-gateway";
import {
  type CustomerSessionSnapshot,
  type CustomerTaskEvent,
  startCustomerTask,
} from "./src/customer-session";
import {
  type DeviceAuthoritySnapshot,
  type DeviceAuthorityState,
  deriveDeviceAuthorityState,
} from "./src/device-authority";
import { createDeviceAuthorityGateway } from "./src/device-authority-gateway";
import {
  createNativeHostedTaskRunner,
  requireCustomerAutomationNativeModule,
} from "./src/native-customer-automation";
import {
  createPauseContinueActionResult,
  executeConfirmedPauseAction,
} from "./src/routine-action-dispatch";
import { createRoutineActionExecutor } from "./src/routine-action-executor-gateway";
import {
  runHostedRoutineActionLoop,
  stopPausedRoutineActionSession,
} from "./src/routine-actions";
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
const routineActionExecutor = createRoutineActionExecutor();
const screenStateCollector = createScreenStateCollector();
const completionSignalNotifier = createCompletionSignalNotifier();
const nativeHostedTaskRunner =
  Platform.OS === "web"
    ? null
    : createNativeHostedTaskRunner(
        requireCustomerAutomationNativeModule(NativeModules)
      );

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: existing screen orchestrator; split state and panels during the customer-android architecture pass.
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
  const latestEvent = session?.events.at(-1) ?? null;
  const isPaused = Boolean(session?.pause);
  const isConfirmationPause = session?.task.status === "confirmation_required";
  const stopRequestedRef = useRef(false);

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

  async function refreshAuthority() {
    setErrorMessage(null);
    try {
      applyAuthoritySnapshot(await authorityGateway.getSnapshot());
    } catch (error) {
      setErrorMessage(describeError(error));
    }
  }

  async function handleOpenAccessibilitySettings() {
    setErrorMessage(null);
    try {
      applyAuthoritySnapshot(
        await authorityGateway.openAccessibilitySettings()
      );
    } catch (error) {
      setErrorMessage(describeError(error));
    }
  }

  async function handleRequestScreenCapture() {
    setErrorMessage(null);
    try {
      applyAuthoritySnapshot(await authorityGateway.requestScreenCapture());
    } catch (error) {
      setErrorMessage(describeError(error));
    }
  }

  async function handleRequestNotifications() {
    setErrorMessage(null);
    try {
      applyAuthoritySnapshot(await authorityGateway.requestNotifications());
    } catch (error) {
      setErrorMessage(describeError(error));
    }
  }

  async function handleSimulatePermissionLoss() {
    if (!authorityGateway.simulateScreenCaptureLoss) {
      return;
    }

    setErrorMessage(null);
    try {
      applyAuthoritySnapshot(
        await authorityGateway.simulateScreenCaptureLoss()
      );
    } catch (error) {
      setErrorMessage(describeError(error));
    }
  }

  async function handleStartTask() {
    setIsSubmitting(true);
    setErrorMessage(null);
    stopRequestedRef.current = false;
    try {
      if (nativeHostedTaskRunner) {
        setIsTaskLoopRunning(true);
        setSession(
          await nativeHostedTaskRunner.startTask({
            authorityState,
            runtimeUrl,
            runtimeAccessToken,
            instruction,
          })
        );
        return;
      }

      const nextSession = await startCustomerTask({
        authorityState,
        runtimeUrl,
        runtimeAccessToken,
        instruction,
      });
      setSession(nextSession);
      await runTaskLoopFromSession(nextSession);
    } catch (error) {
      setSession(null);
      setErrorMessage(describeError(error));
    } finally {
      setIsSubmitting(false);
      setIsTaskLoopRunning(false);
    }
  }

  function handleStopTask() {
    if (session?.pause) {
      setSession(stopPausedRoutineActionSession(session));
      return;
    }

    stopRequestedRef.current = true;
  }

  async function handleContinuePausedTask() {
    if (!session?.pause) {
      return;
    }

    await runTaskLoopFromSession(session, {
      initialStepNumber: session.nextStepNumber,
      initialLastActionResult: createPauseContinueActionResult(session.pause),
    });
  }

  async function handleAllowConfirmedAction() {
    if (!session?.pause) {
      return;
    }

    setIsTaskLoopRunning(true);
    setErrorMessage(null);
    stopRequestedRef.current = false;
    try {
      const result = await executeConfirmedPauseAction(
        session.pause,
        routineActionExecutor
      );
      const confirmedSession = appendSessionEvent(session, {
        sequence: session.events.length + 1,
        type: "step.result",
        message: result.message,
        payload: {
          result,
          stepNumber: Math.max(1, (session.nextStepNumber ?? 2) - 1),
        },
      });
      setSession(confirmedSession);
      await runTaskLoopFromSession(confirmedSession, {
        initialStepNumber: session.nextStepNumber,
        initialLastActionResult: result,
      });
    } catch (error) {
      setErrorMessage(describeError(error));
    } finally {
      setIsTaskLoopRunning(false);
    }
  }

  async function runTaskLoopFromSession(
    baseSession: CustomerSessionSnapshot,
    options: {
      initialStepNumber?: number;
      initialLastActionResult?: CustomerSessionSnapshot["lastActionResult"];
    } = {}
  ) {
    setIsTaskLoopRunning(true);
    setErrorMessage(null);
    stopRequestedRef.current = false;
    try {
      const finalSession = await runHostedRoutineActionLoop({
        taskId: baseSession.task.id,
        instruction: baseSession.task.instruction,
        runtimeUrl,
        runtimeAccessToken,
        executor: routineActionExecutor,
        screenStateCollector,
        initialEvents: baseSession.events,
        initialStepNumber: options.initialStepNumber,
        initialLastActionResult: options.initialLastActionResult,
        completionSignalNotifier,
        shouldStop: () => stopRequestedRef.current,
        onEvent: (event) => {
          setSession((currentSession) =>
            appendSessionEvent(currentSession ?? baseSession, event)
          );
        },
      });
      setSession(finalSession);
    } catch (error) {
      setErrorMessage(describeError(error));
    } finally {
      setIsTaskLoopRunning(false);
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

          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>Setup</Text>
              <View
                style={[
                  styles.authorityPill,
                  authorityState.canStartTask
                    ? styles.authorityPillReady
                    : styles.authorityPillRequired,
                ]}
              >
                <Text
                  style={[
                    styles.authorityPillText,
                    authorityState.canStartTask
                      ? styles.authorityPillTextReady
                      : styles.authorityPillTextRequired,
                  ]}
                >
                  {formatAuthorityStatus(authorityState.status)}
                </Text>
              </View>
            </View>
            <View style={styles.authorityGrid}>
              <View style={styles.authorityRow}>
                <View>
                  <Text style={styles.authorityName}>
                    Accessibility Service
                  </Text>
                  <Text style={styles.authorityValue}>
                    {authoritySnapshot.accessibilityService}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={handleOpenAccessibilitySettings}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.secondaryButtonText}>Open Settings</Text>
                </Pressable>
              </View>
              <View style={styles.authorityRow}>
                <View>
                  <Text style={styles.authorityName}>Screen Capture</Text>
                  <Text style={styles.authorityValue}>
                    {authoritySnapshot.screenCapture}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={handleRequestScreenCapture}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.secondaryButtonText}>Grant Capture</Text>
                </Pressable>
              </View>
              <View style={styles.authorityRow}>
                <View>
                  <Text style={styles.authorityName}>Notifications</Text>
                  <Text style={styles.authorityValue}>
                    {authoritySnapshot.notifications}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={handleRequestNotifications}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.secondaryButtonText}>Grant Alerts</Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.buttonRow}>
              <Pressable
                accessibilityRole="button"
                onPress={refreshAuthority}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Re-check</Text>
              </Pressable>
              {authorityGateway.simulateScreenCaptureLoss ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={handleSimulatePermissionLoss}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.secondaryButtonText}>
                    Simulate Lost Capture
                  </Text>
                </Pressable>
              ) : null}
            </View>
            {authorityState.missing.length > 0 ? (
              <Text style={styles.emptyText}>
                Missing: {authorityState.missing.join(", ")}
              </Text>
            ) : null}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Runtime</Text>
            <TextInput
              accessibilityLabel="Hosted runtime URL"
              autoCapitalize="none"
              autoCorrect={false}
              inputMode="url"
              onChangeText={setRuntimeUrl}
              placeholder="http://localhost:8787"
              placeholderTextColor="#6b7280"
              style={styles.input}
              value={runtimeUrl}
            />
            <TextInput
              accessibilityLabel="Hosted runtime access token"
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setRuntimeAccessToken}
              placeholder="alpha runtime token"
              placeholderTextColor="#6b7280"
              secureTextEntry
              style={styles.input}
              value={runtimeAccessToken}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Task</Text>
            <TextInput
              accessibilityLabel="Task instruction"
              multiline
              onChangeText={setInstruction}
              style={[styles.input, styles.taskInput]}
              textAlignVertical="top"
              value={instruction}
            />
            <Pressable
              accessibilityRole="button"
              disabled={
                isSubmitting ||
                isTaskLoopRunning ||
                isPaused ||
                !authorityState.canStartTask
              }
              onPress={handleStartTask}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.buttonPressed,
                (isSubmitting ||
                  isTaskLoopRunning ||
                  isPaused ||
                  !authorityState.canStartTask) &&
                  styles.buttonDisabled,
              ]}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.primaryButtonText}>Start Task</Text>
              )}
            </Pressable>
            {isTaskLoopRunning ? (
              <Pressable
                accessibilityRole="button"
                onPress={handleStopTask}
                style={({ pressed }) => [
                  styles.stopButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.stopButtonText}>Stop Task</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Result</Text>
            {session?.pause ? (
              <View style={styles.pauseBox}>
                <Text style={styles.pauseTitle}>
                  {formatPauseStatus(session.task.status)}
                </Text>
                <Text style={styles.pauseMessage}>{session.pause.message}</Text>
                <View style={styles.buttonRow}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={isTaskLoopRunning}
                    onPress={
                      isConfirmationPause
                        ? handleAllowConfirmedAction
                        : handleContinuePausedTask
                    }
                    style={({ pressed }) => [
                      isConfirmationPause
                        ? styles.confirmButton
                        : styles.primaryButton,
                      pressed && styles.buttonPressed,
                      isTaskLoopRunning && styles.buttonDisabled,
                    ]}
                  >
                    <Text
                      style={
                        isConfirmationPause
                          ? styles.confirmButtonText
                          : styles.primaryButtonText
                      }
                    >
                      {isConfirmationPause ? "Allow" : "Continue"}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={isTaskLoopRunning}
                    onPress={handleStopTask}
                    style={({ pressed }) => [
                      styles.stopButton,
                      pressed && styles.buttonPressed,
                      isTaskLoopRunning && styles.buttonDisabled,
                    ]}
                  >
                    <Text style={styles.stopButtonText}>Stop Task</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
            {latestEvent ? (
              <View style={styles.latestActionBox}>
                <Text style={styles.latestActionLabel}>Latest Action</Text>
                <Text style={styles.latestActionText}>
                  {latestEvent.message ?? latestEvent.type}
                </Text>
              </View>
            ) : null}
            {session ? (
              <View style={styles.resultStack}>
                <View style={styles.statusLine}>
                  <View
                    style={[
                      styles.statusDot,
                      getStatusDotStyle(session.task.status),
                    ]}
                  />
                  <Text style={styles.statusText}>{session.task.status}</Text>
                </View>
                {session.task.summary ? (
                  <Text style={styles.summaryText}>{session.task.summary}</Text>
                ) : null}
                <Text style={styles.taskIdText}>{session.task.id}</Text>
              </View>
            ) : (
              <Text style={styles.emptyText}>No customer task submitted.</Text>
            )}
            {errorMessage ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Trace</Text>
            {traceEvents.length > 0 ? (
              <View style={styles.traceList}>
                {traceEvents.map((event) => (
                  <View
                    key={`${event.sequence}-${event.type}`}
                    style={styles.traceItem}
                  >
                    <Text style={styles.traceType}>{event.type}</Text>
                    <Text style={styles.traceMessage}>
                      {event.message ?? `#${event.sequence}`}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyText}>No trace events yet.</Text>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function formatAuthorityStatus(status: DeviceAuthorityState["status"]): string {
  if (status === "ready") {
    return "Ready";
  }

  if (status === "permission_lost") {
    return "Permission Lost";
  }

  return "Setup Required";
}

function formatPauseStatus(status: CustomerSessionSnapshot["task"]["status"]) {
  if (status === "confirmation_required") {
    return "Confirmation Required";
  }

  if (status === "takeover_required") {
    return "Take Over Required";
  }

  if (status === "interaction_required") {
    return "Interaction Required";
  }

  return "Paused";
}

function getStatusDotStyle(status: CustomerSessionSnapshot["task"]["status"]) {
  if (status === "finished") {
    return styles.statusFinished;
  }

  if (status === "failed" || status === "stopped") {
    return styles.statusStopped;
  }

  if (
    status === "confirmation_required" ||
    status === "takeover_required" ||
    status === "interaction_required"
  ) {
    return styles.statusPaused;
  }

  return styles.statusRunning;
}

function appendSessionEvent(
  session: CustomerSessionSnapshot,
  event: CustomerTaskEvent
): CustomerSessionSnapshot {
  return {
    ...session,
    events: [...session.events, event],
  };
}
