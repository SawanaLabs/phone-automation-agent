---
title: Project Knowledge Protocol
description: Repository-wide knowledge protocol for durable phone automation agent conventions.
updateAt: 2026-06-13
---

# Project Knowledge Protocol

## Domain Language

- **Context Glossary**: `CONTEXT.md` is the canonical glossary for confirmed product terms; keep docs aligned with those terms.
- **First Demo Route**: The confirmed first implementation path for proving the mobile app story without building an on-device executor first.
- **Customer App Story**: The deliverable product story where an Android APK can automate the user's same physical phone without a manually run Mac worker.
- **Alpha Sideload APK**: The first MVP distribution artifact for internal QA on real Android phones; it is an installable APK, not an app-store AAB or production release.
- **Android On-Device Executor**: The future Android-side runtime needed for the Customer App Story if execution moves onto the user's phone.
- **Customer Android API**: The customer-story hosted Agent Runtime paired with the customer Android app; keep it separate from the experimental Mac worker route.
- **Customer App Roadmap**: The Planning domain roadmap that records route order, fallback conditions, and Grooming outputs for implementing the Customer App Story.
- **Web Presence**: The browser surface may support presentation, downloads, and light management; it must not become the primary demo experience.

## Collaboration Conventions

- Start architecture work from `CONTEXT.md`, this file, and `docs/index.md` before making broad implementation choices.
- Prefer demo-first design that keeps Open-AutoGLM working with minimal custom code until the mobile story is proven.
- Use `uv` for Python environment and dependency work, with pnpm/Turborepo only orchestrating Python scripts when needed.
- Keep tests focused on core contracts: task API shape, event normalization, safety gates, and worker integration boundaries.
- Fail early on missing model keys, missing ADB devices, unreachable workers, unsupported apps, and invalid task state instead of silently masking the issue.

## Boundary Principles

- `apps/mobile` is the current worker-backed demo companion. It owns task entry, task review, status presentation, confirmations, and takeover prompts for the Demo Build.
- `apps/worker` is the current Mac Agent Runtime. It owns task execution, device access, Open-AutoGLM calls, event emission, and safety gates for the Demo Build.
- `apps/customer-android-api` is the selected customer-story API boundary. It should be developed as the hosted runtime paired with `apps/customer-android`, not folded into the experimental worker by default.
- `apps/web` is auxiliary. It can host landing, download, and light management surfaces, but it cannot serve as the fallback product experience.
- Open-AutoGLM should remain a thinly wrapped dependency during the first demo. Extracting or rewriting core automation code comes after the demo proves that pressure.
- The customer-facing Android boundary now lives in `apps/customer-android` and `apps/customer-android-api`; keep it separate from the worker-backed demo companion unless a later architecture decision merges them.
- `docs/planning` owns roadmap and Grooming sequencing; when a route becomes accepted architecture, promote the decision into Product and Architecture docs.
