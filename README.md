# AI Company OS

Business operating system layer built around a verified PROPROGER execution kernel.

## Architecture

Two-layer model:

- **Layer A — PROPROGER Execution Client**: pipeline, Project Brain, Product Brain, Decision Gate, Coder, SMM/Writer execution, visual engine, Artifact Vault, verification and recovery.
- **Layer B — AI Company OS Platform**: Company/Identity, Company Truth, Knowledge/Memory, CRM, Social/Inbox, Goals/Campaigns, Analytics/Pulse, policy/permissions, integrations, API/database/queues/secrets.

## Verified implementation baseline

The last verified PROPROGER implementation baseline recorded by Stage 0 is **v8.17.0** at commit `ec7894a — v8.17.0 goal closure`.

The v9 platform itself is **not yet a complete production implementation**. Stage 0 identifies reusable subsystems, partial areas and missing platform domains.

## P0 before real customer data/autopilot

Tenant isolation, RBAC, Secret Vault, audit, approval policy, idempotency, webhook security, backup/restore, observability, AI evals, cost limits and human handoff.

## Delivery rule

Do not rewrite the execution kernel. Build the company platform incrementally around verified existing subsystems and complete one full vertical slice before adding breadth:

`Company → Goal → Content → Social Adapter → Inbound → Contact/Lead → Pulse → Memory`
