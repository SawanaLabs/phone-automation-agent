---
title: Architecture Domain Protocol
description: Architecture-level conventions and decisions for the phone automation agent demo.
updateAt: 2026-06-09
---

# Architecture Domain Protocol

## Domain Language

- **Runtime Boundary**: The ownership line between the Mobile Agent App, Agent Runtime, Controlled Phone, and Web Presence.
- **Thin Worker Wrapper**: A worker integration that calls existing Open-AutoGLM behavior through a narrow task/event API before extracting or rewriting automation internals.

## Collaboration Conventions

- Preserve the app/worker split while staying pragmatic about demo implementation.
- Use local-network connectivity first. Avoid account systems, cloud relays, and device fleet abstractions until the demo requires them.
- Keep the worker API explicit: task creation, task state, event stream or polling, confirmation, and takeover completion.
- Borrow the Python monorepo app pattern from `apps/langgraph-agent-api` only where it fits: `uv`, a small API entry, Pydantic models, explicit auth/config errors, and focused contract tests.
- Do not copy deployment assumptions from `apps/langgraph-agent-api`; this worker needs local ADB access and should run on the Mac for the first demo.

## Boundary Principles

- Mobile owns user intent and user review.
- Worker owns automation execution and device access.
- Open-AutoGLM owns the first automation loop.
- Web stays auxiliary.
- Native Android extensions are acceptable later, but only after a concrete demo need justifies them.

## Decision Records

- **2026-06-09 first-demo-route**: Use an Android-first Expo development build app with a Mac-hosted Python worker and existing Open-AutoGLM ADB control loop for the first demo.
  Status: Accepted
  Context: The ultimate product must be a phone app, but full on-device phone automation has heavy Android permission and native-service costs. The Open-AutoGLM Android quickstart already works from the Mac with a real phone and Meituan task.
  Decision: Build the first acceptance route as a Single-Phone Demo: the phone app submits the task, the Mac worker controls that same phone through ADB/Open-AutoGLM, and the phone app remains the product surface for result review.
  Consequences: The app may be backgrounded while target apps run, so coordination must account for notifications and task-state reconciliation. On-device executor, overlay-first UI, cloud relay, and web fallback are deferred.
