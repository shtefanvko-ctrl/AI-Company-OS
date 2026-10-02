-- Company Memory v1: tenant-scoped, provenance-first, fail-closed canonicalization.
-- Requires platform/db/001_company_foundation.sql.

CREATE OR REPLACE FUNCTION app.can_write_company_memory(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
  SELECT app.current_org_role(p_organization_id) IN ('owner','admin','member')
$$;

CREATE TABLE IF NOT EXISTS app.company_memories (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  content             text NOT NULL CHECK (btrim(content) <> ''),
  category            text NOT NULL DEFAULT 'general'
                      CHECK (category IN ('brand','product_service','audience','policy','knowledge','decision','task','outcome','general')),
  source_type         text NOT NULL
                      CHECK (source_type IN ('user','agent','artifact','integration','derived')),
  source_ref          text,
  confidence          numeric(5,4) NOT NULL DEFAULT 0.5000 CHECK (confidence >= 0 AND confidence <= 1),
  verification_status text NOT NULL DEFAULT 'unverified'
                      CHECK (verification_status IN ('unverified','verified','rejected')),
  canonical_state     text NOT NULL DEFAULT 'proposed'
                      CHECK (canonical_state IN ('proposed','canonical','superseded','deleted')),
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_at         timestamptz,
  fresh_until         timestamptz,
  superseded_by       uuid,
  content_hash        text GENERATED ALWAYS AS (
                        encode(digest(lower(btrim(content)),'sha256'),'hex')
                      ) STORED,
  created_by          uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id),
  CONSTRAINT company_memories_canonical_verified
    CHECK (canonical_state <> 'canonical' OR verification_status = 'verified'),
  CONSTRAINT company_memories_rejected_not_canonical
    CHECK (verification_status <> 'rejected' OR canonical_state <> 'canonical'),
  CONSTRAINT company_memories_superseded_requires_target
    CHECK (canonical_state <> 'superseded' OR superseded_by IS NOT NULL),
  CONSTRAINT company_memories_superseded_same_tenant
    FOREIGN KEY (organization_id,superseded_by)
    REFERENCES app.company_memories(organization_id,id)
);

