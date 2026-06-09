import { Text, View } from "react-native"

import { badgeStateStyles, styles, taskStatusStyles } from "./styles"
import type { ConnectionState } from "./task-state"
import type { DeviceRecord, TaskEvent, TaskRecord } from "./worker-api"

export function StatusBadge({ state }: { state: ConnectionState }) {
  const labelByState: Record<ConnectionState, string> = {
    idle: "Idle",
    checking: "Checking",
    online: "Online",
    offline: "Offline",
  }

  return (
    <View style={[styles.badge, badgeStateStyles[state]]}>
      <Text style={styles.badgeText}>{labelByState[state]}</Text>
    </View>
  )
}

export function DeviceSummary({ devices }: { devices: DeviceRecord[] }) {
  if (devices.length === 0) {
    return <Text style={styles.mutedText}>No worker-visible devices.</Text>
  }

  return (
    <View style={styles.deviceList}>
      {devices.map((device) => (
        <Text key={device.id} style={styles.deviceText}>
          {device.label ?? device.id} · {device.status}
        </Text>
      ))}
    </View>
  )
}

export function TaskSummary({
  task,
  screenSummary,
}: {
  task: TaskRecord | null
  screenSummary: string | null
}) {
  if (!task) {
    return <Text style={styles.emptyText}>No task submitted.</Text>
  }

  return (
    <View style={styles.resultStack}>
      <View style={styles.statusLine}>
        <View style={[styles.statusDot, taskStatusStyles[task.status]]} />
        <Text style={styles.statusText}>{task.status}</Text>
      </View>
      {screenSummary ? (
        <Text style={styles.summaryText}>{screenSummary}</Text>
      ) : null}
      {task.error ? <Text style={styles.errorInline}>{task.error}</Text> : null}
      <Text style={styles.taskIdText}>{task.id}</Text>
    </View>
  )
}

export function TraceItem({ event }: { event: TaskEvent }) {
  return (
    <View style={styles.traceItem}>
      <Text style={styles.traceType}>{event.type}</Text>
      <Text style={styles.traceMessage}>{formatEventMessage(event)}</Text>
    </View>
  )
}

function formatEventMessage(event: TaskEvent): string {
  const action = formatAction(event.payload.action)
  if (action) {
    return action
  }

  if (event.message) {
    return event.message
  }

  const message = event.payload.message
  if (typeof message === "string") {
    return message
  }

  return `#${event.sequence}`
}

function formatAction(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null
  }

  const action = value as Record<string, unknown>
  const name = action.action
  const metadata = action._metadata
  const app = action.app
  const text = action.text
  const message = action.message

  if (typeof name === "string") {
    if (typeof app === "string") {
      return `${name}: ${app}`
    }

    if (typeof text === "string") {
      return `${name}: ${text}`
    }

    if (typeof message === "string") {
      return `${name}: ${message}`
    }

    return name
  }

  return typeof metadata === "string" ? metadata : null
}
