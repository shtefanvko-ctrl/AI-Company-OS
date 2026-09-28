# AI_CONTEXT R3 — PROPROGER / AI Company OS

## Verified baseline
Current repository: PROPROGER v8.17.0.
Git HEAD: ec7894a.
DEV_CHECK: PASS.

Do not rewrite the existing execution engine.

## Layer A — preserve
- execution pipeline;
- Project Brain;
- Product Brain;
- Decision Gate;
- Artifact Vault / Chain;
- stage idempotency;
- Branch Recovery;
- Auto Completion;
- Goal Closure;
- Visual/Image-driven Programmer;
- Worker Scheduler;
- Parallel Safety;
- Writer/SMM Creator Studios.

## Layer B — build
- Organizations / multi-tenant identity;
- account type + capabilities;
- Company Brain;
- Company Truth;
- Brand Truth;
- Product/Service Truth;
- Audience;
- Knowledge;
- Company Memory;
- CRM;
- Social Hub;
- Unified Inbox;
- Goals / Campaigns / KPI;
- Analytics / Pulse;
- Approval / Policy Engine;
- Integration Registry;
- Secret Vault;
- backend API;
- database;
- queues/events/webhooks.

## Hard boundary
Do not put CRM/OAuth/tenant/backend responsibilities directly into `content.js`.

Extension ↔ Platform must communicate through typed actions/API carrying organization_id, project_id, run_id, action_id, auth context, capability/policy decision, idempotency key and audit trace.

## First vertical slice
Company → Goal → Campaign/Content → 1 Social Adapter → Inbound → Contact/Lead → Outcome → Pulse → Memory.
