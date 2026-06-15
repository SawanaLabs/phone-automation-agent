import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import type {
  CustomerSessionSnapshot,
  CustomerTaskEvent,
} from "./customer-session";
import type {
  DeviceAuthoritySnapshot,
  DeviceAuthorityState,
} from "./device-authority";
import { styles } from "./styles";

export function SetupPanel({
  authoritySnapshot,
  authorityState,
  onOpenAccessibilitySettings,
  onRefreshAuthority,
  onRequestNotifications,
  onRequestScreenCapture,
  onSimulatePermissionLoss,
}: {
  authoritySnapshot: DeviceAuthoritySnapshot;
  authorityState: DeviceAuthorityState;
  onOpenAccessibilitySettings: () => void;
  onRefreshAuthority: () => void;
  onRequestNotifications: () => void;
  onRequestScreenCapture: () => void;
  onSimulatePermissionLoss?: () => void;
}) {
  return (
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
        <AuthorityRow
          actionLabel="Open Settings"
          label="Accessibility Service"
          onPress={onOpenAccessibilitySettings}
          value={authoritySnapshot.accessibilityService}
        />
        <AuthorityRow
          actionLabel="Grant Capture"
          label="Screen Capture"
          onPress={onRequestScreenCapture}
          value={authoritySnapshot.screenCapture}
        />
        <AuthorityRow
          actionLabel="Grant Alerts"
          label="Notifications"
          onPress={onRequestNotifications}
          value={authoritySnapshot.notifications}
        />
      </View>
      <View style={styles.buttonRow}>
        <SecondaryButton label="Re-check" onPress={onRefreshAuthority} />
        {onSimulatePermissionLoss ? (
          <SecondaryButton
            label="Simulate Lost Capture"
            onPress={onSimulatePermissionLoss}
          />
        ) : null}
      </View>
      {authorityState.missing.length > 0 ? (
        <Text style={styles.emptyText}>
          Missing: {authorityState.missing.join(", ")}
        </Text>
      ) : null}
    </View>
  );
}

export function RuntimePanel({
  runtimeAccessToken,
  runtimeUrl,
  setRuntimeAccessToken,
  setRuntimeUrl,
}: {
  runtimeAccessToken: string;
  runtimeUrl: string;
  setRuntimeAccessToken: (value: string) => void;
  setRuntimeUrl: (value: string) => void;
}) {
  return (
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
  );
}

export function TaskPanel({
  canStartTask,
  instruction,
  isPaused,
  isSubmitting,
  isTaskLoopRunning,
  onStartTask,
  onStopTask,
  setInstruction,
}: {
  canStartTask: boolean;
  instruction: string;
  isPaused: boolean;
  isSubmitting: boolean;
  isTaskLoopRunning: boolean;
  onStartTask: () => void;
  onStopTask: () => void;
  setInstruction: (value: string) => void;
}) {
  const startDisabled =
    isSubmitting || isTaskLoopRunning || isPaused || !canStartTask;
  return (
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
        disabled={startDisabled}
        onPress={onStartTask}
        style={({ pressed }) => [
          styles.primaryButton,
          pressed && styles.buttonPressed,
          startDisabled && styles.buttonDisabled,
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
          onPress={onStopTask}
          style={({ pressed }) => [
            styles.stopButton,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.stopButtonText}>Stop Task</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ResultPanel({
  errorMessage,
  isConfirmationPause,
  isTaskLoopRunning,
  latestEvent,
  onAllowConfirmedAction,
  onContinuePausedTask,
  onStopTask,
  session,
}: {
  errorMessage: string | null;
  isConfirmationPause: boolean;
  isTaskLoopRunning: boolean;
  latestEvent: CustomerTaskEvent | null;
  onAllowConfirmedAction: () => void;
  onContinuePausedTask: () => void;
  onStopTask: () => void;
  session: CustomerSessionSnapshot | null;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Result</Text>
      {session?.pause ? (
        <PauseControls
          isConfirmationPause={isConfirmationPause}
          isTaskLoopRunning={isTaskLoopRunning}
          onAllowConfirmedAction={onAllowConfirmedAction}
          onContinuePausedTask={onContinuePausedTask}
          onStopTask={onStopTask}
          session={session}
        />
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
              style={[styles.statusDot, getStatusDotStyle(session.task.status)]}
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
  );
}

export function TracePanel({ events }: { events: CustomerTaskEvent[] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Trace</Text>
      {events.length > 0 ? (
        <View style={styles.traceList}>
          {events.map((event) => (
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
  );
}

function AuthorityRow({
  actionLabel,
  label,
  onPress,
  value,
}: {
  actionLabel: string;
  label: string;
  onPress: () => void;
  value: string;
}) {
  return (
    <View style={styles.authorityRow}>
      <View>
        <Text style={styles.authorityName}>{label}</Text>
        <Text style={styles.authorityValue}>{value}</Text>
      </View>
      <SecondaryButton label={actionLabel} onPress={onPress} />
    </View>
  );
}

function SecondaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        pressed && styles.buttonPressed,
      ]}
    >
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function PauseControls({
  isConfirmationPause,
  isTaskLoopRunning,
  onAllowConfirmedAction,
  onContinuePausedTask,
  onStopTask,
  session,
}: {
  isConfirmationPause: boolean;
  isTaskLoopRunning: boolean;
  onAllowConfirmedAction: () => void;
  onContinuePausedTask: () => void;
  onStopTask: () => void;
  session: CustomerSessionSnapshot;
}) {
  return (
    <View style={styles.pauseBox}>
      <Text style={styles.pauseTitle}>
        {formatPauseStatus(session.task.status)}
      </Text>
      <Text style={styles.pauseMessage}>{session.pause?.message}</Text>
      <View style={styles.buttonRow}>
        <Pressable
          accessibilityRole="button"
          disabled={isTaskLoopRunning}
          onPress={
            isConfirmationPause ? onAllowConfirmedAction : onContinuePausedTask
          }
          style={({ pressed }) => [
            isConfirmationPause ? styles.confirmButton : styles.primaryButton,
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
          onPress={onStopTask}
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
