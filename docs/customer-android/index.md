---
title: Customer Android Docs
description: Map of customer Android app and API docs.
updateAt: 2026-06-14
---

# Customer Android Docs

Use these docs when working on the customer Android APK, the paired hosted API, and the customer same-phone automation loop.

## Subdomains

- [Action Handling](./action-handling.md): Use when mapping Open-AutoGLM actions to routine Android execution, pause states, runtime-local outcomes, or unsupported handling.
- [Agent Engine](./agent-engine.md): Use when working on `apps/customer-android-api`, model-provider configuration, step-agent context, and hosted API startup.
- [Delivery](./delivery.md): Use when defining Alpha APK distribution, signing, QA gates, and first customer validation checkpoints.
- [Evidence-First E2E](./evidence-first-e2e.md): Use when rerunning connected-device QA, action coverage diagnostics, Completion Signal checks, and Run Evidence validation.
- [Runtime Boundary](./runtime-boundary.md): Use when deciding ownership between the Android app, Customer Android API, worker route, and future shared packages.
- [Runtime Contract](./runtime-contract.md): Use when defining the sessions/steps API between the Android APK and Customer Android API.

<!-- BEGIN:docs-generated-catalog -->
| File | Title | Description | Updated |
| --- | --- | --- | --- |
| ./DOCS.md | Customer Android Domain Protocol | Domain-level conventions for the customer Android app and paired API. | 2026-06-14 |
| ./action-handling.md | Customer Android Action Handling | V0 Open-AutoGLM action vocabulary, routine executor scope, and pause-state mapping for the customer Android route. | 2026-06-14 |
| ./agent-engine.md | Customer Android Agent Engine | Runtime shape, environment contract, and session context behavior for apps/customer-android-api. | 2026-06-14 |
| ./delivery.md | Customer Android Delivery | Alpha APK distribution, validation checkpoints, and QA gates for the customer Android route. | 2026-06-13 |
| ./evidence-first-e2e.md | Customer Android Evidence-First E2E | Re-runnable QA checklist for Open-AutoGLM action coverage, Completion Signal behavior, and Run Evidence exits. | 2026-06-14 |
| ./runtime-boundary.md | Customer Android Runtime Boundary | Ownership boundary for the customer Android app, paired API, and reusable contracts. | 2026-06-13 |
| ./runtime-contract.md | Customer Android Runtime Contract | V0 sessions and steps contract between the Android APK and Customer Android API. | 2026-06-13 |
<!-- END:docs-generated-catalog -->
