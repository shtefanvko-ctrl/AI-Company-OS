# Verification run — RBAC replay revalidation

Date: 2026-10-04  
Repository: `shtefanvko-ctrl/AI-Company-OS`  
Default branch at verification: `d2b80531eafdde0748e4d696be51973f4ae3ad01`  
PR: [#4](https://github.com/shtefanvko-ctrl/AI-Company-OS/pull/4), stacked on PR #2

## Selected verification gap

PR #4 introduced role authorization for typed actions, but its original role matrix test used only fresh idempotency keys. It did not prove that an action saved while the user had write access could not be replayed after the membership role was downgraded to `viewer`.

Expected contract: current role authorization is evaluated on every request before the idempotency replay result is returned. A denied replay or fresh action must not add action or audit rows.

## Change

Added a live PostgreSQL HTTP regression that:

1. creates an action as `member`;
2. downgrades the same membership to `viewer`;
3. verifies HTTP 403 for the persisted replay and a fresh key;
4. verifies action/audit counts are unchanged;
5. restores `member` and verifies the saved action is returned with `duplicate: true` and the original action ID.

No runtime SQL, public API, dependency, schema or PROPROGER Execution Kernel code changed.

## Verification evidence

- Test SHA: [`93fdac007607dad0ef3c31f1a510c146eef57875`](https://github.com/shtefanvko-ctrl/AI-Company-OS/commit/93fdac007607dad0ef3c31f1a510c146eef57875)
- [PostgreSQL tenant contract run 37173486694](https://github.com/shtefanvko-ctrl/AI-Company-OS/actions/runs/37173486694): **PASS**.
- SQL tenant/RLS contract: **PASS**.
- PostgreSQL HTTP runtime: **11/11 PASS**, 0 failed, 0 skipped.
- [Stage 1 contract checks run 37173486699](https://github.com/shtefanvko-ctrl/AI-Company-OS/actions/runs/37173486699): **PASS**.
- Local `node --check platform/test/postgres-http.test.mjs`: **PASS**.
- Local `git diff --check`: **PASS**.
- Local `npm test`: **7/7 PASS**.

PostgreSQL was executed only in the disposable GitHub Actions test database. No production database, migration or deployment was touched.

## Scope and rollback

The increment adds regression coverage only. Rollback is the revert of test commit `93fdac007607dad0ef3c31f1a510c146eef57875` and this evidence update; doing so removes proof that role revocation is enforced on persisted replays but does not change runtime behavior.

## Remaining limits

- PR #2 and stacked PR #4 are not merged or deployed.
- Production identity/key rotation and migration/pool orchestration remain open in issue #1.
- Coverage, standalone lint and browser E2E tooling are not configured for this backend-only increment.
