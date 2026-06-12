import { StatusBar } from "expo-status-bar"
import { useEffect, useMemo, useState } from "react"
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native"

import {
  startCustomerTask,
  type CustomerSessionSnapshot,
} from "./src/customer-session"
import {
  deriveDeviceAuthorityState,
  type DeviceAuthoritySnapshot,
  type DeviceAuthorityState,
} from "./src/device-authority"
import { createDeviceAuthorityGateway } from "./src/device-authority-gateway"
import { describeError, visibleTraceEvents } from "./src/task-state"
import { styles } from "./src/styles"

const DEFAULT_RUNTIME_URL =
  process.env.EXPO_PUBLIC_CUSTOMER_RUNTIME_URL ?? "http://localhost:8787"
const DEFAULT_INSTRUCTION = "打开小红书搜索咖啡店，停在结果页"
const DEFAULT_AUTHORITY_SNAPSHOT: DeviceAuthoritySnapshot = {
  accessibilityService: "disabled",
  screenCapture: "missing",
}
const authorityGateway = createDeviceAuthorityGateway()

export default function App() {
  const [runtimeUrl, setRuntimeUrl] = useState(DEFAULT_RUNTIME_URL)
  const [instruction, setInstruction] = useState(DEFAULT_INSTRUCTION)
  const [session, setSession] = useState<CustomerSessionSnapshot | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [authoritySnapshot, setAuthoritySnapshot] =
    useState(DEFAULT_AUTHORITY_SNAPSHOT)
  const [authorityState, setAuthorityState] = useState(() =>
    deriveDeviceAuthorityState(DEFAULT_AUTHORITY_SNAPSHOT)
  )

  const traceEvents = useMemo(
    () => visibleTraceEvents(session?.events ?? []),
    [session]
  )

  function applyAuthoritySnapshot(snapshot: DeviceAuthoritySnapshot) {
    setAuthoritySnapshot(snapshot)
    setAuthorityState((previousState) =>
      deriveDeviceAuthorityState(snapshot, previousState.status)
    )
  }

  useEffect(() => {
    let isMounted = true
    void authorityGateway
      .getSnapshot()
      .then((snapshot) => {
        if (isMounted) {
          applyAuthoritySnapshot(snapshot)
        }
      })
      .catch((error) => {
        if (isMounted) {
          setErrorMessage(describeError(error))
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  async function refreshAuthority() {
    setErrorMessage(null)
    try {
      applyAuthoritySnapshot(await authorityGateway.getSnapshot())
    } catch (error) {
      setErrorMessage(describeError(error))
    }
  }

  async function handleOpenAccessibilitySettings() {
    setErrorMessage(null)
    try {
      applyAuthoritySnapshot(await authorityGateway.openAccessibilitySettings())
    } catch (error) {
      setErrorMessage(describeError(error))
    }
  }

  async function handleRequestScreenCapture() {
    setErrorMessage(null)
    try {
      applyAuthoritySnapshot(await authorityGateway.requestScreenCapture())
    } catch (error) {
      setErrorMessage(describeError(error))
    }
  }

  async function handleSimulatePermissionLoss() {
    if (!authorityGateway.simulateScreenCaptureLoss) {
      return
    }

    setErrorMessage(null)
    try {
      applyAuthoritySnapshot(await authorityGateway.simulateScreenCaptureLoss())
    } catch (error) {
      setErrorMessage(describeError(error))
    }
  }

  async function handleStartTask() {
    setIsSubmitting(true)
    setErrorMessage(null)
    try {
      const nextSession = await startCustomerTask({
        authorityState,
        runtimeUrl,
        instruction,
      })
      setSession(nextSession)
    } catch (error) {
      setSession(null)
      setErrorMessage(describeError(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
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
              disabled={isSubmitting || !authorityState.canStartTask}
              onPress={handleStartTask}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.buttonPressed,
                (isSubmitting || !authorityState.canStartTask) &&
                  styles.buttonDisabled,
              ]}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.primaryButtonText}>Start Task</Text>
              )}
            </Pressable>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Result</Text>
            {session ? (
              <View style={styles.resultStack}>
                <View style={styles.statusLine}>
                  <View
                    style={[
                      styles.statusDot,
                      session.task.status === "finished"
                        ? styles.statusFinished
                        : styles.statusRunning,
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
                  <View key={`${event.sequence}-${event.type}`} style={styles.traceItem}>
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
    </SafeAreaView>
  )
}

function formatAuthorityStatus(status: DeviceAuthorityState["status"]): string {
  if (status === "ready") {
    return "Ready"
  }

  if (status === "permission_lost") {
    return "Permission Lost"
  }

  return "Setup Required"
}
