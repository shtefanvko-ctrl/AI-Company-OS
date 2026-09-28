# AI Company OS

Business operating system layer built around a verified PROPROGER execution kernel.

## Current Stage 1 executable slice

The repository now contains a dependency-free Node.js contract harness for the Company boundary:

- organization creation with mandatory name + account type;
- account-type capability packs;
- membership-scoped organization context;
- cross-tenant context/audit denial;
- action → capability enforcement;
- organization-scoped idempotency;
- append-style audit events.

Run:

```bash
npm test
npm run start:contract
```

Current local verification: **4/4 Stage-1 tests PASS**.

This harness is deliberately not production auth/storage. The `x-user-id` header and in-memory store exist only to prove domain boundaries before selecting the production backend/database in an ADR.

## Architecture

- **Layer A — PROPROGER Execution Client**: pipeline, Project Brain, Product Brain, Decision Gate, Coder, SMM/Writer execution, visual engine, Artifact Vault, verification and recovery.
- **Layer B — AI Company OS Platform**: Company/Identity, Company Truth, Knowledge/Memory, CRM, Social/Inbox, Goals/Campaigns, Analytics/Pulse, policy/permissions, integrations, API/database/queues/secrets.

The last verified PROPROGER implementation baseline recorded by Stage 0 is **v8.17.0**, commit `ec7894a — v8.17.0 goal closure`.

## P0 before real customer data/autopilot

Tenant isolation at the database layer, real Auth/RBAC, Secret Vault, durable append-only audit, approval policy, idempotency persistence, webhook security, backup/restore, observability, AI evals, cost limits and human handoff.

## Delivery rule

Do not rewrite the execution kernel. Complete one real vertical slice before breadth:

`Company → Goal → Content → Social Adapter → Inbound → Contact/Lead → Pulse → Memory`
