# Authentication HMAC key rotation — 2026-10-11

## Problem and root cause

The Stage 1 bearer boundary verified every HS256 JWT with one `AUTH_HMAC_SECRET`, and issued test tokens had no `kid`. Replacing that secret therefore required an immediate all-session cutover. Keeping several secrets without a bound key ID would require fallback verification against every secret and make revocation ambiguous.

## Change and acceptance

- Added optional `AUTH_HMAC_KEYS` JSON configuration keyed by bounded JWT `kid` values.
- Key-ring mode requires an exact `kid` match and verifies with only that key.
- Active and explicitly retained previous keys are accepted during a bounded overlap window.
- Missing, unknown, removed and forged key IDs return HTTP 401.
- Empty, malformed, weak or simultaneous single-key/key-ring configuration fails before the server starts.
- Existing `AUTH_HMAC_SECRET` behavior remains available for compatible single-key deployments.
- Secret values are neither logged nor persisted in audit/Memory.

No database, tenant/RLS, API payload or PROPROGER contract changed.

## Verification

Runtime/test commit: `9f65c7c1326fb9612963f048c77c7fe5d4f7b2f0`.

- Local `npm test`: **PASS**, 10/10, 0 failed.
- Local `node --check` for `auth.mjs`, both servers and both changed test files: **PASS**.
- Local `git diff --check`: **PASS**.
- [Stage 1 run 38110186098](https://github.com/shtefanvko-ctrl/AI-Company-OS/actions/runs/38110186098): **PASS**, 10/10, 0 failed.
- [PostgreSQL run 38110186124](https://github.com/shtefanvko-ctrl/AI-Company-OS/actions/runs/38110186124): **PASS**, tenant RLS PASS, Company Memory RLS PASS, HTTP/runtime 16/16, 0 failed.
- Production identity provider, production secrets, production PostgreSQL, deployment and merge: **NOT RUN**.

PostgreSQL runtime was restricted to the disposable GitHub Actions database.

## Risk and rollback

Deployment risk is configuration drift: key-ring tokens require `kid`, and defining both auth modes is rejected. Roll out by publishing tokens with the active `kid`, retaining the previous key for no longer than the maximum token lifetime, then removing it.

Rollback is a reviewed revert of PR #9 and restoration of the prior single-key deployment setting. No data or schema rollback is required. Reverting removes safe overlap rotation and should not be done while clients depend on key-ring tokens.

## Remaining limitation

This increment supplies local verification-key rotation, not token issuance, external IdP/OIDC/JWKS validation or a managed Secret Vault. Those remain required before production identity is complete.
