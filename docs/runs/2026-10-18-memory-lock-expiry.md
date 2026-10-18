# Memory approval expiry during lock wait — 2026-10-18

## Context, priority and root cause

Continue PR #11 from `fd5606b83b804a254afbc44d34260fea3bb7e349`, base PR #10 `8cf425287898fccfba840eafab4b073c12ddbd0a`. Main: `807ee7a694177cece9b833b27aa667e2524e4c7f`. ADR-001/002 remain accepted. Main and the unmerged stack are not equivalent; Stage 1 production identity/JWKS, managed secrets, job isolation and operational recovery remain unfinished. PR #12 and PROPROGER are untouched.

P1 correctness of the existing approval boundary: `transaction_timestamp()` is fixed at BEGIN. A fact can expire while its approval waits for a row lock and still be promoted as fresh. This does not establish a tenant isolation breach. Migration 005 replaces only the freshness comparison with `clock_timestamp()` after the row lock; applied migration 004 is immutable. Existing evidence timestamps retain their previous transaction-time semantics.

## Acceptance and verification plan

A CI-only HTTP regression creates a fact with a database-derived five-second freshness window, holds its row lock without mutation, observes an approval SQL lock wait with transaction start before expiry, and releases only after database wall-clock expiry. Require HTTP 400 and unchanged proposed/unverified state, revision 1, zero verified evidence, approval audit and idempotency ledger records. Bounded polling uses the database clock; cleanup releases the lock even on assertion failure.

Local: `npm test` (11/11 PASS), `node --check platform/test/postgres-http.test.mjs`, `node --check platform/src/migrate.mjs`, `git diff --check`. PostgreSQL runtime is CI-only: `npm run migrate`, tenant RLS, Memory RLS and `npm run test:postgres`. Test-only SHA: `fd01089ae7cf363fb49605fb41cc3b2df2ea9d66`. Results and final exact-head CI links are recorded in the PR conversation after completion; pending runtime is UNVERIFIED.

Security self-review: function signature, SECURITY DEFINER search_path, tenant target lookup, membership/role/capability authorization, replay ordering, atomic writes and grants are unchanged. No new dependency, secret, network action or client data. Existing authorization denial, replay, audit rollback and two-tenant concurrent approval tests remain required. Background operations: NOT RUN (not implemented). Production DB/migrations/deployment/merge: NOT RUN. Standalone lint/coverage/browser E2E: not configured; backend-only change.

Test-first evidence: [PostgreSQL CI 39093124083](https://github.com/shtefanvko-ctrl/AI-Company-OS/actions/runs/39093124083) on `fd01089ae7cf363fb49605fb41cc3b2df2ea9d66` failed exactly the new lock-expiry test (`200 !== 400`), with 23/24 tests passing. This confirms the defect at runtime rather than inferring it solely from SQL.

## Rollback and limitations

Before application, revert this increment through review. After 005 has been applied, do not edit migration files or delete ledger rows: use a separately reviewed forward corrective migration. Restoring the 004 function would reintroduce this defect and is not a safe default. No data removal or production migration was performed.

This checks freshness at the approval decision after the row lock, not a promise that a fact stays fresh forever or until transaction commit. Authorized replay remains a replay of an already persisted approval. Next: human review of the stacked PR chain; external identity/JWKS; background-job isolation before adding jobs.
