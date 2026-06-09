import { StyleSheet, type StyleProp, type ViewStyle } from "react-native"

import type { ConnectionState } from "./task-state"
import type { TaskStatus } from "./worker-api"

export const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#eef2f7",
  },
  keyboard: {
    flex: 1,
  },
  content: {
    gap: 14,
    padding: 18,
    paddingBottom: 36,
  },
  header: {
    gap: 4,
    paddingBottom: 4,
  },
  eyebrow: {
    color: "#5b6678",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  title: {
    color: "#121826",
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: 0,
  },
  section: {
    backgroundColor: "#ffffff",
    borderColor: "#d7deea",
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  rowHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: "#182235",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0,
  },
  input: {
    backgroundColor: "#f7f9fc",
    borderColor: "#c7d0df",
    borderRadius: 8,
    borderWidth: 1,
    color: "#121826",
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  taskInput: {
    minHeight: 112,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#2347c7",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0,
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "#e8edf6",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: "#16233a",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0,
  },
  buttonPressed: {
    opacity: 0.76,
  },
  disabledButton: {
    opacity: 0.5,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badge_idle: {
    backgroundColor: "#d9e0ea",
  },
  badge_checking: {
    backgroundColor: "#f6d77a",
  },
  badge_online: {
    backgroundColor: "#83d2ad",
  },
  badge_offline: {
    backgroundColor: "#f2a6a6",
  },
  badgeText: {
    color: "#111827",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0,
  },
  deviceList: {
    gap: 4,
  },
  deviceText: {
    color: "#2b374a",
    fontSize: 14,
    letterSpacing: 0,
  },
  mutedText: {
    color: "#687386",
    fontSize: 14,
    letterSpacing: 0,
  },
  emptyText: {
    color: "#687386",
    fontSize: 15,
    letterSpacing: 0,
  },
  resultStack: {
    gap: 8,
  },
  statusLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  statusDot: {
    borderRadius: 999,
    height: 10,
    width: 10,
  },
  status_created: {
    backgroundColor: "#8b95a7",
  },
  status_running: {
    backgroundColor: "#3563e9",
  },
  status_finished: {
    backgroundColor: "#159b63",
  },
  status_failed: {
    backgroundColor: "#d94b4b",
  },
  status_confirmation_required: {
    backgroundColor: "#ce8f16",
  },
  status_takeover_required: {
    backgroundColor: "#7c4dcc",
  },
  statusText: {
    color: "#111827",
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 0,
  },
  summaryText: {
    color: "#24324a",
    fontSize: 16,
    lineHeight: 22,
  },
  errorInline: {
    color: "#bc2f2f",
    fontSize: 15,
    lineHeight: 21,
  },
  taskIdText: {
    color: "#687386",
    fontSize: 12,
    letterSpacing: 0,
  },
  traceList: {
    gap: 8,
  },
  traceItem: {
    borderColor: "#d8e0ec",
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 10,
  },
  traceType: {
    color: "#526176",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0,
  },
  traceMessage: {
    color: "#172033",
    fontSize: 15,
    lineHeight: 20,
  },
  errorBox: {
    backgroundColor: "#fee2e2",
    borderColor: "#f0a7a7",
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  errorText: {
    color: "#8f1d1d",
    fontSize: 14,
    lineHeight: 20,
  },
})

export const badgeStateStyles: Record<ConnectionState, StyleProp<ViewStyle>> = {
  idle: styles.badge_idle,
  checking: styles.badge_checking,
  online: styles.badge_online,
  offline: styles.badge_offline,
}

export const taskStatusStyles: Record<TaskStatus, StyleProp<ViewStyle>> = {
  created: styles.status_created,
  running: styles.status_running,
  finished: styles.status_finished,
  failed: styles.status_failed,
  confirmation_required: styles.status_confirmation_required,
  takeover_required: styles.status_takeover_required,
}
