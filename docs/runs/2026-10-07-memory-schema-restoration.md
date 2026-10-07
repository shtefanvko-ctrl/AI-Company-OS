# Company Memory schema restoration — 2026-10-07

## Task and root cause

Restore Company Memory v1 as a separately reviewable schema increment after its former PRs were merged only into stacked feature branches and PR #4 was reconciled back to RBAC-only scope. The preserved Memory branch no longer represented a clean deliverable on the current RBAC head.

A security review also found that PostgreSQL grants function execution to PUBLIC by default. The schema revoked table access but did not explicitly revoke PUBLIC execution of the SECURITY DEFINER authorization helper, leaving the fail-closed boundary dependent on schema privileges.

## Plan and acceptance

- Base: PR #4 head `13e846f29f7fa8587bfffdd15f0e8cfc777df1b1`.
- Restore only the Memory schema, Memory RLS contract and its CI step.
- Do not restore the HTTP API, embeddings, lifecycle automation or PROPROGER changes.
- Explicitly deny PUBLIC execution of the authorization helper.
- Acceptance: Stage 1 7/7, tenant RLS PASS, Memory RLS PASS, PostgreSQL HTTP runtime 11/11, and a diff limited to the declared schema increment plus evidence documents.

## Change

Implementation commit [`be14458c63bf83072d6b86f05efca54ed16aa312`](https://github.com/shtefanvko-ctrl/AI-Company-OS/commit/be14458c63bf83072d6b86f05efca54ed16aa312) restores:

- provenance-aware memory, revision, evidence, conflict, working-memory and checkpoint tables;
- tenant RLS and role-aware insert/read policies;
- rejection of client-forged canonical, verified, revision and update paths;
- `REVOKE ALL ON FUNCTION app.can_write_company_memory(uuid) FROM PUBLIC`;
- a regression assertion over `information_schema.routine_privileges`.

The HTTP API remains outside this increment.

## Verification evidence

Exact implementation SHA: `be14458c63bf83072d6b86f05efca54ed16aa312`.

- PASS — `npm test`: 7/7, 0 failed in [Stage 1 run 37566187316](https://github.com/shtefanvko-ctrl/AI-Company-OS/actions/runs/37566187316).
- PASS — SQL tenant/RLS contract in [PostgreSQL run 37566187338](https://github.com/shtefanvko-ctrl/AI-Company-OS/actions/runs/37566187338).
- PASS — Company Memory RLS contract, including PUBLIC EXECUTE denial, in the same PostgreSQL run.
- PASS — `npm run test:postgres`: 11/11, 0 failed in the same PostgreSQL run.
- NOT RUN — production PostgreSQL, production migration, deployment, Memory HTTP API and browser E2E. PostgreSQL runtime was executed only in the disposable CI database.

## Risk and rollback

The increment adds tables and policies only; no data migration or public HTTP contract is introduced. The main regression risk is an unintended privilege or RLS interaction, covered by both the existing tenant suite and the new Memory suite.

Rollback: revert the schema-restoration and evidence commits through a reviewed commit before any migration is applied. Do not force-push. No production database or deployment was changed in this run.

## Remaining limits and next step

PR #7 is stacked on unmerged PR #4, which is stacked on unmerged PR #2. Production identity/key rotation and migration orchestration remain unresolved. The next Memory increment should expose a minimal authenticated HTTP propose/list boundary only after its dependency chain is merged.
