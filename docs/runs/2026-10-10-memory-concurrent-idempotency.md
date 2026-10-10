# Company Memory concurrent idempotency — 2026-10-10

## Problem and expected result

The Memory proposal helper used an organization-scoped unique index and `INSERT ... ON CONFLICT DO NOTHING`, but its HTTP contract had no reproducible concurrent-write regression. Sequential replay tests did not prove that simultaneous retries create one complete fact/revision/audit unit or that the same key remains independent between tenants.

Expected result: three identical proposals released concurrently in each of two organizations return one `201` creator and two `200` replays per organization, share one memory ID only inside that organization, and persist exactly one fact, revision and `memory.proposed` audit event. The two organizations must receive different IDs.

## Change

- Added a CI-only database barrier that waits through `pg_stat_activity` until every proposal is blocked at the Memory insert boundary.
- Added six concurrent HTTP requests: three per organization, using the same idempotency key and request body.
- Asserted response status/duplicate decisions, per-tenant IDs and exact fact/revision/audit row counts.
- No runtime, migration, schema or PROPROGER code changed.

## Verification

Test commit: `35b7599b3501b8f211dc79b1590f5cff4e4c0987`.

- Local `node --check platform/test/postgres-http.test.mjs`: **PASS**.
- Local `npm test`: **PASS**, 7/7, 0 failed.
- Local `git diff --check`: **PASS**.
- [Stage 1 run 38022539155](https://github.com/shtefanvko-ctrl/AI-Company-OS/actions/runs/38022539155): **PASS**, 7/7, 0 failed.
- [PostgreSQL run 38022539045](https://github.com/shtefanvko-ctrl/AI-Company-OS/actions/runs/38022539045): **PASS**, tenant RLS PASS, Company Memory RLS PASS, HTTP/runtime 15/15, 0 failed; the new concurrent test is test 14 and passed.
- Production PostgreSQL, migration, deployment and merge: **NOT RUN**.

PostgreSQL runtime was restricted to the disposable GitHub Actions database.

## Risk and rollback

Risk is limited to CI flakiness or future coupling to PostgreSQL activity text. The barrier uses an isolated random `application_name`, requires all six requests to reach the same lock wait, and has a bounded timeout instead of timing guesses.

Rollback is a reviewed revert of the test/evidence commits. No data or schema rollback is required.

## Next

After the stacked PRs receive human review and merge decisions, add the approval-gated verify/promote lifecycle without enabling direct canonicalization. Production identity/key rotation, a migration runner/pool and broader background-job isolation remain tracked by issue #1.
