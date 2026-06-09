---
title: First Demo Route
description: Runtime shape for the first app-submitted phone automation demo.
updateAt: 2026-06-09
---

# First Demo Route

## Scope

- Covers the first implementation shape for `apps/mobile`, `apps/worker`, and `apps/web`.
- Applies until the first acceptance QA story passes reliably.

## Domain Language

- **First Demo Route**: Android-first Expo app plus Mac Agent Runtime plus Open-AutoGLM ADB control of the same phone.
- **Single-Phone Demo**: The same Android phone runs the Mobile Agent App and acts as the Controlled Phone.

## Runtime Responsibilities

- `apps/mobile` submits tasks, stores the worker connection setting, displays task state, opens notifications, and handles confirmation or takeover screens.
- `apps/worker` exposes the task API, owns task state, talks to Open-AutoGLM, manages the ADB-connected phone, emits normalized events, and fails explicitly when setup is wrong.
- `apps/web` can later provide landing, downloads, and light management; it is not required for the acceptance QA story.

## First Data Flow

1. The tester opens the Mobile Agent App and points it at the Mac worker URL.
2. The app sends a task request to the worker.
3. The worker creates a task and starts the Open-AutoGLM loop against the ADB-connected phone.
4. The phone may leave the Mobile Agent App because the worker launches Meituan or another target app.
5. The worker records step events such as screenshot, model action, action result, gate, finish, or failure.
6. The Mobile Agent App reconnects or polls for task state when foregrounded.
7. Completion or a gate prompts the tester through the phone app, with notification-first coordination for important background events.

## API Shape To Preserve

- `POST /tasks`: create a task from the Mobile Agent App.
- `GET /tasks/{task_id}`: read current task state.
- `GET /tasks/{task_id}/events`: stream or read normalized task events.
- `POST /tasks/{task_id}/confirm`: continue after a Confirmation Gate.
- `POST /tasks/{task_id}/takeover-complete`: resume after Takeover.
- `GET /devices`: report the worker-visible phone/device state.

## Boundaries

- Do not let `apps/mobile` call Open-AutoGLM internals directly.
- Do not make `apps/web` a required path for submitting or completing the first story.
- Do not extract a large shared core package before a real need appears.
- Do not hide worker/device setup failures behind fallback behavior.

## Update Triggers

- Update this file when the first demo route changes.
- Update this file when a new runtime surface becomes required for the acceptance story.
- Update this file when the task API shape changes.