CREATE INDEX IF NOT EXISTS idx_company_memories_org_state
  ON app.company_memories(organization_id,canonical_state,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_company_memories_org_category
  ON app.company_memories(organization_id,category,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_company_memories_org_hash
  ON app.company_memories(organization_id,content_hash);

CREATE TABLE IF NOT EXISTS app.memory_revisions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL,
  memory_id           uuid NOT NULL,
  revision_number     integer NOT NULL CHECK (revision_number > 0),
  operation           text NOT NULL
                      CHECK (operation IN ('propose','verify','update','supersede','reject','rollback','delete')),
  content             text NOT NULL CHECK (btrim(content) <> ''),
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  canonical_state     text NOT NULL
                      CHECK (canonical_state IN ('proposed','canonical','superseded','deleted')),
  verification_status text NOT NULL
                      CHECK (verification_status IN ('unverified','verified','rejected')),
  actor_type          text NOT NULL DEFAULT 'user'
                      CHECK (actor_type IN ('user','agent','system','integration')),
  actor_ref           text,
  reason              text,
  provenance          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,memory_id,revision_number),
  FOREIGN KEY (organization_id,memory_id)
    REFERENCES app.company_memories(organization_id,id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_memory_revisions_memory
  ON app.memory_revisions(organization_id,memory_id,revision_number DESC);

CREATE TABLE IF NOT EXISTS app.memory_evidence (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  memory_id       uuid NOT NULL,
  evidence_type   text NOT NULL
                  CHECK (evidence_type IN ('user_statement','artifact','integration','test','observation','derived')),
  source_ref      text,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  verified        boolean NOT NULL DEFAULT false,
  verified_by     uuid,
  verified_at     timestamptz,
  created_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id,memory_id)
    REFERENCES app.company_memories(organization_id,id) ON DELETE CASCADE,
  CONSTRAINT memory_evidence_verified_actor
    CHECK (
      (verified = false AND verified_by IS NULL AND verified_at IS NULL)
      OR
      (verified = true AND verified_by IS NOT NULL AND verified_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_memory_evidence_memory
  ON app.memory_evidence(organization_id,memory_id,created_at DESC);

CREATE TABLE IF NOT EXISTS app.memory_conflicts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL,
  memory_id             uuid NOT NULL,
  conflicting_memory_id uuid NOT NULL,
  status                text NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','resolved','dismissed')),
  resolution            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by            uuid NOT NULL,
  resolved_by           uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  resolved_at           timestamptz,
  FOREIGN KEY (organization_id,memory_id)
    REFERENCES app.company_memories(organization_id,id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id,conflicting_memory_id)
    REFERENCES app.company_memories(organization_id,id) ON DELETE CASCADE,
  CONSTRAINT memory_conflicts_distinct CHECK (memory_id <> conflicting_memory_id),
  CONSTRAINT memory_conflicts_resolution_shape CHECK (
    (status = 'open' AND resolved_by IS NULL AND resolved_at IS NULL)
    OR
    (status IN ('resolved','dismissed') AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_memory_conflicts_open
  ON app.memory_conflicts(organization_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS app.working_memories (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  agent_id            text NOT NULL CHECK (btrim(agent_id) <> ''),
  run_id              text NOT NULL CHECK (btrim(run_id) <> ''),
  content             text NOT NULL CHECK (btrim(content) <> ''),
  provisional_score   numeric(5,4) NOT NULL DEFAULT 0.5000 CHECK (provisional_score >= 0 AND provisional_score <= 1),
  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','promoted','discarded','expired')),
  promoted_memory_id  uuid,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at          timestamptz,
  created_by          uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id),
  FOREIGN KEY (organization_id,promoted_memory_id)
    REFERENCES app.company_memories(organization_id,id),
  CONSTRAINT working_memories_promoted_target CHECK (
    (status = 'promoted' AND promoted_memory_id IS NOT NULL)
    OR
    (status <> 'promoted' AND promoted_memory_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_working_memories_org_run
  ON app.working_memories(organization_id,run_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS app.agent_checkpoints (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  run_id          text NOT NULL CHECK (btrim(run_id) <> ''),
  stage_key       text NOT NULL CHECK (btrim(stage_key) <> ''),
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','running','verified','failed','blocked','rolled_back')),
  input_hash      text,
  output_hash     text,
  evidence        jsonb NOT NULL DEFAULT '{}'::jsonb,
  recovery        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,run_id,stage_key)
);

CREATE INDEX IF NOT EXISTS idx_agent_checkpoints_org_run
  ON app.agent_checkpoints(organization_id,run_id,updated_at DESC);

ALTER TABLE app.company_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.memory_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.memory_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.memory_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.working_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.agent_checkpoints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_memories_select ON app.company_memories;
CREATE POLICY company_memories_select ON app.company_memories
FOR SELECT TO ai_company_app
USING (app.is_member(organization_id));

DROP POLICY IF EXISTS company_memories_propose ON app.company_memories;
CREATE POLICY company_memories_propose ON app.company_memories
FOR INSERT TO ai_company_app
WITH CHECK (
  app.can_write_company_memory(organization_id)
  AND created_by = app.current_user_id()
  AND canonical_state = 'proposed'
  AND verification_status = 'unverified'
  AND superseded_by IS NULL
);

DROP POLICY IF EXISTS memory_revisions_select ON app.memory_revisions;
CREATE POLICY memory_revisions_select ON app.memory_revisions
FOR SELECT TO ai_company_app
USING (app.is_member(organization_id));

DROP POLICY IF EXISTS memory_evidence_select ON app.memory_evidence;
CREATE POLICY memory_evidence_select ON app.memory_evidence
FOR SELECT TO ai_company_app
USING (app.is_member(organization_id));

DROP POLICY IF EXISTS memory_evidence_add_unverified ON app.memory_evidence;
CREATE POLICY memory_evidence_add_unverified ON app.memory_evidence
FOR INSERT TO ai_company_app
WITH CHECK (
  app.can_write_company_memory(organization_id)
  AND created_by = app.current_user_id()
  AND verified = false
  AND verified_by IS NULL
  AND verified_at IS NULL
);

DROP POLICY IF EXISTS memory_conflicts_select ON app.memory_conflicts;
CREATE POLICY memory_conflicts_select ON app.memory_conflicts
FOR SELECT TO ai_company_app
USING (app.is_member(organization_id));

DROP POLICY IF EXISTS memory_conflicts_open ON app.memory_conflicts;
CREATE POLICY memory_conflicts_open ON app.memory_conflicts
FOR INSERT TO ai_company_app
WITH CHECK (
  app.can_write_company_memory(organization_id)
  AND created_by = app.current_user_id()
  AND status = 'open'
  AND resolved_by IS NULL
  AND resolved_at IS NULL
);

DROP POLICY IF EXISTS working_memories_select ON app.working_memories;
CREATE POLICY working_memories_select ON app.working_memories
FOR SELECT TO ai_company_app
USING (app.is_member(organization_id));

DROP POLICY IF EXISTS working_memories_create_pending ON app.working_memories;
CREATE POLICY working_memories_create_pending ON app.working_memories
FOR INSERT TO ai_company_app
WITH CHECK (
  app.can_write_company_memory(organization_id)
  AND created_by = app.current_user_id()
  AND status = 'pending'
  AND promoted_memory_id IS NULL
);

DROP POLICY IF EXISTS agent_checkpoints_select ON app.agent_checkpoints;
CREATE POLICY agent_checkpoints_select ON app.agent_checkpoints
FOR SELECT TO ai_company_app
USING (app.is_member(organization_id));

DROP POLICY IF EXISTS agent_checkpoints_create_pending ON app.agent_checkpoints;
CREATE POLICY agent_checkpoints_create_pending ON app.agent_checkpoints
FOR INSERT TO ai_company_app
WITH CHECK (
  app.can_write_company_memory(organization_id)
  AND created_by = app.current_user_id()
  AND status = 'pending'
  AND evidence = '{}'::jsonb
);

REVOKE ALL ON app.company_memories,app.memory_revisions,app.memory_evidence,app.memory_conflicts,app.working_memories,app.agent_checkpoints FROM PUBLIC;

GRANT SELECT ON app.company_memories,app.memory_revisions,app.memory_evidence,app.memory_conflicts,app.working_memories,app.agent_checkpoints TO ai_company_app;
GRANT INSERT ON app.company_memories,app.memory_evidence,app.memory_conflicts,app.working_memories,app.agent_checkpoints TO ai_company_app;
GRANT EXECUTE ON FUNCTION app.can_write_company_memory(uuid) TO ai_company_app;
