# ADR-002 — Transactional PostgreSQL migration runner

Status: **accepted for the Stage 1 test and deployment boundary**

## Decision

Use a small Node.js migration runner built on the repository's existing `pg` dependency and an explicit ordered manifest.

The runner:

- obtains a PostgreSQL transaction-scoped advisory lock before inspecting or changing schema state;
- stores version, repository path, SHA-256 checksum and application time in `ai_company_meta.schema_migrations`;
- revokes `PUBLIC` access to the metadata schema and ledger;
- applies all pending migrations and ledger writes in one transaction;
- skips an exact replay and fails closed if a recorded version/path/checksum differs;
- never runs from the HTTP application startup path.

The deployment connection is a separate migration authority with the DDL privileges required by the migration files. The restricted `ai_company_app` runtime role must not receive those privileges.

## Why

Manual ordered `psql -f` calls do not record which content was applied, cannot detect edits to an already-applied file, and allow concurrent deployers to race. The existing Node/PostgreSQL stack is sufficient; adding a migration framework would introduce an unnecessary dependency before deployment topology is selected.

## Constraints

- Migration files in this manifest must be transaction-compatible; operations such as `CREATE INDEX CONCURRENTLY` require a later ADR/runner mode.
- Checksums make applied migration files immutable. Corrections are new migrations, not edits to deployed history.
- PostgreSQL runtime verification remains CI-only until separately authorized.
- This ADR does not select production hosting, pooling, backup/restore or release orchestration.

## Rollback

Reverting the runner does not roll back schema or data. A deployed schema change requires an explicit reviewed down/forward-fix migration appropriate to that change. Before production use, deployment credentials and rollback procedures require separate review.
