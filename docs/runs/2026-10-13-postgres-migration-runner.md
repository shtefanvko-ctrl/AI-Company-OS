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

Runtime commit: `e4bbd4f0e1471b6591ce4d0810f5ed64a4fb7ac3`.
Concurrency/private-ledger test commit: `eefa19ac3dbadabc3c29b39ec35bcbd3b551083b`.

- Local `npm test`: **PASS**, 11/11, 0 failed.
- Local syntax checks for the runner, migration tests and existing touched runtime/test files: **PASS**.
- Local `git diff --check`: **PASS**.
- [Stage 1 run 38343017601](https://github.com/shtefanvko-ctrl/AI-Company-OS/actions/runs/38343017601): **PASS**, `npm test` 11/11.
- [PostgreSQL run 38343017622](https://github.com/shtefanvko-ctrl/AI-Company-OS/actions/runs/38343017622): **PASS**, clean manifest install, exact and concurrent replay, private-ledger privileges, checksum drift, failed-batch rollback, tenant RLS, Company Memory RLS and PostgreSQL test suite 19/19.
- Production PostgreSQL, migration, deployment, merge and backup/restore drill: **NOT RUN**.

## Risk and rollback

The runner requires DDL authority, so accidentally wiring it into application startup would widen runtime privileges. ADR-002 and the implementation keep it as an explicit deployment command, while both HTTP servers remain unchanged.

Self-review found that the first test set proved replay and drift but not the advisory lock itself. Commit `eefa19ac...` adds a deterministic two-connection race: exactly one runner applies and one skips, with one ledger row and no DDL conflict. It also proves the runtime role cannot use the metadata schema or read its ledger. No blocking or non-blocking findings remain.

PR review then found that per-migration success messages were emitted before the batch commit and could become false evidence after a later rollback. The runner now buffers applied/skipped results and logs them only after `COMMIT`; the failed-batch regression asserts that rollback emits no success message.

Before any production migration, rollback is a reviewed revert of this PR. After a schema migration, reverting the runner does not revert schema or data; use an explicit reviewed forward-fix/down migration appropriate to the affected version.

## Remaining limitations

Production credential separation, connection-pool/deployment topology, backup/restore and release orchestration remain unverified. Transaction-incompatible PostgreSQL operations require a later explicit runner mode/ADR rather than weakening this contract.
