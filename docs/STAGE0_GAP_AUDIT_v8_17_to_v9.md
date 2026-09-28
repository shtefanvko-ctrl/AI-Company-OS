# AI COMPANY OS — STAGE 0 GAP AUDIT

Дата: 26.09.2026  
Проверенный репозиторий: `C:\Users\KARETA.KZ\proproger-local`  
Фактическая версия: **8.17.0**  
Git HEAD: `ec7894a — v8.17.0 goal closure`  
Состояние working tree на момент проверки: чистое.

## Executive result

Реальная база проекта — **v8.17.0**, а не v8.6.x. С этого момента Project Pack должен использовать v8.17.0 как implementation baseline.

Текущий PROPROGER — уже зрелое Chrome-extension ядро исполнения и оркестрации ChatGPT. Его нельзя переписывать ради AI Company OS. Его нужно сохранить как **Execution Kernel**, а бизнес-платформу v9.0 строить вторым слоем вокруг него.

DEV_CHECK фактически пройден:
- PROJECT_BRAIN_TEST: OK
- PRODUCT_BRAIN_TEST: OK
- DECISION_GATE_TEST: OK
- BRANCH_RECOVERY_TEST: OK
- AUTO_COMPLETION_TEST: OK
- GOAL_CLOSURE_TEST: OK
- VISUAL_BRAIN / SCREEN_INTERPRETER / VISUAL_TASK / VISUAL_AUDIT: OK
- FILE_LOCK / RESPONSE_BINDING / STAGE_ISOLATION: OK
- WORKER_SCHEDULER / RECOVERY: OK
- STATIC_AUDIT: OK
- DEV_CHECK: OK

## EXISTS — переиспользовать

### Execution Kernel
Файлы:
- `src/content.js`
- `src/background.js`
- `src/worker_scheduler.js`
- `src/file_locks.js`
- `src/file_lock_client.js`

Уже есть:
- pipeline;
- checkpoint/recovery;
- long-run handling;
- parallel safety;
- file locks;
- worker scheduling;
- response binding;
- stage isolation;
- failover.

### Project Brain
`src/project_brain.js`

Использовать как project-scoped canonical context под Company Brain.

### Product Brain
`src/product_brain.js`

Переиспользовать, но не путать с будущим Product/Service Truth Registry.

### Decision Gate
`src/decision_gate.js`

Уже есть material decision blocking и approval semantics.  
Не хватает organization policy, risk classes, budgets и external-action permission matrix.

### Artifact Vault / Chain
Уже подтверждены:
- Blob persistence;
- SHA-256;
- validation;
- lineage;
- ACTIVE pointer;
- rollback;
- F5 restore.

Это основа будущего Artifact Engine.

### Idempotency
Уже есть stage-level idempotency через `stageRunId + promptHash + ledger`.

Не хватает:
- external mutation idempotency;
- webhook dedupe;
- transactional outbox/inbox;
- reconciliation.

### Branch Recovery / Auto Completion / Goal Closure
Уже реализованы и покрыты тестами.

Для v9:
- Branch Recovery → workflow recovery;
- Auto Completion → bounded continuation;
- Goal Closure → evidence-based completion gate.

### Visual / Image-driven Programmer
Уже есть:
- `visual_brain.js`
- `reference_set.js`
- `screen_interpreter.js`
- `visual_task_engine.js`
- `visual_audit.js`

Сохраняем как основу Coder/Designer.

### SMM / Writer Creator Studios
Уже присутствуют:
- Brand DNA;
- Reference Board;
- content plan;
- SMM calendar;
- A/B/C gallery;
- Writer Book Bible;
- domain entities.

Но это пока creator-scoped, а не company-scoped.

## PARTIAL — поднять на уровень компании

### Brand
Brand DNA существует в SMM, но нет общего organization-level Brand Truth.

### Audience
Audience-концепции есть, но нет подтвержденного Audience Registry с provenance/versioning.

### Memory
Есть Project/Product Brain и IndexedDB state, но нет формальной Company Memory:
- scope;
- type;
- source;
- confidence;
- retention;
- conflict handling.

### Approval / Policy
Decision Gate есть, но нет общей policy для:
- SEND_EXTERNAL;
- PUBLISH;
- SPEND;
- DEPLOY;
- DELETE;
- MANAGE_ACCESS.

### Audit
Есть сильный execution audit/logging, но нет organization-wide append-only audit человеческих, AI и integration действий.

### Goals
Goal Closure есть, но это acceptance gate выполнения, а не бизнес-цель с baseline/target/KPI/period.

### Search
В старых версиях есть global search по текущему workspace/pipeline.  
Нет доказанного company-wide поиска по CRM/content/projects/artifacts/knowledge.

## MISSING — новый платформенный слой v9

По текущему `src` не найдено полноценной реализации:

- Company / Organization root;
- tenant isolation;
- capability engine;
- CRM;
- Contact;
- Lead / Deal;
- OAuth framework;
- Social Hub;
- Unified Inbox;
- business Workflow Engine;
- KPI;
- Analytics / Pulse;
- Secret Vault;
- webhooks;
- Company Knowledge service;
- Campaign domain;
- provider capability/readiness registry;
- entitlements / usage budgets;
- backend API;
- production DB schema для company/business entities.

