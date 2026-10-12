# Authentication configuration reuse — 2026-10-12

## Problem and root cause

PR #9 validated the HMAC key ring when each HTTP server was created, but `verifyBearerAuthorization` validated and copied the complete ring again for every authenticated request. Exact `kid` lookup was O(1), yet the repeated preparation added O(n) work and allocation per request.

## Change and acceptance

- Server factories reuse one immutable auth configuration created by the existing fail-closed validator.
- A module-private brand prevents callers from forging a prevalidated configuration object.
- Raw `secret` or `keys` inputs remain compatible and are still fully validated.
- Passing both a validated configuration and raw credentials fails closed.
- JWT algorithm, signature, issuer, audience, subject, expiry and exact `kid` checks are unchanged.

No database, API payload, tenant policy, secret persistence or PROPROGER contract changed.

## Verification

Runtime/test commit: `d828435b701765b4be808d5c28555bfccfcae07a`.

- Local `npm test`: **PASS**, 11/11, 0 failed.
- Local `node --check` for `auth.mjs`, both servers and both auth HTTP test files, plus `git diff --check`: **PASS**.
- [Stage 1 run 38198995334](https://github.com/shtefanvko-ctrl/AI-Company-OS/actions/runs/38198995334): **PASS**, `npm test` completed successfully on the runtime SHA.
- [PostgreSQL run 38198995336](https://github.com/shtefanvko-ctrl/AI-Company-OS/actions/runs/38198995336): **PASS**, migrations, tenant RLS, Company Memory RLS and PostgreSQL HTTP runtime all completed successfully on the runtime SHA.
- Production identity provider, production secrets, production PostgreSQL, deployment and merge: **NOT RUN**.

PostgreSQL runtime remains restricted to the disposable GitHub Actions database.

## Risk and rollback

The main risk is accepting an unvalidated object as trusted auth configuration. A module-private `WeakSet` brand and regression tests make that path fail closed.

Rollback is a reviewed revert of the configuration-reuse commit. No schema or data rollback is required; reverting only restores the prior per-request validation overhead.
