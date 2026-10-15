# Memory approval role replay — 2026-10-15

## Scope

P2 verification gap: initial low-privilege approval denial was covered, but downgrade after a successful approval had no regression assertion. No runtime defect is claimed. Continue PR #11 from `defd0ac4bfbfb0e98e4383112a0b94d06d929b17`; main remains `4194fd02c626b976d931198461d8c7c2aa4cd0a6`. PR #12 adds skills on a separate child branch; its files are untouched.

## Acceptance

- Admin approval succeeds, then member and viewer downgrades deny both the persisted key and a new key with HTTP 403.
- Every denied request leaves canonical state, verification state, revision, evidence, audit and ledger counts unchanged.
- Restoring admin returns the original memory/revision as a duplicate, with no additional writes.
- Existing cross-tenant, capability-disabled, membership-revoked and rollback assertions remain intact.

## Verification

Commands: `npm test`, `node --check platform/test/postgres-http.test.mjs`, `git diff --check`. PostgreSQL `npm run test:postgres` and SQL tenant/Memory RLS contracts run only in GitHub Actions. Exact commit SHA, command results and final CI links are recorded in the PR conversation after checks finish; pending CI is UNVERIFIED, not DONE.

No runtime/schema changes, dependencies or secrets. Coverage tooling, lint and browser E2E are not configured and are not applicable to this test-only increment. Production, background-job runtime, deployment and merge: NOT RUN.

## Rollback and next step

Revert this test/documentation commit only; no data rollback is required. Human review of the stacked PR chain remains necessary. Production identity, managed secrets, background-job isolation and backup/restore remain open.
