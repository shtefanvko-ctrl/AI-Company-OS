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

Current verification: Company/capability contract tests plus bearer-auth regression tests run in CI. The HTTP contract no longer trusts `x-user-id`; non-health routes require a signed HS256 bearer session whose UUID `sub` becomes the user identity.

The in-memory harness remains a fast domain-contract test only. ADR-001 selects PostgreSQL as the canonical Stage 1 relational boundary, and the PostgreSQL HTTP runtime rechecks membership, role and capabilities below the route layer. External identity-provider integration is still pending.

## Bearer verification key rotation

Single-key development deployments may continue to use `AUTH_HMAC_SECRET` with at least 32 characters. Rotation-capable deployments configure `AUTH_HMAC_KEYS` as a JSON object whose keys are stable JWT `kid` values and whose values come from the deployment secret store:

```text
AUTH_HMAC_KEYS={"2026-10-active":"<32+ character secret>","2026-09-previous":"<32+ character secret>"}
```

In key-ring mode every JWT must carry a matching `kid`. Keep the previous key only for the bounded overlap window, then remove it to revoke remaining tokens signed with that key. Unknown, missing and removed key IDs fail closed; the verifier never tries every secret. `AUTH_HMAC_KEYS` and `AUTH_HMAC_SECRET` cannot be configured together.

## PostgreSQL migrations

`npm run migrate` applies the explicit Stage 1 migration manifest using `DATABASE_URL`. The runner holds a PostgreSQL advisory lock, writes version/path/SHA-256 metadata to the private `ai_company_meta.schema_migrations` ledger, skips exact replays and rejects checksum drift. It requires a deployment identity with DDL privileges and is never invoked by either HTTP server.

Applied migration files are immutable; add a new numbered migration for corrections. PostgreSQL runtime verification is currently restricted to the disposable CI database. Do not point the command at production until deployment credentials, backup/restore and rollback procedures are separately approved.

## Company Memory approval

Authenticated users can propose provenance-bearing facts through `POST /v1/organizations/:organizationId/memories`. Proposals remain unverified and non-canonical until an owner or admin with `memory.verify` explicitly calls `POST /v1/organizations/:organizationId/memories/:memoryId/verify` with an `Idempotency-Key` and a non-empty approval reason. The database independently rechecks tenant membership, role and capability, then commits the canonical state, verified evidence, revision and audit as one transaction.

Agents and retrieved text cannot call this lifecycle as an approval authority. Direct table updates remain unavailable to the application role, and expired facts must be proposed again rather than promoted.

## Architecture

- **Layer A — PROPROGER Execution Client**: pipeline, Project Brain, Product Brain, Decision Gate, Coder, SMM/Writer execution, visual engine, Artifact Vault, verification and recovery.
- **Layer B — AI Company OS Platform**: Company/Identity, Company Truth, Knowledge/Memory, CRM, Social/Inbox, Goals/Campaigns, Analytics/Pulse, policy/permissions, integrations, API/database/queues/secrets.

The last verified PROPROGER implementation baseline recorded by Stage 0 is **v8.17.0**, commit `ec7894a — v8.17.0 goal closure`.

## P0 before real customer data/autopilot

Tenant isolation at the database layer, external identity-provider/key rotation and full RBAC, Secret Vault, durable append-only audit, approval policy, idempotency persistence, webhook security, backup/restore, observability, AI evals, cost limits and human handoff.

## Delivery rule

Do not rewrite the execution kernel. Complete one real vertical slice before breadth:

`Company → Goal → Content → Social Adapter → Inbound → Contact/Lead → Pulse → Memory`
