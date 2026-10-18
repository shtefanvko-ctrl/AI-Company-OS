# Expired Memory approval — 2026-10-17

## Context and scope

P2 verification gap: migration 004 rejects stale approval, but no focused HTTP test proved the denial and rollback of the newly claimed key. No runtime defect is claimed. Continue PR #11 from `c0ae15a5bedf14d781a6c838b1d7640e7024a5b5`, base PR #10 `8cf425287898fccfba840eafab4b073c12ddbd0a`. Main remains `807ee7a694177cece9b833b27aa667e2524e4c7f`. ADR-001/002 remain accepted; no framework decision is reopened. PR #12 files are untouched.

## Acceptance

Create a historical proposal through HTTP using database-derived timestamps (observation two days ago, freshness deadline one day ago). Two approval attempts must return 400 with the stale-fact error, leaving proposed/unverified state, one proposal revision and zero verified evidence, approval audit and ledger records. Create a new current proposal and approve it using the rejected key: one non-duplicate success followed by a duplicate, with one evidence/audit/ledger and revision 2. The historical record remains unchanged. No sleeps or privileged fixture mutations are needed.

## Verification

Local commands: `npm test`, `node --check platform/test/postgres-http.test.mjs`, `git diff --check`. PostgreSQL migrations, tenant/Memory RLS and `npm run test:postgres` run only in disposable GitHub Actions. Final exact SHA/results/CI links are recorded in the PR conversation after completion; pending CI is UNVERIFIED.

Security self-review: no runtime, migration, capability, membership, secret or dependency changes. Existing access and concurrency regressions remain intact. Standalone coverage/lint/browser E2E tooling is not configured and is N/A to this test-only increment. Production PostgreSQL, merge, deployment, background jobs and backup/restore: NOT RUN.

## Rollback and limitations

Revert this test/documentation commit only; no data rollback. This test covers already-expired facts at approval start, not expiry while a transaction waits on a lock. Production identity/JWKS, managed secrets, job isolation and backup/restore remain open. Next priority: human review of the stacked PR chain.
