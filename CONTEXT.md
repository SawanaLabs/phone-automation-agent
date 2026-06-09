# Phone Automation Agent

This context defines the shared language for a demo-first mobile AI agent product built around phone task automation.

## Language

**Mobile Agent App**:
The phone-installed app that the tester uses to submit tasks, watch progress, and respond when the agent needs human judgment. In early demos it may delegate actual phone control to another runtime.
_Avoid_: phone executor app, mobile client, pure remote control

**Agent Runtime**:
The long-running automation role that owns a task while it is running and drives a controlled phone through the best available control path.
_Avoid_: backend, serverless API, web app

**Web Presence**:
The browser-facing surface for project presentation, downloads, and lightweight management. It is not the primary task operation surface for the demo.
_Avoid_: web fallback, web control console

**Controlled Phone**:
The phone whose screen and apps are being operated by the agent during a task.
_Avoid_: target device, test device

**Demo Build**:
An internal build optimized for proving the end-to-end phone task story with the least custom machinery that can work.
_Avoid_: production app, release build, platform-complete app

**Acceptance QA Story**:
The app-submitted end-to-end story that must pass before a Demo Build counts as working.
_Avoid_: terminal smoke test, web-only demo, implementation milestone

**Quickstart App Version**:
The already proven Open-AutoGLM Android quickstart reproduced through the Mobile Agent App as the tester-facing entry point.
_Avoid_: CLI quickstart, worker-only proof

**Single-Phone Demo**:
A demo shape where the same Android phone both runs the Mobile Agent App and acts as the Controlled Phone.
_Avoid_: web fallback demo, two-device demo

**First Demo Route**:
The confirmed first implementation path: an Android-first Expo React Native development build for `apps/mobile`, a Mac-hosted Python Agent Runtime for `apps/worker`, and the existing Open-AutoGLM ADB control loop for the Single-Phone Demo.
_Avoid_: web-first demo, on-device executor first, production distribution first

**Mobile App Framework**:
Expo React Native using a development build, chosen so the first app can ship quickly while still leaving room for native Android modules when the demo proves a need.
_Avoid_: Expo Go only, pure web wrapper, Kotlin-first rewrite

**Notification-First Coordination**:
The first coordination surface for important background events, confirmations, and takeover prompts while another app is foregrounded on the Controlled Phone. The app resumes and reconciles task state through the Agent Runtime after the tester opens the notification.
_Avoid_: always-on background socket, web fallback alert

**Overlay Spike**:
A later Android-native experiment for drawing a floating control surface above other apps. It is useful for demos but carries permission, native-module, and tap-interference risk, so it should not block the first working route.
_Avoid_: day-one overlay requirement, hidden background control

**Takeover**:
A task pause where a human temporarily handles something the agent should not or cannot complete alone, such as login, captcha, payment, or an ambiguous choice.
_Avoid_: fallback, manual mode

**Confirmation Gate**:
A task pause before a sensitive operation that requires explicit tester approval before the agent continues.
_Avoid_: confirm dialog, safety popup
