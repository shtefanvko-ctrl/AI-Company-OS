# Changelog

- Added Memory approval replay regression for admin-to-member/viewer downgrade and admin restoration, asserting no additional evidence, revision, audit or idempotency records. See [run record](docs/runs/2026-10-15-memory-approval-role-replay.md).

## Unreleased — 2026-10-02

- Fixed concurrent action retries within an organization: the database now returns one persisted action ID and an atomic duplicate decision instead of surfacing unique-key errors.
- Preserved current membership/capability/type checks on every replay and the existing `app.accept_action(...) -> uuid` SQL contract.
- Bound each organization-scoped idempotency key to its original action type; replaying the key with another known, permitted type is rejected without action or audit writes.
- Added CI coverage for six concurrent HTTP requests across two tenants and rollback/retry when the action audit insert fails.
- Added a PostgreSQL HTTP regression for conflicting known action types. The test-only commit reproduced `202 !== 400`; the fixed runtime passes all nine PostgreSQL HTTP tests.
- Verified in PR #2; not merged or deployed. Evidence: [concurrency run](docs/runs/2026-10-02-concurrent-idempotency.md).
- Typed-idempotency evidence: [2026-10-03 run record](docs/runs/2026-10-03-typed-idempotency.md).
- Added a live PostgreSQL RBAC replay regression: downgrading `member` to `viewer` denies both a persisted idempotency-key replay and a fresh action without adding action/audit rows; restoring `member` preserves the original idempotent result.
- Verified on the PR #4 branch only; not merged or deployed. Evidence: [RBAC replay run](docs/runs/2026-10-04-rbac-replay.md).
- Synchronized PR #2 with main after Product Manager agent PR #3; merge commit `6591b6386110bbb71049efff6affc2e76da6b6e6` passed Stage 1 (7/7) and PostgreSQL tenant/runtime (9/9) CI. Evidence: [2026-10-05 integration run](docs/runs/2026-10-05-pr2-main-sync.md).
- Reconciled PR #4 with the latest PR #2 base and restored its RBAC-only diff after Memory schema had been merged into the RBAC branch; Stage 1 passed 7/7 and PostgreSQL RBAC runtime passed 11/11. Evidence: [2026-10-06 scope reconciliation](docs/runs/2026-10-06-pr4-scope-reconciliation.md).
- Restored Company Memory v1 as a clean schema-only PR on top of reconciled RBAC; explicitly revoked PUBLIC execution of the memory authorization helper and added a regression assertion. Evidence: [2026-10-07 Memory schema restoration](docs/runs/2026-10-07-memory-schema-restoration.md).
- Added the authenticated Company Memory propose/list API with strict provenance DTOs, `memory.write` capability, atomic idempotency/revision/audit persistence and fail-closed tenant checks. Evidence: [2026-10-08 Memory API boundary](docs/runs/2026-10-08-memory-api-boundary.md).
- Kept accepted Memory idempotency keys replayable after an implicit observation passes `freshUntil`, while continuing to reject new expired proposals. Evidence: [2026-10-09 Memory freshness replay](docs/runs/2026-10-09-memory-freshness-replay.md).
- Added deterministic PostgreSQL coverage proving that three concurrent identical Memory proposals collapse to one fact, revision and audit event per tenant, while the same idempotency key remains independently scoped across tenants. Evidence: [2026-10-10 Memory concurrency](docs/runs/2026-10-10-memory-concurrent-idempotency.md).
- Added fail-closed HMAC verification key rotation: JWT `kid` selects one active/previous key, unknown or removed keys are denied without fallback scanning, ambiguous configuration fails at startup and legacy single-key mode remains supported. Evidence: [2026-10-11 auth key rotation](docs/runs/2026-10-11-auth-key-rotation.md).
- Reused the immutable auth configuration validated at server startup so key-ring verification keeps O(1) key selection without rebuilding the full ring on every request. Evidence: [2026-10-12 auth configuration reuse](docs/runs/2026-10-12-auth-configuration-reuse.md).
- Added a transactional PostgreSQL migration runner with an explicit manifest, advisory lock, private SHA-256 ledger, exact replay and fail-closed drift detection; CI now exercises migrations through this boundary. Evidence: [2026-10-13 migration runner](docs/runs/2026-10-13-postgres-migration-runner.md).
- Added an approval-gated Company Memory verification endpoint: only owners/admins with `memory.verify` can atomically promote a fresh proposal with verified evidence, revision, audit and tenant-scoped idempotency. Evidence: [2026-10-14 Memory verification lifecycle](docs/runs/2026-10-14-memory-verification-lifecycle.md).
