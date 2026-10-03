# Stage 1 — Platform Boundary + Company Foundation

## Work order

1. Backend ADR.
2. API boundary: auth, organization context, projects/runs, typed actions, artifacts, approvals, events, errors, idempotency.
3. Core schema: accounts, organizations, organization_profiles, organization_members, capabilities, organization_capabilities, projects, integration_connections, audit_log.
4. Security tests: cross-tenant read/write, forged organization_id, revoked membership, disabled capability, background-job tenant leakage.

## Definition of Done

- user creates organization;
- company name and account type are required;
- capability pack applied;
- user can switch organizations;
- data never crosses tenants;
- extension authenticates to platform;
- platform returns organization-scoped context;
- audit records organization/user/action;
- tests prove isolation.

## Verified branch increment — 2026-10-02

ADR-001 is already accepted. PR #2 now verifies tenant-scoped concurrent action retries and atomic action/audit rollback on runtime commit `52f29fe0c42f3dcd6df76ea08555df8f8e69f637`: SQL tenant contract PASS, PostgreSQL HTTP tests 8/8 PASS, domain/auth tests 7/7 PASS. See [run evidence](runs/2026-10-02-concurrent-idempotency.md). This is PR-branch evidence, not a merge or deployment claim.

The same PR also binds an idempotency key to the action type that first claimed it. Test-only commit `b351251226ccc8dacfbb7d78d9283a08cdfb82ef` reproduced the defect (`202 !== 400`); runtime fix `d30dd5260dfd1bb8cee37774ac61fd124f0c0524` passes the SQL tenant contract and PostgreSQL HTTP tests 9/9. See [typed-idempotency evidence](runs/2026-10-03-typed-idempotency.md). This remains PR-branch evidence only.

Next: review PR #2; then close the explicit RBAC, production identity/key-rotation and migration/deployment gaps tracked by issue #1. PostgreSQL runtime verification remains CI-only.
