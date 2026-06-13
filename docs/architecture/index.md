---
title: Architecture Docs
description: Map of architecture docs for runtime boundaries and integration choices.
updateAt: 2026-06-12
---

# Architecture Docs

## Subdomains

- [First Demo Route](./first-demo-route.md): Use when deciding how `apps/mobile`, `apps/worker`, and `apps/web` interact in the first demo.
- [Android On-Device Executor](./android-on-device-executor.md): Use when evaluating the customer-installable Android app route with AccessibilityService, MediaProjection, and strong permissions.
- [Mobile Coordination](./mobile-coordination.md): Use when handling notification, backgrounding, takeover, and overlay questions.
- [Open-AutoGLM Integration](./open-autoglm-integration.md): Use when wrapping or adapting the existing Open-AutoGLM framework.
- [Worker API](./worker-api.md): Use when running, testing, or extending the Python Agent Runtime endpoints.

<!-- BEGIN:docs-generated-catalog -->
| File | Title | Description | Updated |
| --- | --- | --- | --- |
| ./DOCS.md | Architecture Domain Protocol | Architecture-level conventions and decisions for the phone automation agent demo. | 2026-06-12 |
| ./android-on-device-executor.md | Android On-Device Executor | Architecture boundary for moving the Customer App Story from Mac worker and ADB to an Android app with strong permissions. | 2026-06-13 |
| ./first-demo-route.md | First Demo Route | Runtime shape for the first app-submitted phone automation demo. | 2026-06-09 |
| ./mobile-coordination.md | Mobile Coordination | Coordination rules for the phone app while the worker controls the same phone. | 2026-06-09 |
| ./open-autoglm-integration.md | Open-AutoGLM Integration | Durable integration boundaries for using Open-AutoGLM as the first automation engine. | 2026-06-12 |
| ./worker-api.md | Worker API | Public API and runtime modes for the Python Agent Runtime. | 2026-06-10 |
<!-- END:docs-generated-catalog -->
