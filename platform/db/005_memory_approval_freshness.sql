-- Freshness must be evaluated after approval lock waits.
-- Forward-only correction: migration 004 remains immutable.

CREATE OR REPLACE FUNCTION app.verify_company_memory(
  p_organization_id uuid,
  p_memory_id uuid,
  p_reason text,
  p_idempotency_key text
)
RETURNS TABLE(memory_id uuid,duplicate boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  v_user uuid := app.current_user_id();
  v_memory app.company_memories%ROWTYPE;
  v_saved app.memory_verification_idempotency%ROWTYPE;
  v_revision integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'authenticated user required' USING ERRCODE='42501';
  END IF;
  IF btrim(coalesce(p_idempotency_key,'')) = '' OR length(p_idempotency_key) > 200 THEN
    RAISE EXCEPTION 'invalid idempotency key' USING ERRCODE='22023';
  END IF;
  IF btrim(coalesce(p_reason,'')) = '' OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'verification reason required' USING ERRCODE='22023';
  END IF;
  IF app.can_verify_company_memory(p_organization_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'memory verification denied' USING ERRCODE='42501';
  END IF;

  -- Resolve the tenant-scoped resource before claiming the key so a caller
  -- cannot attach an approval ledger row to a memory from another company.
  PERFORM 1
  FROM app.company_memories AS candidate
  WHERE candidate.organization_id=p_organization_id
    AND candidate.id=p_memory_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'memory not found' USING ERRCODE='P0002';
  END IF;

  INSERT INTO app.memory_verification_idempotency(
    organization_id,idempotency_key,memory_id,reason,user_id
  ) VALUES (
    p_organization_id,p_idempotency_key,p_memory_id,p_reason,v_user
  )
  ON CONFLICT (organization_id,idempotency_key) DO NOTHING;

  IF NOT FOUND THEN
    SELECT * INTO v_saved
    FROM app.memory_verification_idempotency
    WHERE organization_id=p_organization_id
      AND idempotency_key=p_idempotency_key;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'memory verification idempotency conflict could not be resolved' USING ERRCODE='40001';
    END IF;
    IF v_saved.memory_id IS DISTINCT FROM p_memory_id
       OR v_saved.reason IS DISTINCT FROM p_reason THEN
      RAISE EXCEPTION 'idempotency key is already bound to a different memory verification'
        USING ERRCODE='22023';
    END IF;

    RETURN QUERY SELECT v_saved.memory_id,true;
    RETURN;
  END IF;

  SELECT * INTO v_memory
  FROM app.company_memories
  WHERE organization_id=p_organization_id
    AND id=p_memory_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'memory not found' USING ERRCODE='P0002';
  END IF;
  IF v_memory.canonical_state <> 'proposed' OR v_memory.verification_status <> 'unverified' THEN
    RAISE EXCEPTION 'memory is not pending verification' USING ERRCODE='22023';
  END IF;
  -- Recheck wall-clock freshness after acquiring the row lock; transaction
  -- time predates any lock wait and can incorrectly approve an expired fact.
  IF v_memory.fresh_until IS NOT NULL AND v_memory.fresh_until < clock_timestamp() THEN
    RAISE EXCEPTION 'stale memory cannot be verified' USING ERRCODE='22023';
  END IF;

  SELECT coalesce(max(revision.revision_number),0)+1 INTO v_revision
  FROM app.memory_revisions AS revision
  WHERE revision.organization_id=p_organization_id
    AND revision.memory_id=p_memory_id;

  UPDATE app.company_memories
  SET verification_status='verified',canonical_state='canonical',updated_at=transaction_timestamp()
  WHERE organization_id=p_organization_id
    AND id=p_memory_id;

  INSERT INTO app.memory_evidence(
    organization_id,memory_id,evidence_type,source_ref,payload,
    verified,verified_by,verified_at,created_by
  ) VALUES (
    p_organization_id,p_memory_id,'user_statement','approval:'||v_user::text,
    jsonb_build_object('reason',p_reason),true,v_user,transaction_timestamp(),v_user
  );

  INSERT INTO app.memory_revisions(
    organization_id,memory_id,revision_number,operation,content,metadata,
    canonical_state,verification_status,actor_type,actor_ref,reason,provenance
  ) VALUES (
    p_organization_id,p_memory_id,v_revision,'verify',v_memory.content,v_memory.metadata,
    'canonical','verified','user',v_user::text,p_reason,
    jsonb_build_object('approval','explicit','previous_revision',v_revision-1)
  );

  INSERT INTO app.audit_log(organization_id,user_id,event_type,payload)
  VALUES (
    p_organization_id,v_user,'memory.verified',
    jsonb_build_object(
      'memory_id',p_memory_id,
      'revision_number',v_revision,
      'idempotency_key',p_idempotency_key
    )
  );

  RETURN QUERY SELECT p_memory_id,false;
END
$$;

REVOKE ALL ON FUNCTION app.verify_company_memory(uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.verify_company_memory(uuid,uuid,text,text) TO ai_company_app;

