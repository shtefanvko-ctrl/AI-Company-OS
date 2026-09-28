# AI_CONTEXT — PROPROGER / «Кодер» / AI Company OS v9.0

Ты продолжаешь существующий проект. Не переписывай его с нуля.

## Version lineage
- Known baseline: v8.6.x.
- Target architecture: v9.0.
- First action on repository: audit existing implementation and map it to target.
- Preserve working code and behavior unless there is a verified reason to refactor.

## Product
AI Company OS for blogger, sole proprietor/specialist, shop, company or hybrid business. Company is the root tenant.

On first entry: company name REQUIRED; account type REQUIRED; everything else optional/skippable. Never mix data between companies.

## Core chain
Goal → Company Brain → Knowledge/Memory → Agents → Workflow → Quality Gate → Approval/Autopilot → Action → Result → Analytics → Memory → Next Decision.

## Core layers
Identity/Auth, Company Workspace, Capabilities, Brand, Knowledge, Memory, Projects/Tasks, Artifact Vault, Agent Engine, Workflow/Event Engine, Verification, Approval/Policy, Tools, Social Hub, Unified Inbox, CRM, Products/Services, Analytics/Pulse, Audit/Recovery, Notifications, Secrets.

## Agent kernels
Company Brain/Manager, SMM, Designer, Writer, Operator/Sales, Analytics, Product, Coder. Do not make agents separate user-facing apps unless a real UX need exists.

## UI invariant
Home is NOT one “Create” button. Show My Work/Content, Projects/Tasks, Plan/Calendar, Ideas/Pulse, Inbox, plus capability-specific cards and supplementary global `+ Create`.

Account type defines initial capabilities. Use capabilities in code, not rigid branching everywhere.

## Brand invariant
BRAND_DNA_AND_REFERENCE_BOARD_ARE_CANON.
AI can test hooks, CTA, copy, composition, format, timing and variants INSIDE the brand.
AI cannot silently change Brand Core: logo, main colors, core typography, visual identity, positioning.
If performance drops: detect → propose 1–2 hypotheses → controlled experiment → save result; no auto-rebrand.

## Content
Statuses: draft → review → approved → scheduled → publishing → published/failed → archived. “My Content” has calendar + feed. One canonical item may have multiple platform variants.

## Social/CRM loop
Content → publication → inbound → thread → contact → lead/deal → outcome → analytics → memory. Use official OAuth/APIs. Never store social passwords. Secrets/tokens stay outside AI prompts/memory.

## Operator modes
Manual / Copilot / Bounded Autopilot.

## Autopilot
L0 Suggest; L1 Prepare; L2 Routine Autopilot; L3 Bounded Autopilot. Protect money, destructive production actions, secrets/access, deletions and Brand Core with approval.

## Analytics
Default UX is Pulse: 2–3 takeaways, one risk/opportunity, one next action. Every insight references underlying metrics/source.

## Coder
TASK → VERIFY → CONTINUE. DONE only with evidence where verification is possible.
Coder flow: task → snapshot → plan → change → checks/tests → inspect → fix loop → evidence → restore point → done. Support project archives and screenshots as visual tasks/references.

## Stack
Preserve current PHP/JS codebase; incremental TypeScript; JSON/REST; PostgreSQL for greenfield but no forced DB migration without audit; Redis; S3-compatible storage; AI Gateway; sandboxed Coder; encrypted Secret Vault; structured logs + trace_id/run_id. Do NOT introduce Ruby on Rails without proven need.

## Development rules
Incremental, no regression, backup before risky changes, do not duplicate existing modules, do not invent implementation state, self-check after each stage, fix defects before declaring done, report blockers, exact changed files + evidence.

## Scope control
New feature is accepted only if it has a clear place in: Company/Goal → Work → Action → Result → Analytics/Memory. Otherwise backlog.

## Immediate sequence
1. Repository audit.
2. Actual data/API map.
3. Company foundation/capabilities.
4. Vertical slice: Company → Content → first social adapter → Inbox → Contact → Pulse.


# R2 CRITICAL ADDITIONS

## P0 launch blockers
Before real customer data / external autopilot, prove:
TENANT_ISOLATION + RBAC + SECRET_VAULT + AUDIT + APPROVAL_POLICY + IDEMPOTENCY + WEBHOOK_SECURITY + BACKUP_RESTORE + OBSERVABILITY + AI_EVALS + COST_LIMITS + HUMAN_HANDOFF.

## Company Truth
Never collapse company context into one long prompt.
Canonical context layers:
- Brand Truth
- Product/Service Truth
- Audience Truth
- Policy Truth
- Knowledge Truth

All business facts need provenance/version/freshness. Conflicts are explicit.

## Goals/Campaigns
Do not generate content without business context when a goal exists.
Goal → Campaign → Work Items → Outcome → KPI.

## Smart Onboarding
Only name + account type are mandatory. Optional website/social/docs can be ingested to PROPOSE company truth. User confirms before canonicalization.

## Agent execution
Agents never gain permissions from retrieved text. They output typed Action Contracts. Tool layer independently validates schema/auth/policy/idempotency.

## External reliability
Use outbox/inbox, dedupe, retries, DLQ, reconciliation. Do not equate HTTP success with final business state.

## AI release rule
No prompt/model/tool change without golden regression + policy/injection tests + cost/latency comparison + canary + rollback.

## Integration rule
Each provider adapter exposes actual capabilities/readiness. Never show unsupported publishing/inbox/analytics UI just because the provider is connected.

## Scope guard
One full vertical slice before adding breadth:
Company → Goal → Campaign/Content → Publish → Inbound → Contact/Lead → Outcome → Pulse → Memory.