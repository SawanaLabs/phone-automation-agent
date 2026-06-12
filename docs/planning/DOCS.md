---
title: Planning Domain Protocol
description: Planning-level conventions for roadmap, sequencing, and grooming outputs.
updateAt: 2026-06-12
---

# Planning Domain Protocol

## Domain Language

- **Customer App Roadmap**: The staged plan for turning the Customer App Story into implementable work.
- **Hosted Agent Runtime Route**: The customer-app route where the Android app observes and executes on the user's phone while a hosted backend runs the Open-AutoGLM-style agent loop and returns actions.
- **Single-App Runtime Route**: The customer-app route where the Android app owns the agent loop and only calls a remote LLM API.
- **Human-in-the-loop Pause**: A task state where automation pauses at a gate action and waits for the user to continue or stop instead of silently executing the action.
- **Grooming Issue**: The large implementation issue to write after Grooming resolves the first route, acceptance story, and boundaries.

## Collaboration Conventions

- Keep planning docs focused on sequencing, route comparison, fallback conditions, and Grooming outputs.
- Do not treat a planning note as an implementation issue until the user explicitly says Grooming is complete.
- Record both acceptable routes when the user has not rejected either route; make the intended implementation order explicit.
- Prefer the route that extends the current architecture when it can still satisfy the Customer App Story.

## Boundary Principles

- Product docs define what must count as customer delivery.
- Architecture docs define runtime boundaries and hard technical constraints.
- Planning docs define route order, stage gates, and when to create implementation issues.
- When a route becomes selected architecture, update the relevant Product and Architecture docs instead of leaving the decision only in Planning.

## Update Triggers

- Update this domain when the Customer App Story implementation order changes.
- Update this domain when Grooming produces a new implementation issue, milestone, or fallback condition.
- Update this domain when a route becomes rejected, accepted, or superseded.
