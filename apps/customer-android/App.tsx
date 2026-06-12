import { StatusBar } from "expo-status-bar"
import { useMemo, useState } from "react"
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
import { describeError, visibleTraceEvents } from "./src/task-state"
import { styles } from "./src/styles"

const DEFAULT_RUNTIME_URL =
  process.env.EXPO_PUBLIC_CUSTOMER_RUNTIME_URL ?? "http://localhost:8787"
const DEFAULT_INSTRUCTION = "打开小红书搜索咖啡店，停在结果页"

export default function App() {
  const [runtimeUrl, setRuntimeUrl] = useState(DEFAULT_RUNTIME_URL)
  const [instruction, setInstruction] = useState(DEFAULT_INSTRUCTION)
  const [session, setSession] = useState<CustomerSessionSnapshot | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const traceEvents = useMemo(
    () => visibleTraceEvents(session?.events ?? []),
    [session]
  )

  async function handleStartTask() {
    setIsSubmitting(true)
    setErrorMessage(null)
    try {
      const nextSession = await startCustomerTask({
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
              disabled={isSubmitting}
              onPress={handleStartTask}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.buttonPressed,
                isSubmitting && styles.buttonDisabled,
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
