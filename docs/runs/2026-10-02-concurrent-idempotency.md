# Verification cycle — concurrent action idempotency

Date: 2026-10-02 (Asia/Almaty). Manual trial of the saved AI-Company-OS automation instructions; the scheduled trigger itself was not exercised.

## Selected increment

Continue [PR #2](https://github.com/shtefanvko-ctrl/AI-Company-OS/pull/2), whose recorded next increment was concurrent idempotency and atomic action/audit persistence. No competing PR was opened.

- Default branch at inspection: `d2b80531eafdde0748e4d696be51973f4ae3ad01`.
- Existing PR baseline: `9756bb70f25594e0fcea2f151a38462e48f012d6`.
- ADR-001 is already accepted; PostgreSQL foundation and bearer HTTP runtime exist. Stage 0's missing-feature list is a historical kernel audit, not the current platform implementation state.
- Priority: confirmed action API failure under concurrent retries, within the existing tenant foundation work.

## Findings and disposition

| ID | Finding | Decision | Result |
| --- | --- | --- | --- |
| F1 | Separate key lookup and insertion allow multiple transactions to observe an absent key; losing inserts raise `action_idempotency_pkey`. | FIX_NOW | Atomic conflict handling returns the persisted winning action. |
| F2 | The adapter's pre-read cannot reliably decide `duplicate` when another request commits later. | FIX_NOW | The database returns `action_id` and `duplicate` together. |
| F3 | Concurrent retries and audit-failure rollback lacked executable regression coverage. | FIX_NOW | Two live CI tests added; rollback behavior already worked before the fix. |

## Change and contract

`POST /v1/organizations/:id/actions` keeps the response `{actionId, duplicate}`. `app.accept_action_result` validates identity, membership, action type and capability before `INSERT ... ON CONFLICT DO NOTHING`. A losing request reads the committed winner in a separate statement under the runtime's default READ COMMITTED isolation. Only the creator writes `action.accepted`; the action and audit share the request transaction.

The existing `app.accept_action(uuid,text,text) -> uuid` function delegates to the same implementation for SQL callers. The new result helper revokes PUBLIC execution and explicitly grants execution to `ai_company_app`. RLS policies, table grants, parameterized queries and request-local role/user context are preserved.

The concurrency test holds a CI-only table lock until six HTTP requests reach the database. Each of two organizations sends three requests with the same key: all return 202, exactly one has `duplicate=false`, each tenant stores one action and one action audit, and the action IDs differ across tenants. The second test injects an audit constraint failure, checks complete rollback, then verifies a fresh retry and an idempotent replay.

## Verification evidence

| Check | Version / evidence | Result |
| --- | --- | --- |
| Regression before fix | `5a341a6223056a49ecb9a0c1613b4a718ac215c6`, [push run 36921713228](https://github.com/shtefanvko-ctrl/AI-Company-OS/actions/runs/36921713228) | Expected FAIL: concurrent requests returned `[400,202,400]`; 7/8 PostgreSQL tests passed. |
| Fixed source | `52f29fe0c42f3dcd6df76ea08555df8f8e69f637`, [push run 36922093394](https://github.com/shtefanvko-ctrl/AI-Company-OS/actions/runs/36922093394) | PASS: SQL tenant contract and 8/8 HTTP/runtime tests, no skips; PostgreSQL 17.11, Node 22. |
| PR merge candidate | [PostgreSQL run 36922101772](https://github.com/shtefanvko-ctrl/AI-Company-OS/actions/runs/36922101772), [Stage 1 run 36922101686](https://github.com/shtefanvko-ctrl/AI-Company-OS/actions/runs/36922101686) | PASS on source head `52f29fe0c42f3dcd6df76ea08555df8f8e69f637`. |
| Local `npm test` | Same source files | PASS: 7/7 domain/auth tests. |
| `node --check platform/src/postgres-store.mjs`, `node --check platform/test/postgres-http.test.mjs`, `git diff --check` | Same source files | PASS. |
| Security self-review | Parameterized values, role/GUC reset, unchanged RLS, authorization before replay, restricted helper execution | PASS for this change. |
| Coverage / standalone lint / browser E2E | No configured tooling in this repository | NOT RUN / not configured; no suppressions or new frameworks added. |
| PostgreSQL outside CI / production deployment / merge | User scope and automation boundaries | NOT RUN. |

This record cites the verified runtime commit. Any later documentation commit still requires its own latest-head CI check; the current result belongs in PR #2's verification section. A passing historical run is not evidence for a different runtime revision.

## Limits and rollback

Status: the selected runtime increment is verified in the PR branch. Production readiness remains incomplete under [issue #1](https://github.com/shtefanvko-ctrl/AI-Company-OS/issues/1). This run proves neither deployment nor the scheduled automation trigger.

An existing database needs the updated SQL functions installed before switching to the new adapter. No production migration runner was introduced or executed. The old scalar SQL signature is preserved; the fresh-install SQL contract passes in CI. Production upgrade/rollback orchestration remains unverified.

To back out, restore the adapter and SQL functions together from PR baseline `9756bb70f25594e0fcea2f151a38462e48f012d6`; reverting reintroduces the known concurrency defect. No stored table data needs deletion. Keep the regression test to expose that defect rather than treating rollback as a fix.

## Next three steps

1. **Priority:** review the verified PR #2 and make the human merge decision.
2. Specify and implement owner/admin/member/viewer RBAC under issue #1, with tenant/revocation regression tests in CI.
3. Complete the production identity/key-rotation and migration/pool deployment decisions before real customer data.
