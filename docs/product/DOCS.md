---
title: Product Domain Protocol
description: Product-level conventions for the mobile phone automation demo.
updateAt: 2026-06-09
---

# Product Domain Protocol

## Domain Language

- **Acceptance QA Story**: A user-visible story that must pass end to end before the demo route counts as working.
- **Quickstart App Version**: The already successful Open-AutoGLM Android quickstart reproduced through the Mobile Agent App rather than a terminal command.

## Collaboration Conventions

- Treat the first demo as an app-submitted mobile story, not a web console story.
- Keep the first acceptance story away from login, payment, captcha, account linking, and irreversible actions.
- Add new acceptance stories only when they prove a new product capability or reduce a real risk.

## Boundary Principles

- A task that only works from curl, terminal, or web is useful engineering evidence, but it does not satisfy the first product acceptance story.
- The first demo can depend on a Mac Agent Runtime because the product surface remains the Mobile Agent App on the phone.
