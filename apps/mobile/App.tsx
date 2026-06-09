import AsyncStorage from "@react-native-async-storage/async-storage"
import { StatusBar } from "expo-status-bar"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native"

import { FIRST_DEMO_TASK } from "./src/demo-task"
import { styles } from "./src/styles"
import {
  DeviceSummary,
  StatusBadge,
  TaskSummary,
  TraceItem,
} from "./src/task-components"
import {
  describeError,
  getScreenSummary,
  isActiveStatus,
  isTraceEvent,
  type ConnectionState,
} from "./src/task-state"
import {
  checkWorker,
  createTask,
  getTaskSnapshot,
  type DeviceRecord,
  type TaskEvent,
  type TaskRecord,
} from "./src/worker-api"

const WORKER_URL_STORAGE_KEY = "phone-automation-agent.worker-url"
const POLL_INTERVAL_MS = 2000

export default function App() {
  const [workerUrl, setWorkerUrl] = useState("")
  const [instruction, setInstruction] = useState(FIRST_DEMO_TASK)
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("idle")
  const [devices, setDevices] = useState<DeviceRecord[]>([])
  const [currentTask, setCurrentTask] = useState<TaskRecord | null>(null)
  const [events, setEvents] = useState<TaskEvent[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  useEffect(() => {
    void AsyncStorage.getItem(WORKER_URL_STORAGE_KEY).then((storedUrl) => {
      if (storedUrl) {
        setWorkerUrl(storedUrl)
      }
    })
  }, [])

  const refreshCurrentTask = useCallback(async () => {
    if (!currentTask) {
      return
    }

    setIsRefreshing(true)
    try {
      const snapshot = await getTaskSnapshot(workerUrl, currentTask.id)
      setCurrentTask(snapshot.task)
      setEvents(snapshot.events)
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(describeError(error))
    } finally {
      setIsRefreshing(false)
    }
  }, [currentTask, workerUrl])

  useEffect(() => {
    if (!currentTask || !isActiveStatus(currentTask.status)) {
      return
    }

    const interval = setInterval(() => {
      void refreshCurrentTask()
    }, POLL_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [currentTask, refreshCurrentTask])

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void refreshCurrentTask()
      }
    })

    return () => subscription.remove()
  }, [refreshCurrentTask])

  const visibleEvents = useMemo(() => {
    return events.filter(isTraceEvent).slice(-8).reverse()
  }, [events])

  const screenSummary = useMemo(() => {
    return getScreenSummary(currentTask, events)
  }, [currentTask, events])

  async function handleCheckWorker() {
    setConnectionState("checking")
    setErrorMessage(null)
    try {
      const nextDevices = await checkWorker(workerUrl)
      await AsyncStorage.setItem(WORKER_URL_STORAGE_KEY, workerUrl.trim())
      setDevices(nextDevices)
      setConnectionState("online")
    } catch (error) {
      setDevices([])
      setConnectionState("offline")
      setErrorMessage(describeError(error))
    }
  }

  async function handleSubmitTask() {
    setIsSubmitting(true)
    setErrorMessage(null)
    try {
      await AsyncStorage.setItem(WORKER_URL_STORAGE_KEY, workerUrl.trim())
      const task = await createTask(workerUrl, instruction)
      setCurrentTask(task)
      setEvents([])
    } catch (error) {
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
            <Text style={styles.eyebrow}>Single-Phone Demo</Text>
            <Text style={styles.title}>Phone Agent</Text>
          </View>

          <View style={styles.section}>
            <View style={styles.rowHeader}>
              <Text style={styles.sectionTitle}>Worker</Text>
              <StatusBadge state={connectionState} />
            </View>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              inputMode="url"
              onChangeText={setWorkerUrl}
              placeholder="http://<mac-lan-ip>:8765"
              placeholderTextColor="#7a8699"
              style={styles.input}
              value={workerUrl}
            />
            <Pressable
              disabled={connectionState === "checking"}
              onPress={handleCheckWorker}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.secondaryButtonText}>
                {connectionState === "checking" ? "Checking" : "Check Worker"}
              </Text>
            </Pressable>
            <DeviceSummary devices={devices} />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Task</Text>
            <TextInput
              multiline
              onChangeText={setInstruction}
              style={[styles.input, styles.taskInput]}
              textAlignVertical="top"
              value={instruction}
            />
            <Pressable
              disabled={isSubmitting}
              onPress={handleSubmitTask}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.buttonPressed,
              ]}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.primaryButtonText}>Submit From Phone</Text>
              )}
            </Pressable>
          </View>

          <View style={styles.section}>
            <View style={styles.rowHeader}>
              <Text style={styles.sectionTitle}>Result</Text>
              {isRefreshing ? <ActivityIndicator color="#3563e9" /> : null}
            </View>
            <TaskSummary task={currentTask} screenSummary={screenSummary} />
            <Pressable
              disabled={!currentTask || isRefreshing}
              onPress={refreshCurrentTask}
              style={({ pressed }) => [
                styles.secondaryButton,
                (!currentTask || isRefreshing) && styles.disabledButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.secondaryButtonText}>Refresh</Text>
            </Pressable>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Trace</Text>
            {visibleEvents.length === 0 ? (
              <Text style={styles.emptyText}>No events yet.</Text>
            ) : (
              <View style={styles.traceList}>
                {visibleEvents.map((event) => (
                  <TraceItem event={event} key={event.sequence} />
                ))}
              </View>
            )}
          </View>

          {errorMessage ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
