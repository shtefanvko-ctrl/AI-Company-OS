# ADR-001 — PostgreSQL foundation for Company boundary

Status: **accepted for Stage 1 foundation**

## Decision

Use PostgreSQL as the canonical relational store for the Company/Organization boundary.

Why this stage needs a real relational boundary:

- tenant isolation must be enforceable below the HTTP handler;
- membership/capability checks need transactional consistency;
- idempotency must survive process restarts;
- audit records must be durable;
- later CRM/Goals/Campaigns require relational constraints and queryability.

## Enforcement

The first migration uses PostgreSQL Row-Level Security for organization-scoped reads and SECURITY DEFINER functions for organization creation and action acceptance. Security-definer functions explicitly validate `app.user_id`, membership and capability rather than trusting request-supplied organization context.

The current Node in-memory harness remains a fast domain contract test; it is no longer the intended production persistence layer.

## Not solved by this ADR

- real identity provider / session validation;
- migrations runner and connection pooling;
- secrets management;
- database backup/restore;
- cross-region/HA;
- outbox/event delivery;
- production deployment topology.

Those remain separate implementation decisions.
