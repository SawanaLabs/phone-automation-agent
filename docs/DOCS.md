---
title: Project Knowledge Protocol
description: Repository-wide knowledge protocol for durable phone automation agent conventions.
updateAt: 2026-06-09
---

# Project Knowledge Protocol

## Domain Language

- **Context Glossary**: `CONTEXT.md` is the canonical glossary for confirmed product terms; keep docs aligned with those terms.
- **First Demo Route**: The confirmed first implementation path for proving the mobile app story without building an on-device executor first.
- **Web Presence**: The browser surface may support presentation, downloads, and light management; it must not become the primary demo experience.

## Collaboration Conventions

- Start architecture work from `CONTEXT.md`, this file, and `docs/index.md` before making broad implementation choices.
- Prefer demo-first design that keeps Open-AutoGLM working with minimal custom code until the mobile story is proven.
- Use `uv` for Python environment and dependency work, with pnpm/Turborepo only orchestrating Python scripts when needed.
- Keep tests focused on core contracts: task API shape, event normalization, safety gates, and worker integration boundaries.
- Fail early on missing model keys, missing ADB devices, unreachable workers, unsupported apps, and invalid task state instead of silently masking the issue.

## Boundary Principles

- `apps/mobile` is the product-facing phone app. It owns task entry, task review, status presentation, confirmations, and takeover prompts.
- `apps/worker` is the Agent Runtime. It owns task execution, device access, Open-AutoGLM calls, event emission, and safety gates.
- `apps/web` is auxiliary. It can host landing, download, and light management surfaces, but it cannot serve as the fallback product experience.
- Open-AutoGLM should remain a thinly wrapped dependency during the first demo. Extracting or rewriting core automation code comes after the demo proves that pressure.
