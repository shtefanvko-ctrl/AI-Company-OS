# Changelog

## Unreleased — 2026-10-02

- Fixed concurrent action retries within an organization: the database now returns one persisted action ID and an atomic duplicate decision instead of surfacing unique-key errors.
- Preserved current membership/capability/type checks on every replay and the existing `app.accept_action(...) -> uuid` SQL contract.
- Bound each organization-scoped idempotency key to its original action type; replaying the key with another known, permitted type is rejected without action or audit writes.
- Added CI coverage for six concurrent HTTP requests across two tenants and rollback/retry when the action audit insert fails.
- Added a PostgreSQL HTTP regression for conflicting known action types. The test-only commit reproduced `202 !== 400`; the fixed runtime passes all nine PostgreSQL HTTP tests.
- Verified in PR #2; not merged or deployed. Evidence: [concurrency run](docs/runs/2026-10-02-concurrent-idempotency.md).
- Typed-idempotency evidence: [2026-10-03 run record](docs/runs/2026-10-03-typed-idempotency.md).
