---
title: Customer App Story
description: Product target and current gap for making phone automation usable as a customer-installed Android app.
updateAt: 2026-06-13
---

# Customer App Story

## Scope

- Covers the gap between the current internal demo and the desired customer-installable Android app story.
- Main surfaces: `apps/mobile`, `apps/worker`, ADB, Open-AutoGLM, model provider credentials, and the local worker connection.
- Also covers the product boundary for a future Android app or Android On-Device Executor that may live in a new `apps/*` workspace.

## Domain Language

- **Customer App Story**: The target story where a user installs an Android app on their own physical Android phone, enters an instruction, and starts automation of that same phone from the app.
  _Avoid_: treating the current demo APK as a standalone customer product, cloud-device story
- **Full Access Mode**: The initial customer-story automation posture where, after explicit permission setup, the app proceeds with broad routine control instead of interrupting every action for approval.
  _Avoid_: silent permission bypass, complete safety framework before first runnable MVP
- **Alpha Sideload APK**: The MVP QA distribution artifact that an internal user installs directly on their Android phone to validate the Customer App Story.
  _Avoid_: production release, Play Store build, beta release, AAB package

## Expected Product Story

- The user downloads and installs an Alpha Sideload APK on their own Android phone.
- The user opens the app, enters a command, and starts the task from that app.
- The app operates the same physical Android phone the user installed it on and shows progress, final state, and evidence.
- This story is not satisfied by curl, terminal commands, web-only submission, or a setup that requires the customer to run a Mac developer worker manually.
- This story is also not satisfied by a cloud device fleet operating some other Android device on the user's behalf.

## Delivery Boundary

- The current application is not ready to send to customers as a standalone app.
- A build becomes deliverable only when the Customer App Story works from the installed Android app without manual Mac worker setup.
- The first deliverable artifact is an Alpha Sideload APK for internal QA users, not a production app, public beta, Play Store listing, or AAB submission.
- Internal users should download the first Alpha Sideload APK from GitHub Release.
- The GitHub Release APK is the official Alpha APK. APKs built by users from the open-source repository are developer builds and may require uninstalling the official APK first because they use a different signing key.
- The official Alpha APK must be signed with a project release keystore. The keystore and its passwords are private signing identity material and must never be committed or uploaded as release artifacts.
- The current `apps/mobile` APK can demonstrate the UI and task protocol, but it cannot execute real automation alone.
- The likely next product surface is a new customer-facing Android app or executor workspace under `apps/*`, while `apps/mobile` remains the worker-backed demo companion until we explicitly migrate it.

## Current Demo Reality

- `apps/mobile` is currently the task entry and result review surface.
- `apps/worker` is currently the Agent Runtime that actually executes tasks.
- The worker currently depends on an Android phone visible to ADB, an importable Open-AutoGLM source tree or Python package, a ModelScope or BigModel API key, and a local connection through LAN or `adb reverse`.
- Sending only the current APK to a customer is insufficient. The app can open, but real task execution still needs the worker and device/model setup.
- The no-phone path is `PHONE_AUTOMATION_WORKER_RUNNER=dry-run`; it verifies the API and UI protocol only and does not prove real phone control.

## First Customer MVP Bias

- The first Customer App Story MVP can assume strong Android permissions when the user explicitly grants them during setup.
- Default to Full Access Mode for routine actions after setup; an approval-first mode can come later after the core loop works.
- Do not make rich guardrails, policy tiers, or per-action approvals a blocker for the first runnable version.
- Android system permission screens still require explicit user consent. Full Access Mode is our task-execution posture after those grants.
- Keep login, captcha, payment, account changes, and irreversible actions outside the first customer acceptance story unless the product scope changes.

## Productization Implications

- The closest route to the Customer App Story is an Android on-device executor, but it has serious permission, screenshot, input simulation, app compatibility, and safety constraints.
- A local companion worker is the shortest extension of the current architecture, but it still asks the customer to install and run a second runtime.
- A cloud runtime or device fleet can simplify the phone app experience, but it no longer satisfies the Customer App Story unless the controlled device remains the user's same physical phone.
- Until one route is chosen and implemented, describe the current build as an internal demo, not a customer-distributable product.
- Once the Customer App Story path works, describe the first distributable build as an MVP Alpha Sideload APK for a small internal user group.
- The repository can remain open source while the official release keystore remains private; source availability does not imply that third-party builds share the official APK signing identity.
- If the on-device route is selected, create a dedicated app/executor boundary instead of mixing demo companion concerns with strong-permission execution concerns by default.

## Decision Records

- **2026-06-12 first-customer-mvp-full-access**: Use Full Access Mode as the default posture for the first customer-story MVP after explicit Android permission setup.
  Status: Accepted
  Context: The first deliverable still lacks a customer-installable path that can automate the user's same physical Android phone. A large approval and guardrail system would delay the first working proof.
  Decision: Treat strong permission onboarding and broad routine automation authority as acceptable for the first customer-story MVP.
  Consequences: The MVP must be positioned as an explicitly granted automation app. Android permission onboarding becomes core product work, and high-risk operations remain out of the first acceptance story.

## Update Triggers

- Update this file when the productization route is selected.
- Update this file when real on-device execution, a companion runtime, or a cloud runtime becomes the accepted target.
- Update this file when the customer-facing acceptance story changes.
