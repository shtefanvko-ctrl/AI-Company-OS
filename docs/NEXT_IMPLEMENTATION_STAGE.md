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

## Verified RBAC scope reconciliation — 2026-10-06

PR #4 is synchronized with PR #2 head `fa4542aa83fe13ab3e2698d1092e22a100347f3d` and its diff is again limited to RBAC policy plus RBAC runtime tests. Company Memory schema/workflow files that entered the branch through merged PR #5 are no longer present in the PR #4 result tree. Reconciliation commit `e7eb4b2f8e7f6fe32ec7d487e1c042c2346784dd` passes Stage 1 7/7 and PostgreSQL SQL/RBAC HTTP 11/11. See [scope reconciliation evidence](runs/2026-10-06-pr4-scope-reconciliation.md). Memory remains a later, separately reviewable increment.

## Verified Company Memory schema increment — 2026-10-07

PR #7 restores Company Memory v1 as a schema-only increment on current PR #4 head `13e846f29f7fa8587bfffdd15f0e8cfc777df1b1`. Implementation commit `be14458c63bf83072d6b86f05efca54ed16aa312` adds the memory tables, provenance fields and tenant RLS contracts without exposing an HTTP API. It also explicitly revokes PUBLIC execution of `app.can_write_company_memory(uuid)` and verifies that privilege remains absent. Stage 1 passed 7/7; tenant and Memory RLS contracts passed; PostgreSQL HTTP runtime passed 11/11. See [Memory restoration evidence](runs/2026-10-07-memory-schema-restoration.md). This is a stacked PR result, not a merge, migration or deployment.

Feature Map: purpose — provenance-first, tenant-isolated Company Memory storage; entry point — PostgreSQL schema only (no HTTP API yet); data — `company_memories`, `memory_revisions`, `memory_evidence`, `memory_conflicts`, `working_memories`, `agent_checkpoints`; contract — `member`, `admin` and `owner` may insert only proposed, unverified, pending records, `viewer` is read-only, non-members are denied, and clients cannot directly canonicalize, verify, revise or update memory; dependencies — PR #2 PostgreSQL foundation and PR #4 RBAC; verification — tenant isolation, forged canonical/verified/revision/update denial, viewer/non-member denial and PUBLIC EXECUTE denial.

Next: human review/merge decision for PR #2, then PR #4, then PR #7. After those bases land, recreate the Company Memory HTTP API as a separate increment and verify its auth/policy/idempotency boundary. Production identity/key rotation plus migration/deployment gaps remain tracked by issue #1. PostgreSQL runtime verification remains CI-only.
