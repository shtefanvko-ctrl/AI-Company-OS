# Architecture Decision R3

## Decision
Use a two-layer architecture.

### Layer A — PROPROGER Execution Kernel
Existing Chrome Extension v8.17.0.

Responsibility: AI task execution, ChatGPT interaction, Coder, Writer/SMM execution, files/artifacts, visual tasks, verification, recovery and parallel safety.

### Layer B — AI Company OS Platform
New server-side business platform.

Responsibility: identity, organizations, capabilities, company knowledge/memory, CRM, integrations, social/inbox, analytics, policies and shared business state.

## Constraint
No backend framework is locked yet. Choose it by ADR after checking requirements and existing infrastructure.
