---
name: company-os-postgres-rls
description: Design or audit PostgreSQL schema, migrations and row-level tenant isolation for AI Company OS.
version: 1.0.0
---
Treat organization/tenant id as a security boundary. Prefer transaction-safe, idempotent migrations. Verify CREATE/READ/UPDATE/DELETE cross-tenant denial, background-job context, forged organization_id and revoked membership. Never weaken RLS to make tests pass.
