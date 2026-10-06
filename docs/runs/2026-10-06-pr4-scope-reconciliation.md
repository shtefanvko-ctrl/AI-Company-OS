# PR #4 RBAC scope reconciliation — 2026-10-06

## Task and root cause

Restore PR #4 to its declared RBAC-only scope and synchronize it with the latest PR #2 base. PR #5 had been merged into the branch used as PR #4's head, so PR #4 unintentionally included Company Memory schema, RLS tests and workflow changes. PR #4 was also ten commits behind PR #2.

## Expected result and acceptance

- Base head: `fa4542aa83fe13ab3e2698d1092e22a100347f3d`.
- Previous PR #4 head: `a171bfbd65ce5be2483abad203279a93d43d2c4d`.
- Preserve commit ancestry; no rebase or force-push.
- Final PR diff contains only `platform/db/001_company_foundation.sql` and `platform/test/postgres-http.test.mjs`.
- Company Memory files are absent from the PR #4 result tree.
- Stage 1, tenant/RLS and RBAC runtime contracts pass.

## Change

Reconciliation commit `e7eb4b2f8e7f6fe32ec7d487e1c042c2346784dd` has the former PR #4 head and current PR #2 head as parents. Its tree uses the current PR #2 base plus the previously verified RBAC SQL and PostgreSQL HTTP test files. This retains history while removing the later Memory increment from the delivered RBAC tree.

## Verification evidence

- PASS — base comparison: ahead, behind 0; changed files are exactly the two declared RBAC files.
- PASS — `npm test`: 7/7, 0 failed in [Stage 1 run 37407883060](https://github.com/shtefanvko-ctrl/AI-Company-OS/actions/runs/37407883060).
- PASS — SQL tenant/RLS contract in [PostgreSQL run 37407882991](https://github.com/shtefanvko-ctrl/AI-Company-OS/actions/runs/37407882991).
- PASS — `npm run test:postgres`: 11/11, 0 failed in the same PostgreSQL run, including all-role policy and downgrade/replay protection.
- NOT RUN — production PostgreSQL, migration, deployment and browser E2E. PostgreSQL runtime remains CI-only.

## Risk and rollback

The reconciliation changes only the PR result tree and stacked delivery shape; it does not introduce new RBAC behavior. The Memory commits remain reachable on the preserved Memory branches.

Rollback: revert the reconciliation commit through a reviewed commit. That would reintroduce Memory into PR #4 and make its diff exceed the declared scope; do not force-push.

## Next

Review/merge PR #2, then PR #4. After both bases land, open a clean Memory delivery PR from the preserved Memory branch and rerun its schema/API contracts.
