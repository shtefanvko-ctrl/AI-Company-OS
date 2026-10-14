# Company Memory verification lifecycle — 2026-10-14

## Problem and root cause

The Memory boundary could accept provenance-bearing proposals but intentionally denied every direct canonicalization attempt. No approved service function or API existed to complete the lifecycle, so a human-reviewed fact could not become canonical without bypassing the application contract.

## Change and acceptance

- Migration `004` adds `memory.verify` and a private tenant-scoped verification idempotency ledger.
- `POST /v1/organizations/:organizationId/memories/:memoryId/verify` accepts only a non-empty reason and `Idempotency-Key`.
- Both HTTP and PostgreSQL require current membership; PostgreSQL additionally requires `owner` or `admin` and enabled `memory.verify` before creation or replay.
- A target must be a fresh `proposed/unverified` fact in the path tenant.
- One transaction promotes the fact, writes verified human evidence, appends revision 2 and records `memory.verified` audit.
- Agents, members, viewers, foreign users, revoked members and disabled capabilities cannot approve or replay approval.
- The application role cannot read or mutate the private verification ledger or directly update Memory tables.

No production database, deployment, customer data or PROPROGER Execution Kernel code was touched.

## Verification

Implementation commit: `7f02e23d70017e3efc054f8d02f3864b087f384c`.
Runtime fix: `00c8a745b923706e50db43778230a05f58be375d`.

- Local `npm test`: **PASS**, 11/11.
- Local syntax checks for migration/store/server/test files: **PASS**.
- Local `git diff --check`: **PASS**.
- Initial PostgreSQL run [38506282325](https://github.com/shtefanvko-ctrl/AI-Company-OS/actions/runs/38506282325): **FAIL as evidence**, migrations and both RLS contracts passed; HTTP suite 19/21 exposed tenant-target FK ordering and an ambiguous PL/pgSQL column.
- Fixed Stage 1 run [38506431856](https://github.com/shtefanvko-ctrl/AI-Company-OS/actions/runs/38506431856): **PASS**, 11/11.
- Fixed PostgreSQL run [38506431853](https://github.com/shtefanvko-ctrl/AI-Company-OS/actions/runs/38506431853): **PASS**, migrations `001–004`, tenant RLS, Memory RLS and migration/HTTP runtime 21/21.
- Production PostgreSQL/migration, deployment, merge, browser E2E and backup/restore: **NOT RUN**.

PostgreSQL runtime ran only in the disposable GitHub Actions database.

## Risk and rollback

The primary risk is turning retrieved or agent-generated text into canonical Company Truth. The endpoint therefore accepts only the authenticated human subject, restricts approval to owner/admin, uses a separate capability, records the reason and actor, and never derives authority from Memory content. Brand facts are not changed silently: each canonical promotion is an explicit audited approval.

Before migration `004` is used outside CI, rollback is a reviewed revert of PR #11. After schema application, reverting runtime code does not remove the capability, helper or ledger; use an explicit reviewed down/forward-fix migration. Existing canonical facts and audit evidence must not be silently deleted.

## Remaining limitations

Production identity/JWKS, managed secrets, deployment credentials, background-job tenant isolation, backup/restore and conflict-resolution/supersede workflows remain unverified. PR #11 is stacked on the still-open PR #2 → #4 → #7 → #8 → #9 → #10 chain.
