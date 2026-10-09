-- Company Memory API boundary: capability, atomic idempotency, revision and audit.
-- Requires platform/db/001_company_foundation.sql and 002_company_memory.sql.

INSERT INTO app.account_type_capabilities(account_type,capability_key) VALUES
 ('blogger','memory.write'),
 ('specialist','memory.write'),
 ('shop','memory.write'),
 ('company','memory.write'),
 ('hybrid','memory.write')
ON CONFLICT DO NOTHING;

INSERT INTO app.organization_capabilities(organization_id,capability_key)
SELECT id,'memory.write'
FROM app.organizations
ON CONFLICT DO NOTHING;

ALTER TABLE app.company_memories
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS idempotency_fingerprint jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS uq_company_memories_org_idempotency
  ON app.company_memories(organization_id,idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION app.can_write_company_memory(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
  SELECT app.current_org_role(p_organization_id) IN ('owner','admin','member')
    AND EXISTS (
      SELECT 1
      FROM app.organization_capabilities
      WHERE organization_id=p_organization_id
        AND capability_key='memory.write'
        AND enabled=true
    )
$$;

CREATE OR REPLACE FUNCTION app.propose_company_memory(
  p_organization_id uuid,
  p_content text,
  p_category text,
  p_source_type text,
  p_source_ref text,
  p_confidence numeric,
  p_metadata jsonb,
  p_observed_at timestamptz,
  p_fresh_until timestamptz,
  p_idempotency_key text
)
RETURNS TABLE(memory_id uuid,duplicate boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  v_user uuid := app.current_user_id();
  v_memory_id uuid;
  v_observed_at timestamptz := coalesce(p_observed_at,transaction_timestamp());
  v_fingerprint jsonb := jsonb_build_object(
    'content',p_content,
    'category',p_category,
    'source_type',p_source_type,
    'source_ref',p_source_ref,
    'confidence',p_confidence,
    'metadata',p_metadata,
    'observed_at_supplied',p_observed_at IS NOT NULL,
    'observed_at',p_observed_at,
    'fresh_until',p_fresh_until
  );
  v_saved app.company_memories%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'authenticated user required' USING ERRCODE='42501';
  END IF;
  IF btrim(coalesce(p_idempotency_key,'')) = '' OR length(p_idempotency_key) > 200 THEN
    RAISE EXCEPTION 'invalid idempotency key' USING ERRCODE='22023';
  END IF;
  IF p_source_type IS DISTINCT FROM 'user' OR btrim(coalesce(p_source_ref,'')) = '' THEN
    RAISE EXCEPTION 'user memory requires a source reference' USING ERRCODE='22023';
  END IF;
  IF btrim(coalesce(p_content,'')) = '' OR length(p_content) > 10000 THEN
    RAISE EXCEPTION 'invalid memory content' USING ERRCODE='22023';
  END IF;
  IF p_metadata IS NULL OR jsonb_typeof(p_metadata) <> 'object' OR pg_column_size(p_metadata) > 16384 THEN
    RAISE EXCEPTION 'invalid memory metadata' USING ERRCODE='22023';
  END IF;
  IF app.can_write_company_memory(p_organization_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'memory proposal denied' USING ERRCODE='42501';
  END IF;

  INSERT INTO app.company_memories(
    organization_id,content,category,source_type,source_ref,confidence,
    metadata,observed_at,fresh_until,created_by,idempotency_key,idempotency_fingerprint
  ) VALUES (
    p_organization_id,p_content,p_category,p_source_type,p_source_ref,p_confidence,
    p_metadata,v_observed_at,p_fresh_until,v_user,p_idempotency_key,v_fingerprint
  )
  ON CONFLICT (organization_id,idempotency_key)
    WHERE idempotency_key IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_memory_id;

  IF v_memory_id IS NULL THEN
    SELECT * INTO v_saved
    FROM app.company_memories
    WHERE organization_id=p_organization_id
      AND idempotency_key=p_idempotency_key;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'memory idempotency conflict could not be resolved' USING ERRCODE='40001';
    END IF;
    IF v_saved.idempotency_fingerprint IS DISTINCT FROM v_fingerprint
       OR v_saved.content IS DISTINCT FROM p_content
       OR v_saved.category IS DISTINCT FROM p_category
       OR v_saved.source_type IS DISTINCT FROM p_source_type
       OR v_saved.source_ref IS DISTINCT FROM p_source_ref
       OR v_saved.confidence IS DISTINCT FROM p_confidence
       OR v_saved.metadata IS DISTINCT FROM p_metadata
       OR (p_observed_at IS NOT NULL AND v_saved.observed_at IS DISTINCT FROM p_observed_at)
       OR v_saved.fresh_until IS DISTINCT FROM p_fresh_until THEN
      RAISE EXCEPTION 'idempotency key is already bound to a different memory proposal'
        USING ERRCODE='22023';
    END IF;

    RETURN QUERY SELECT v_saved.id,true;
    RETURN;
  END IF;

  -- Freshness is relative to the observation time chosen for a new fact.
  -- Persisted replays are validated against their stored fingerprint above;
  -- recomputing transaction_timestamp() must not invalidate an accepted key.
  IF p_fresh_until IS NOT NULL AND p_fresh_until < v_observed_at THEN
    RAISE EXCEPTION 'fresh_until precedes observed_at' USING ERRCODE='22023';
  END IF;

  INSERT INTO app.memory_revisions(
    organization_id,memory_id,revision_number,operation,content,metadata,
    canonical_state,verification_status,actor_type,actor_ref,provenance
  ) VALUES (
    p_organization_id,v_memory_id,1,'propose',p_content,p_metadata,
    'proposed','unverified','user',v_user::text,
    jsonb_build_object(
      'source_type',p_source_type,
      'source_ref',p_source_ref,
      'observed_at',v_observed_at,
      'fresh_until',p_fresh_until
    )
  );

  INSERT INTO app.audit_log(organization_id,user_id,event_type,payload)
  VALUES (
    p_organization_id,
    v_user,
    'memory.proposed',
    jsonb_build_object(
      'memory_id',v_memory_id,
      'category',p_category,
      'idempotency_key',p_idempotency_key
    )
  );

  RETURN QUERY SELECT v_memory_id,false;
END
$$;

REVOKE ALL ON FUNCTION app.can_write_company_memory(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.propose_company_memory(uuid,text,text,text,text,numeric,jsonb,timestamptz,timestamptz,text) FROM PUBLIC;
REVOKE INSERT ON app.company_memories FROM ai_company_app;

GRANT EXECUTE ON FUNCTION app.can_write_company_memory(uuid) TO ai_company_app;
GRANT EXECUTE ON FUNCTION app.propose_company_memory(uuid,text,text,text,text,numeric,jsonb,timestamptz,timestamptz,text) TO ai_company_app;
