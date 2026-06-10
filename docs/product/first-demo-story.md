---
title: First Demo Story
description: Acceptance QA story for the first Mobile Agent App version of the Open-AutoGLM quickstart.
updateAt: 2026-06-10
---

# First Demo Story

## Scope

- Covers the first end-to-end QA story for the Demo Build.
- Main surfaces: `apps/mobile`, `apps/worker`, the Controlled Phone, and the existing Open-AutoGLM ADB control loop.
- The story is the app version of the already successful Android quickstart: submit the task from the phone app, let the Mac worker drive the same phone, and return to the phone app for the result.

## Domain Language

- **Tester**: The person holding the Controlled Phone during the internal demo.
- **Acceptance QA Story**: The smallest end-to-end story that proves the demo route from task submission to visible result.

## Current Product Story

The tester opens the Mobile Agent App on the Android phone and connects it to the Mac Agent Runtime on the same local network. The tester submits:

```text
打开美团搜索附近的火锅店，不要下单，只停在搜索结果页
```

The worker creates a task, uses the existing Open-AutoGLM ADB path to operate the same Android phone, launches Meituan, searches for nearby hotpot results, and stops on the search results page. When the task finishes, the phone app shows the final status and enough trace evidence to confirm what happened.

## Acceptance Criteria

- The task is submitted from the Mobile Agent App, not from a terminal, curl command, or web page.
- The Mac Agent Runtime controls the same Android phone through ADB and Open-AutoGLM.
- The task reaches the Meituan search results page for hotpot without placing an order.
- The app can show final task state after the phone returns from Meituan to the Mobile Agent App.
- The tester can inspect at least the final status, final screenshot or screen summary, and recent action trace.
- `apps/web` is not required for the story to pass.

## Current QA Route

- The app-submitted story passed on 2026-06-10 with a single Android phone, Expo mobile app, Mac worker, Open-AutoGLM, and the ModelScope hosted `ZhipuAI/AutoGLM-Phone-9B` endpoint.
- Before running the ModelScope route, temporarily lower the Android logical size with `adb shell wm size 992x2048`; restore it with `adb shell wm size reset` after the run.
- A passing run should show `Worker Online`, `NOH_AN00 · available`, a `finished` result in the Mobile Agent App, and Meituan left on the hotpot search results page.
- Keep QA evidence in an OS temp directory by default. Only copy evidence into the repo when the user explicitly wants durable review artifacts.

## Non-Goals

- No login, payment, captcha, checkout, or irreversible action.
- No app store distribution.
- No on-device automation executor.
- No day-one overlay requirement.
- No cloud account system or remote device fleet.

## Update Triggers

- Update this file when the first QA story changes.
- Update this file when a new acceptance story becomes the primary demo gate.
- Update this file after a real app-submitted run proves or invalidates one of the criteria.
