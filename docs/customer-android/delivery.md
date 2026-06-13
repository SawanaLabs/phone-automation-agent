---
title: Customer Android Delivery
description: Alpha APK distribution, validation checkpoints, and QA gates for the customer Android route.
updateAt: 2026-06-13
---

# Customer Android Delivery

## Scope

- Covers Alpha Sideload APK distribution, signing, validation checkpoints, and QA gates for `apps/customer-android`.
- Applies to internal QA for the Customer App Story.
- Excludes Play Store submission, AAB packaging, public beta, production support, and long-term account management.

## Domain Language

- **Alpha Sideload APK**: The first internal QA artifact users install directly on Android phones to validate the Customer App Story.
- **Official Alpha APK**: The GitHub Release APK signed with the project release keystore.
- **Developer Build**: A locally built APK from source that may use a different signing identity and may not upgrade over the Official Alpha APK.
- **Agent-verifiable Device QA**: Physical-device validation run by the implementation agent when a connected Android phone is available.
- **Browser Acceptance**: The issue completion gate where Browser tooling exercises the developed local/dev surface against the issue user story.

## Current Subdomain Docs

- The first user-downloadable artifact is an Alpha Sideload APK for internal QA, not an AAB, Play Store submission, public beta, or production release.
- Publish the Official Alpha APK through GitHub Release.
- Include release notes, install instructions, required permission setup, known limitations, commit hash, checksum, and APK signature certificate fingerprint.
- Sign the Official Alpha APK with a project release keystore. Keep the release keystore and passwords out of git, issues, release assets, and docs.
- Source-built APKs are Developer Builds. They may require uninstalling the Official Alpha APK first because Android requires matching package name and signing identity for upgrades.
- The first customer path must complete without a manually run Mac worker.
- Every issue that claims a working customer path must include Browser Acceptance.
- Physical-device slices that claim same-phone execution must also include Agent-verifiable Device QA when a connected Android phone is available.

## First Validation Checkpoints

- The Android app detects whether its AccessibilityService is enabled.
- The Android app can start a MediaProjection session and capture a screen frame.
- The Android app can execute deterministic local actions: tap, swipe, back, home, wait, launch, and text input.
- The hosted runtime and Android app can parse the full Open-AutoGLM default Chinese action vocabulary, even when some actions are routed to pause, fail, trace, or backend handling in V0.
- The app can enter `takeover_required`, `interaction_required`, and `confirmation_required` states, then either continue from the next captured screen state or stop the task clearly.
- The hosted endpoint can return a normalized Open-AutoGLM-compatible action for one captured screen.
- The app and backend can complete the first Customer App acceptance story without a Mac worker.

## Out Of Scope For First Alpha

- Payment, login, captcha, irreversible account changes, and broad account mutations.
- Play Store policy completion, AAB packaging, public distribution, and production support.
- Per-user accounts, per-install token management, durable audit history, and quota dashboards.

## Decision Records

- **2026-06-13 alpha-github-release-contract**: Use GitHub Release as the first Alpha Sideload APK distribution path.
  Status: Accepted
  Context: The project needs a simple closed-loop QA path where internal users can download an APK, install it on a real phone, and validate the Customer App Story.
  Decision: Publish signed Alpha Sideload APKs through GitHub Release with release notes, checksum, signing certificate fingerprint, install instructions, and known limitations.
  Consequences: The MVP can validate customer installation and same-phone automation without app-store review, while keeping production release work out of scope.

## Update Triggers

- Update this file when the Alpha APK release channel, signing process, or artifact naming changes.
- Update this file when Browser Acceptance or Device QA gates change.
- Update this file when Play Store, AAB, public beta, or production support enters scope.
