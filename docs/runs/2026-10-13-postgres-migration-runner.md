# PostgreSQL migration runner — 2026-10-13

## Problem and root cause

The PostgreSQL CI workflow invoked each SQL file with a separate hard-coded `psql -f` step. There was no durable version/checksum ledger or serialization, so concurrent deployment attempts could race and an edited already-applied file could not be distinguished from a valid replay.

## Change and acceptance

- ADR-002 defines a small runner using the repository's existing Node.js and `pg` stack.
- An explicit manifest orders migrations `001`, `002` and `003`.
- A transaction-scoped PostgreSQL advisory lock serializes migration batches.
- The private `ai_company_meta.schema_migrations` ledger records version, path, SHA-256 and application time with `PUBLIC` access revoked.
- Exact replays skip; version/path/checksum drift fails closed.
- All pending SQL and ledger writes share one transaction, so any failure rolls back the whole pending batch.
- The HTTP runtime never invokes or receives the privileges of the migration entry point.
- CI applies schema through `npm run migrate` before the unchanged tenant/Memory RLS and HTTP contracts.

No production database, deployment, PROPROGER code or customer data is touched.

## Verification

Final SHA and CI links are recorded after branch verification.

- Local `npm test`: **PASS**, 11/11, 0 failed.
- Local syntax checks for the runner, migration tests and existing touched runtime/test files: **PASS**.
- Local `git diff --check`: **PASS**.
- PostgreSQL clean install, exact replay, concurrent runner serialization, private-ledger privileges, drift, failed-batch rollback, RLS and HTTP runtime: **PENDING CI**.
- Production PostgreSQL, migration, deployment, merge and backup/restore drill: **NOT RUN**.

## Risk and rollback

The runner requires DDL authority, so accidentally wiring it into application startup would widen runtime privileges. ADR-002 and the implementation keep it as an explicit deployment command, while both HTTP servers remain unchanged.

Before any production migration, rollback is a reviewed revert of this PR. After a schema migration, reverting the runner does not revert schema or data; use an explicit reviewed forward-fix/down migration appropriate to the affected version.

## Remaining limitations

Production credential separation, connection-pool/deployment topology, backup/restore and release orchestration remain unverified. Transaction-incompatible PostgreSQL operations require a later explicit runner mode/ADR rather than weakening this contract.
