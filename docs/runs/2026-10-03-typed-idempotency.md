# Verification run — typed idempotency binding

Date: 2026-10-03  
Repository: `shtefanvko-ctrl/AI-Company-OS`  
Default branch at verification: `d2b80531eafdde0748e4d696be51973f4ae3ad01`  
PR: [#2](https://github.com/shtefanvko-ctrl/AI-Company-OS/pull/2)

## Selected defect

An organization-scoped idempotency key returned its persisted action ID even when an authorized retry supplied a different known action type. Membership, typed-action and capability validation ran, but the conflict path loaded only `action_id` and did not compare the stored `action_type` with the requested type.

Expected contract: one `(organization_id, idempotency_key)` is permanently bound to the action type that first claimed it. A same-type retry is idempotent; a different-type retry fails without new action or audit rows.

## Change

- Added a live PostgreSQL HTTP regression covering `CONTENT.PREPARE` followed by `CONTENT.REVIEW` with the same key.
- The conflict path now loads the saved action type and raises SQLSTATE `22023` when it differs.
- Existing membership, capability, tenant RLS, same-type retry, concurrency and audit rollback behavior is unchanged.

## Verification evidence

### Reproduction before the fix

- Test-only SHA: [`b351251226ccc8dacfbb7d78d9283a08cdfb82ef`](https://github.com/shtefanvko-ctrl/AI-Company-OS/commit/b351251226ccc8dacfbb7d78d9283a08cdfb82ef)
- [PostgreSQL tenant contract run 36961229184](https://github.com/shtefanvko-ctrl/AI-Company-OS/actions/runs/36961229184): **FAIL as expected**.
- Result: 8/9 passed; the new test received HTTP `202` instead of `400`.
- [Stage 1 contract checks run 36961229182](https://github.com/shtefanvko-ctrl/AI-Company-OS/actions/runs/36961229182): **PASS**.

### Runtime fix

- Fix SHA: [`d30dd5260dfd1bb8cee37774ac61fd124f0c0524`](https://github.com/shtefanvko-ctrl/AI-Company-OS/commit/d30dd5260dfd1bb8cee37774ac61fd124f0c0524)
- [PostgreSQL tenant contract run 37036127021](https://github.com/shtefanvko-ctrl/AI-Company-OS/actions/runs/37036127021): **PASS**.
- SQL tenant/RLS contract: **PASS**.
- PostgreSQL HTTP runtime: **9/9 PASS**, 0 failed, 0 skipped.
- [Stage 1 contract checks run 37036127300](https://github.com/shtefanvko-ctrl/AI-Company-OS/actions/runs/37036127300): **PASS**.

PostgreSQL was executed only in the disposable GitHub Actions test database. No production database, migration or deployment was touched.

## Scope and rollback

Changed behavior is limited to the existing action idempotency conflict path and its regression test. No dependency, table rewrite, public API shape or PROPROGER Execution Kernel change was introduced.

Rollback: revert `d30dd5260dfd1bb8cee37774ac61fd124f0c0524` together with its regression test only if the typed binding is intentionally removed. That rollback reintroduces the proven cross-type replay defect. Merge and deployment were not performed.

## Remaining limits

- PR #2 is not merged or deployed.
- Production migration/pool orchestration and external identity/key rotation remain open in issue #1.
- Stacked PRs #4–6 depend on PR #2's current head and require their own review/merge order.
