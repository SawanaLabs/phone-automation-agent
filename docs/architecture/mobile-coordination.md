---
title: Mobile Coordination
description: Coordination rules for the phone app while the worker controls the same phone.
updateAt: 2026-06-09
---

# Mobile Coordination

## Scope

- Covers how the Mobile Agent App stays useful while the same phone is being controlled by the worker.
- Applies to notifications, foreground/background behavior, confirmation gates, takeover, and future overlay work.

## Domain Language

- **Notification-First Coordination**: Important background events are surfaced through notifications first; the app reconciles task state with the worker after the tester opens it.
- **Overlay Spike**: A later Android-native experiment for floating UI above other apps.

## Current Coordination Model

- The first implemented mobile slice uses foreground refresh plus short polling while a task is active.
- The first app should assume it can be backgrounded when the worker launches Meituan or another target app.
- The worker is the source of truth for task state.
- The app should reconcile state on foreground by asking the worker for the latest task state and recent events.
- Foreground streaming is useful, but the first route should not depend on an always-on background socket.
- Completion, confirmation, and takeover should use a simple foreground refresh path first; notifications are the next coordination slice after task creation and completion are stable.

## Confirmation And Takeover

- Confirmation Gate means the worker pauses before a sensitive action and waits for an explicit app response.
- Takeover means the tester temporarily handles a step directly on the phone, then returns to the app and marks takeover complete.
- The first acceptance story should avoid gates. Add gates in the second demo story after task creation and completion are stable.
- The current worker fails unsupported gates explicitly, so the first mobile app only needs to display the gate event and failure state.

## Overlay Boundary

- Overlay can make the demo feel more native when another app is foregrounded.
- Overlay requires Android native work, user permission, and careful positioning so it does not block target-app taps.
- Treat overlay as a spike after the notification-first route works.

## Update Triggers

- Update this file after deciding the exact notification mechanism.
- Update this file if overlay becomes required for an acceptance story.
- Update this file when confirmation or takeover behavior is implemented.
