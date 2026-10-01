# Changelog

## Unreleased — 2026-10-02

- Fixed concurrent action retries within an organization: the database now returns one persisted action ID and an atomic duplicate decision instead of surfacing unique-key errors.
- Preserved current membership/capability/type checks on every replay and the existing `app.accept_action(...) -> uuid` SQL contract.
- Added CI coverage for six concurrent HTTP requests across two tenants and rollback/retry when the action audit insert fails.
- Verified in PR #2; not merged or deployed. Evidence: [concurrency run](docs/runs/2026-10-02-concurrent-idempotency.md).
