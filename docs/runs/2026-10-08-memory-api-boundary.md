# Company Memory API boundary — 2026-10-08

## Task and root cause

Restore the former Memory propose/list surface as a clean increment on current schema PR #7, while enforcing the platform rule that every external mutation independently passes typed input, authentication, tenant policy, capability, idempotency and audit checks.

The former PR #6 was merged only into an obsolete feature branch. Its API accepted no idempotency key, did not require a Memory capability, created no revision/audit event and silently ignored lifecycle fields. During the first exact-head CI run, the new database helper also exposed a concrete cross-tenant defect: `IF NOT app.can_write_company_memory(...)` did not enter the denial branch when the authorization function returned SQL `NULL` for a non-member.

## Change and acceptance

- Added additive migration `003_company_memory_api.sql`; immutable schema PR #7 migration `002` remains unchanged.
- Added `memory.write` to account-type capability packs and existing organizations.
- Added an organization-scoped idempotency index and SECURITY DEFINER proposal helper.
- The helper uses `IS NOT TRUE` for fail-closed authorization, validates the typed user-source contract independently of HTTP, and rechecks authorization before replay lookup.
- Revoked direct `INSERT` on `company_memories` from `ai_company_app`; all API-role proposals must pass the helper's idempotency/revision/audit boundary.
- Bound the exact request shape, including whether `observedAt` was supplied, in a JSONB idempotency fingerprint.
- A successful first proposal atomically creates a proposed/unverified fact, revision 1 and one `memory.proposed` audit event.
- HTTP validates UUID, payload fields, provenance, timestamps, metadata size, pagination and `Idempotency-Key`.
- Responses are explicit DTOs; internal creator/hash/idempotency fields are not returned.

Acceptance covers foreign organization IDs, forged lifecycle/agent fields, viewer, revoked membership, disabled capability, same-key replay, conflicting replay and audit failure rollback/retry. No canonicalization, verification, update or delete endpoint is introduced.

## Verification evidence

### Reproduction

- Test SHA: [`814a22d2596cfd9bc18f1b61e781437622836866`](https://github.com/shtefanvko-ctrl/AI-Company-OS/commit/814a22d2596cfd9bc18f1b61e781437622836866).
- [PostgreSQL run 37724421428](https://github.com/shtefanvko-ctrl/AI-Company-OS/actions/runs/37724421428): **FAIL as expected**, 12/13 HTTP tests; foreign-tenant proposal returned 201 instead of 403.
- SQL tenant and Memory RLS contracts already passed in that run, isolating the defect to the SECURITY DEFINER helper's explicit boolean branch.

### Fix

- Fix SHA: [`8a7a175060df08ff264a78eaf4c0f2f47dd35d54`](https://github.com/shtefanvko-ctrl/AI-Company-OS/commit/8a7a175060df08ff264a78eaf4c0f2f47dd35d54).
- [Stage 1 run 37724548751](https://github.com/shtefanvko-ctrl/AI-Company-OS/actions/runs/37724548751): **PASS**, `npm test` 7/7, 0 failed.
- [PostgreSQL run 37724548719](https://github.com/shtefanvko-ctrl/AI-Company-OS/actions/runs/37724548719): tenant RLS **PASS**, Company Memory RLS **PASS**, PostgreSQL HTTP **13/13 PASS**, 0 failed.
- Local `npm test`: **7/7 PASS**; three `node --check` commands and `git diff --check`: **PASS**.
- Coverage, standalone lint and browser E2E: **NOT RUN / not configured** for this backend-only repository slice.
- Production PostgreSQL, migration application, deployment and merge: **NOT RUN**. PostgreSQL runtime was executed only in the disposable CI database.

### Review hardening

GitHub review on `090147fc5fddd00594badd91e4392621a7f422fe` found two bypasses: direct table INSERT could skip helper guarantees, and an omitted `observedAt` could replay a key originally bound to an explicit timestamp. Commit `60d72d16603cc2105a3bbfa0d0790faa45c752d6` revoked direct INSERT and added request fingerprinting plus regressions.

[PostgreSQL run 37725195021](https://github.com/shtefanvko-ctrl/AI-Company-OS/actions/runs/37725195021) then failed before HTTP tests because the fixed SECURITY DEFINER search path intentionally could not resolve `public.digest`. The implementation retained the restricted search path and replaced the digest dependency with a directly comparable JSONB fingerprint.

- Runtime hardening SHA: [`f75c1718d14a567149aba4952ce3e81e0022d9c1`](https://github.com/shtefanvko-ctrl/AI-Company-OS/commit/f75c1718d14a567149aba4952ce3e81e0022d9c1).
- [Stage 1 run 37725298497](https://github.com/shtefanvko-ctrl/AI-Company-OS/actions/runs/37725298497): **PASS**, 7/7.
- [PostgreSQL run 37725298501](https://github.com/shtefanvko-ctrl/AI-Company-OS/actions/runs/37725298501): tenant RLS **PASS**, Company Memory RLS **PASS**, PostgreSQL HTTP **13/13 PASS**.

## Security review, limits and rollback

Bearer authentication precedes the route. HTTP and SQL both validate the typed contract; all SQL values are parameterized; authorization runs before idempotent replay; the helper is revoked from PUBLIC; direct table INSERT is revoked from the application role; the DTO excludes internal fields. Self-review and GitHub review findings were fixed before delivery.

PR #8 is stacked on unmerged PR #7 → PR #4 → PR #2. Production identity/key rotation and migration/deployment orchestration remain unresolved. This increment does not make Memory canonical or production-ready.

Rollback: reviewed revert of the PR #8 commits before migration `003` is applied. If already applied in a non-production test database, revert the API/runtime first; removing the nullable column/index/capability requires an explicit reviewed down migration. No production database was changed here.