Проверенный keyword scan:
- `company = 0`
- `organization = 0`
- `tenant = 0`
- `capability = 0`
- `crm = 0`
- `contact = 0`
- `deal = 0`
- `oauth = 0`
- `social = 0`
- `inbox = 0`
- `kpi = 0`
- `analytics = 0`
- `pulse = 0`
- `secret = 0`
- `webhook = 0`
- `workflow = 0`

Отдельные слова `lead`, `campaign`, `instagram`, `knowledge` встречаются, но не доказывают наличие соответствующих доменных модулей.

## Ключевой архитектурный вывод

`manifest.json` подтверждает, что текущий PROPROGER — Chrome Extension:
- `background.js` как service worker;
- content scripts на `chatgpt.com` / `chat.openai.com`;
- permissions для storage/downloads/tabs;
- отдельного application backend в этом репозитории не видно.

Следовательно, v9 надо строить как два слоя.

### Layer A — PROPROGER Execution Client
Сохраняем:
- pipeline;
- Project Brain;
- Product Brain;
- Decision Gate;
- Coder;
- SMM/Writer execution;
- visual engine;
- Artifact Vault;
- verification/recovery.

### Layer B — AI Company OS Platform
Добавляем:
- Company/Identity;
- Company Truth;
- Knowledge/Memory;
- CRM;
- Social/Inbox;
- Goals/Campaigns;
- Analytics/Pulse;
- policy/permissions;
- integration registry;
- API/database/queues/secrets.

Расширение становится execution client/worker системы, а не всей системой.

## Конфликты с предыдущим Master Pack

### C-01 Baseline
В пакете было v8.6.x.  
Факт: текущий репозиторий и DEV_CHECK — **v8.17.0**.

Решение: обновить baseline до v8.17.0.

### C-02 Backend stack
В пакете PHP/JS был описан слишком уверенно применительно к PROPROGER.

Факт: этот репозиторий — JS Chrome Extension. PHP backend здесь не подтвержден.

Решение: backend v9 не фиксировать окончательно, пока не проверено, существует ли уже отдельный server repo.

### C-03 Company Brain
Company Brain еще не существует.  
Project Brain + Product Brain — хорошие нижние слои, но не замена Company Brain.

### C-04 SMM
SMM Studio существует.  
Social OAuth/publishing/inbox/CRM loop — не доказаны.

## Target mapping

| Target v9 | Статус | Что переиспользовать |
|---|---|---|
| Execution Kernel | EXISTS | content/background/scheduler |
| Project Brain | EXISTS | project_brain.js |
| Product Brain | EXISTS | product_brain.js |
| Company Brain | MISSING | строить поверх существующих brains |
| Decision/Approval | PARTIAL | decision_gate.js |
| Artifact Engine | EXISTS/PARTIAL | Artifact Vault + Chain |
| Coder | EXISTS/PARTIAL | pipeline + visual engine |
| Writer | EXISTS/PARTIAL | Creator Studio |
| SMM | EXISTS/PARTIAL | Creator Studio |
| Brand Truth | PARTIAL | SMM Brand DNA |
| Audience Registry | PARTIAL | SMM audience context |
| Company Memory | PARTIAL | current scoped state/brains |
| Organization/Tenant | MISSING | — |
| Capabilities | MISSING | — |
| CRM | MISSING | — |
| Social Hub | MISSING | — |
| Unified Inbox | MISSING | — |
| Goals/KPI | PARTIAL/MISSING | Goal Closure != KPI |
| Campaigns | PARTIAL/MISSING | content-plan fragments |
| Analytics/Pulse | MISSING | — |
| OAuth/Secrets | MISSING | — |
| Workflow Service | PARTIAL/MISSING | pipeline != business workflow service |
| Audit Service | PARTIAL | execution logs/audits |
| AI Eval Harness | PARTIAL | strong deterministic tests, no full model/prompt golden suite |

## P0 order

1. Freeze v8.17.0 execution kernel.
2. Найти, существует ли отдельный backend/server repo.
3. Определить API boundary Extension ↔ Company OS.
4. Реализовать Company Foundation:
   - organization;
   - company profile;
   - account type;
   - capabilities;
   - membership;
   - tenant isolation.
5. Поднять контекст на company level:
   - Brand Truth;
   - Product/Service Truth;
   - Audience;
   - Knowledge;
   - Memory.
6. Подключить существующий Execution Kernel.
7. Сделать один полный vertical slice:

`Company → Goal → Content → 1 Social Adapter → Inbound → Contact/Lead → Pulse → Memory`

Не подключать все соцсети до прохождения этого цикла.

## Definition of Done — Stage 0

- [x] Репозиторий найден.
- [x] Версия проверена: 8.17.0.
- [x] Git baseline проверен.
- [x] DEV_CHECK пройден.
- [x] Reusable subsystems выявлены.
- [x] Target feature scan выполнен.
- [x] EXISTS / PARTIAL / MISSING mapping составлен.
- [x] Конфликт старого baseline найден.
- [ ] Master Pack обновлен до factual baseline v8.17.0.
- [ ] Проверено наличие отдельного backend/server repo.
- [ ] Выбран фактический API boundary v9.

## Следующие 3 шага

1. Найти на машине существующий backend/server проект PROPROGER, чтобы не создать второй параллельный backend.
2. Выпустить Project Pack R3 с baseline v8.17.0 и двухслойной архитектурой.
3. После этого начать Company Foundation.