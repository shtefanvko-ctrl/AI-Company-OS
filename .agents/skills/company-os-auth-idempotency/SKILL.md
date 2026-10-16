---
name: company-os-auth-idempotency
description: Change authentication, HMAC key rotation, action policy or organization-scoped idempotency.
version: 1.0.0
---
Fail closed on unknown/revoked keys. Identity comes from verified bearer/session material, never client headers. Bind idempotency to organization + actor + action + request payload. Preserve replay conflict semantics and audit every accepted action.
