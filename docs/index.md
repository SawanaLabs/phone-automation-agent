---
title: Docs Index
description: Map of durable project documentation domains.
updateAt: 2026-06-14
---

# Docs Index

Start with `docs/DOCS.md` for repository-wide conventions, then use the domain files below for scoped project knowledge.

## Domains

- [Product](./product/index.md): Use for demo stories, acceptance QA, product boundaries, and non-goals.
- [Architecture](./architecture/index.md): Use for runtime boundaries, mobile coordination, worker design, and Open-AutoGLM integration.
- [Planning](./planning/index.md): Use for roadmap, sequencing, route comparison, and Grooming outputs.
- [Customer Android](./customer-android/index.md): Use for the customer APK, paired hosted API, same-phone execution loop, and runtime contract.

<!-- BEGIN:docs-generated-catalog -->
| File | Title | Description | Updated |
| --- | --- | --- | --- |
| ./DOCS.md | Project Knowledge Protocol | Repository-wide knowledge protocol for durable phone automation agent conventions. | 2026-06-13 |
| ./architecture/DOCS.md | Architecture Domain Protocol | Architecture-level conventions and decisions for the phone automation agent demo. | 2026-06-12 |
| ./architecture/android-on-device-executor.md | Android On-Device Executor | Architecture boundary for moving the Customer App Story from Mac worker and ADB to an Android app with strong permissions. | 2026-06-13 |
| ./architecture/first-demo-route.md | First Demo Route | Runtime shape for the first app-submitted phone automation demo. | 2026-06-09 |
| ./architecture/index.md | Architecture Docs | Map of architecture docs for runtime boundaries and integration choices. | 2026-06-12 |
| ./architecture/mobile-coordination.md | Mobile Coordination | Coordination rules for the phone app while the worker controls the same phone. | 2026-06-09 |
| ./architecture/open-autoglm-integration.md | Open-AutoGLM Integration | Durable integration boundaries for using Open-AutoGLM as the first automation engine. | 2026-06-14 |
| ./architecture/worker-api.md | Worker API | Public API and runtime modes for the Python Agent Runtime. | 2026-06-10 |
| ./customer-android/DOCS.md | Customer Android Domain Protocol | Domain-level conventions for the customer Android app and paired API. | 2026-06-14 |
| ./customer-android/action-handling.md | Customer Android Action Handling | V0 Open-AutoGLM action vocabulary, routine executor scope, and pause-state mapping for the customer Android route. | 2026-06-14 |
| ./customer-android/agent-engine.md | Customer Android Agent Engine | Runtime shape, environment contract, and session context behavior for apps/customer-android-api. | 2026-06-14 |
| ./customer-android/delivery.md | Customer Android Delivery | Alpha APK distribution, validation checkpoints, and QA gates for the customer Android route. | 2026-06-13 |
| ./customer-android/index.md | Customer Android Docs | Map of customer Android app and API docs. | 2026-06-14 |
| ./customer-android/runtime-boundary.md | Customer Android Runtime Boundary | Ownership boundary for the customer Android app, paired API, and reusable contracts. | 2026-06-13 |
| ./customer-android/runtime-contract.md | Customer Android Runtime Contract | V0 sessions and steps contract between the Android APK and Customer Android API. | 2026-06-13 |
| ./planning/DOCS.md | Planning Domain Protocol | Planning-level conventions for roadmap, sequencing, and grooming outputs. | 2026-06-13 |
| ./planning/index.md | Planning Docs | Map of planning docs for roadmap, sequencing, and grooming outputs. | 2026-06-13 |
| ./planning/roadmap.md | Customer App Roadmap | Sequencing roadmap for implementing the Customer App Story through hosted-agent first and single-app fallback routes. | 2026-06-13 |
| ./product/DOCS.md | Product Domain Protocol | Product-level conventions for the mobile phone automation demo. | 2026-06-13 |
| ./product/customer-app-story.md | Customer App Story | Product target and current gap for making phone automation usable as a customer-installed Android app. | 2026-06-13 |
| ./product/first-demo-story.md | First Demo Story | Acceptance QA story for the first Mobile Agent App version of the Open-AutoGLM quickstart. | 2026-06-10 |
| ./product/index.md | Product Docs | Map of product-level docs for demo stories and acceptance boundaries. | 2026-06-13 |
<!-- END:docs-generated-catalog -->
