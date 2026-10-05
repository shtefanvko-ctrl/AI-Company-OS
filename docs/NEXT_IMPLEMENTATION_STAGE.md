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

## Verified RBAC branch increment — 2026-10-04

PR #4 implements the minimal role policy for existing typed actions: `viewer` is read-only, while `member`, `admin` and `owner` may execute actions only when the organization capability also permits them. Runtime SHA `93fdac007607dad0ef3c31f1a510c146eef57875` additionally proves that a downgrade to `viewer` is revalidated for both persisted replays and fresh actions; restoring `member` returns the original action as an idempotent duplicate. SQL tenant contract and PostgreSQL HTTP tests 11/11 PASS; domain/auth tests 7/7 PASS. See [RBAC replay evidence](runs/2026-10-04-rbac-replay.md). This is stacked PR-branch evidence, not a merge or deployment claim.

Feature Map: purpose — organization-role write policy; entry point — `POST /v1/organizations/:id/actions`; data — `organization_members.role`, organization capabilities and action idempotency; contract — authenticated membership, known action type, allowed role and enabled capability are independently required on every request; dependencies — bearer auth, PostgreSQL RLS and PR #2 idempotency foundation; verification — all four roles plus role downgrade/replay/restore.

## Verified PR integration — 2026-10-05

PR #2 is synchronized with main commit `4194fd02c626b976d931198461d8c7c2aa4cd0a6` by merge commit `6591b6386110bbb71049efff6affc2e76da6b6e6`. There was no overlapping platform change: the inherited delta is only `.github/agents/product-manager.agent.md`. Stage 1 tests pass 7/7 and PostgreSQL SQL/HTTP runtime passes 9/9 in CI. See [integration evidence](runs/2026-10-05-pr2-main-sync.md). This restores a current, reviewable PR branch; it is not a merge to main or a deployment.

Next: human review/merge decision for PR #2; then review the stacked RBAC and Memory increments, and close production identity/key-rotation plus migration/deployment gaps tracked by issue #1. PostgreSQL runtime verification remains CI-only.
