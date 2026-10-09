# Company Memory freshness replay — 2026-10-09

## Problem and root cause

PR #8 accepted a proposal with omitted `observedAt` by storing the transaction time as `observed_at`. On a later identical replay, the helper recomputed that time before looking up the persisted idempotency key. Once `freshUntil` passed, the request failed `fresh_until precedes observed_at` instead of returning the original memory.

The defect was limited to replay ordering. Authorization still ran before replay and the tenant/RLS boundary was not bypassed.

## Change and acceptance

- Keep authentication, membership, writable role and `memory.write` validation before idempotency lookup.
- Keep the stored JSONB fingerprint as the exact replay contract.
- Apply the time-relative freshness comparison only after a request wins the new-row insert and before revision/audit writes.
- An identical authorized replay after the deadline returns the original memory with `duplicate=true`.
- A different key using the now-expired proposal remains invalid and leaves no fact, revision or audit row.

## Verification

Regression SHA `f727eede2c95863a4d191a9c8b43286566bb2478` added only the failing test.

- Stage 1 run 37878380493: **PASS**, `npm test` 7/7.
- PostgreSQL run 37878380464: **FAIL as expected**, tenant RLS PASS, Company Memory RLS PASS, HTTP/runtime 13/14; the freshness replay returned 400 instead of 200.

Exact-head fix CI is pending. PostgreSQL runtime is restricted to the disposable GitHub Actions database. Production migration, deployment and merge are not run.

## Risk and rollback

Risk: moving validation could accidentally persist a newly expired proposal. The database exception occurs in the same transaction and the regression asserts row/revision/audit counts remain unchanged.

Rollback: reviewed revert of this correction before migration/deployment. Reverting restores the replay defect but does not require a schema down migration.
