---
title: Product Domain Protocol
description: Product-level conventions for the mobile phone automation demo.
updateAt: 2026-06-12
---

# Product Domain Protocol

## Domain Language

- **Acceptance QA Story**: A user-visible story that must pass end to end before the demo route counts as working.
- **Quickstart App Version**: The already successful Open-AutoGLM Android quickstart reproduced through the Mobile Agent App rather than a terminal command.
- **Customer App Story**: The desired product story where a user installs an Android app on their own physical Android phone, enters an instruction, and starts automation of that same phone from the app.
- **Full Access Mode**: The first customer-story posture where routine automation proceeds after explicit setup permission grants without per-step approval prompts.

## Collaboration Conventions

- Treat the first demo as an app-submitted mobile story, not a web console story.
- Keep the first acceptance story away from login, payment, captcha, account linking, and irreversible actions.
- Add new acceptance stories only when they prove a new product capability or reduce a real risk.
- Do not describe the current APK as customer-distributable unless the runtime, device control, and model credentials have a customer-ready setup path.
- For the first Customer App Story MVP, prefer a runnable Full Access Mode over a large approval system. Keep irreversible operations out of scope until the basic story works.

## Boundary Principles

- A task that only works from curl, terminal, or web is useful engineering evidence, but it does not satisfy the first product acceptance story.
- The first demo can depend on a Mac Agent Runtime because the product surface remains the Mobile Agent App on the phone.
- The current Mobile Agent App alone is not a standalone customer product; real execution still lives in the Mac Agent Runtime with ADB, Open-AutoGLM, model credentials, and local connection requirements.
- A cloud device fleet is a different product story unless it still controls the user's same physical Android phone.
- The repository should treat Customer App Story completion as the delivery line. The current worker-backed APK does not cross that line.
