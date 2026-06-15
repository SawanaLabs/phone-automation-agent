---
title: Customer Android Evidence-First E2E
description: Re-runnable QA checklist for Open-AutoGLM action coverage, Completion Signal behavior, and Run Evidence exits.
updateAt: 2026-06-14
---

# Customer Android Evidence-First E2E

## Scope

- Covers end-to-end QA for the Customer Android App, Customer Android API, model provider, and connected Android phone behavior.
- Applies to the Hosted Agent Runtime Route where the APK executes routine actions and the API returns the next Open-AutoGLM-style action.
- Excludes scripted-only acceptance as proof of the final Customer App Story. Scripted-provider runs are diagnostics for transport, executor, and pause behavior.

## Coverage Accounting

The code-level coverage manifest is `apps/customer-android/src/action-e2e-coverage.ts`; its test enforces that the 14 recognized `do(...)` actions plus `finish(...)` are accounted for exactly once by action name.

| Coverage group | Action names | Required evidence |
| --- | --- | --- |
| Routine Action E2E | `Launch`, `Tap`, `Type`, `Type_Name`, `Swipe`, `Back`, `Home`, `Wait`, `Double Tap`, `Long Press` | APK/native executor performs the physical action on a connected phone; App Result and Android logcat show the action result. |
| Pause Action E2E | `Take_over`, `Interact` | App shows a pause state, Completion Signal notification fires, notification click opens the app, and Continue or Stop changes the run state. |
| Sensitive Tap Variant E2E | `Tap` with `message` | App pauses as `confirmation_required`, Allow executes the tap, Stop ends the run, and the notification path is verified. |
| Runtime-Local Action E2E | `Note`, `Call_API` | Runtime records explicit trace, success, unsupported, or no-op outcomes; these actions must not become parser or unknown-action failures. |
| Completion Signal E2E | `finish` | Target app remains foregrounded for result-page tasks, and a notification tells the user the run finished, failed, stopped, or needs attention. |

## QA Checklist

- [ ] Start `apps/customer-android-api` with `CUSTOMER_ANDROID_API_ACCESS_TOKEN` and the selected provider mode.
- [ ] Install the current `apps/customer-android` APK on a connected Android phone.
- [ ] In the APK Setup area, grant Accessibility Service, Screen Capture, and Notifications.
- [ ] Keep `adb logcat -s CustomerAutomation` visible during connected-device QA.
- [ ] For real-provider customer-story acceptance, run a bounded search task such as `打开美团，搜索白切鸡，停在结果页` or `打开小红书，搜索咖啡店，停在结果页`.
- [ ] Verify the target app remains visible after result-page `finish`; the APK must not auto-pull itself foreground just to show success.
- [ ] Verify the Completion Signal notification appears for `finished`, opens the Customer Android app when tapped, and the Result area shows the finished summary and trace.
- [ ] Run a scripted routine diagnostic that covers safe `Launch`, `Tap`, `Type`, `Type_Name`, `Swipe`, `Back`, `Home`, `Wait`, `Double Tap`, and `Long Press` actions.
- [ ] Run scripted `Take_over` and `Interact` diagnostics; verify pause UI, notification, notification click behavior, Continue, and Stop.
- [ ] Run scripted `Tap` with `message`; verify `confirmation_required`, Allow execution, Stop behavior, and notification evidence.
- [ ] Run scripted `Note` and `Call_API`; verify explicit trace/result outcomes instead of parser or unknown-action failures.
- [ ] Force invalid model output or provider failure; verify API stdout/stderr contains session id, step number, and enough raw model/provider detail while the App Result UI stays concise.
- [ ] Force an Android-side failure such as lost screen capture, disabled Accessibility Service, failed native action, or denied notification permission; verify Android logcat includes task/session/step context when available.
- [ ] Use `GET /sessions/{session_id}` for API-side debugging and confirm terminal or pause state remains visible in the session snapshot.

## Acceptance Boundary

- Real-provider connected-device acceptance is required before calling the Customer App Story complete.
- Scripted-provider success can confirm action dispatch, pause controls, notification plumbing, and evidence exits, but it cannot replace the real provider search task.
- Failures found during E2E should be diagnosed through Run Evidence exits: API stdout/stderr, Android logcat, App Result UI, and session snapshots.

## Update Triggers

- Update this file when the Open-AutoGLM action vocabulary changes.
- Update this file when Completion Signal behavior changes.
- Update this file when the Customer Android QA flow gains a new required evidence exit.
