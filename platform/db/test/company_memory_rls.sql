\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_ok boolean,p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_ok,false) THEN
    RAISE EXCEPTION 'assertion failed: %',p_message;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_memory_propose_denied(p_org uuid)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    INSERT INTO app.company_memories(
      organization_id,content,category,source_type,confidence,created_by
    ) VALUES (
      p_org,'denied memory','general','user',1.0,app.current_user_id()
    );
    RETURN false;
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN RETURN true;
  END;
END
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_canonical_insert_denied(p_org uuid)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    INSERT INTO app.company_memories(
      organization_id,content,category,source_type,confidence,
      verification_status,canonical_state,created_by
    ) VALUES (
      p_org,'forged canonical memory','knowledge','user',1.0,
      'verified','canonical',app.current_user_id()
    );
    RETURN false;
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN RETURN true;
  END;
END
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_verified_evidence_denied(p_org uuid,p_memory uuid)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    INSERT INTO app.memory_evidence(
      organization_id,memory_id,evidence_type,payload,
      verified,verified_by,verified_at,created_by
    ) VALUES (
      p_org,p_memory,'test','{"result":"PASS"}'::jsonb,
      true,app.current_user_id(),now(),app.current_user_id()
    );
    RETURN false;
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN RETURN true;
  END;
END
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_revision_insert_denied(p_org uuid,p_memory uuid)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    INSERT INTO app.memory_revisions(
      organization_id,memory_id,revision_number,operation,content,
      canonical_state,verification_status,actor_type,actor_ref
    ) VALUES (
      p_org,p_memory,1,'verify','forged revision',
      'canonical','verified','user',app.current_user_id()::text
    );
    RETURN false;
  EXCEPTION
    WHEN insufficient_privilege THEN RETURN true;
  END;
END
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_memory_update_denied(p_memory uuid)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    UPDATE app.company_memories SET content='mutated directly' WHERE id=p_memory;
    RETURN false;
  EXCEPTION
    WHEN insufficient_privilege THEN RETURN true;
  END;
END
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_memory_helper_denied(p_org uuid,p_source_type text)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    PERFORM app.propose_company_memory(
      p_org,'typed boundary test','knowledge',p_source_type,'contract-test',
      1.0,'{}'::jsonb,NULL,NULL,'typed-boundary-key'
    );
    RETURN false;
  EXCEPTION
    WHEN invalid_parameter_value OR insufficient_privilege THEN RETURN true;
  END;
END
$$;

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM information_schema.routine_privileges
    WHERE routine_schema='app'
      AND routine_name='can_write_company_memory'
      AND grantee='PUBLIC'
      AND privilege_type='EXECUTE'
  ),
  'memory authorization helper must not be executable by PUBLIC'
);
SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1
    FROM information_schema.routine_privileges
    WHERE routine_schema='app'
      AND routine_name='propose_company_memory'
      AND grantee='PUBLIC'
      AND privilege_type='EXECUTE'
  ),
  'memory proposal helper must not be executable by PUBLIC'
);

SET ROLE ai_company_app;
SELECT set_config('app.user_id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT (app.create_organization('Memory Company','company')).id AS org_a \gset

SELECT pg_temp.assert_true(
  pg_temp.expect_memory_helper_denied(:'org_a'::uuid,'agent'),
  'database helper must reject forged agent provenance independently of HTTP validation'
);

INSERT INTO app.company_memories(
  organization_id,content,category,source_type,source_ref,confidence,metadata,created_by
) VALUES (
  :'org_a'::uuid,
  'Brand core uses the approved identity.',
  'brand','user','memory-contract',1.0,
  '{"provenance":"contract-test"}'::jsonb,
  app.current_user_id()
)
RETURNING id AS memory_a \gset

SELECT pg_temp.assert_true(
  (SELECT count(*)=1 FROM app.company_memories WHERE id=:'memory_a'::uuid),
  'owner should see proposed memory'
);

SELECT pg_temp.assert_true(
  (SELECT canonical_state='proposed' AND verification_status='unverified'
   FROM app.company_memories WHERE id=:'memory_a'::uuid),
  'direct write must remain proposed and unverified'
);

INSERT INTO app.memory_evidence(
  organization_id,memory_id,evidence_type,source_ref,payload,created_by
) VALUES (
  :'org_a'::uuid,:'memory_a'::uuid,'user_statement','contract-test',
  '{"statement":"approved identity"}'::jsonb,app.current_user_id()
);

INSERT INTO app.working_memories(
  organization_id,agent_id,run_id,content,provisional_score,created_by
) VALUES (
  :'org_a'::uuid,'company-brain','run-memory-1','candidate fact',0.75,app.current_user_id()
);

INSERT INTO app.agent_checkpoints(
  organization_id,run_id,stage_key,input_hash,created_by
) VALUES (
  :'org_a'::uuid,'run-memory-1','collect-evidence','input-sha256',app.current_user_id()
);

SELECT pg_temp.assert_true(
  pg_temp.expect_canonical_insert_denied(:'org_a'::uuid),
  'application role must not self-canonicalize memory'
);
SELECT pg_temp.assert_true(
  pg_temp.expect_verified_evidence_denied(:'org_a'::uuid,:'memory_a'::uuid),
  'application role must not self-verify evidence'
);
SELECT pg_temp.assert_true(
  pg_temp.expect_revision_insert_denied(:'org_a'::uuid,:'memory_a'::uuid),
  'revisions must be service-managed append-only records'
);
SELECT pg_temp.assert_true(
  pg_temp.expect_memory_update_denied(:'memory_a'::uuid),
  'direct memory updates must be denied before lifecycle service functions exist'
);

RESET ROLE;

INSERT INTO app.organization_members(organization_id,user_id,role)
VALUES (:'org_a'::uuid,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','viewer');

SET ROLE ai_company_app;
SELECT set_config('app.user_id','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
SELECT pg_temp.assert_true(
  (SELECT count(*)=1 FROM app.company_memories WHERE organization_id=:'org_a'::uuid),
  'viewer should retain read access to company memory'
);
SELECT pg_temp.assert_true(
  pg_temp.expect_memory_propose_denied(:'org_a'::uuid),
  'viewer must not write company memory'
);

RESET ROLE;
UPDATE app.organization_members
SET role='member'
WHERE organization_id=:'org_a'::uuid
  AND user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

SET ROLE ai_company_app;
SELECT set_config('app.user_id','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
INSERT INTO app.company_memories(
  organization_id,content,category,source_type,confidence,created_by
) VALUES (
  :'org_a'::uuid,'member proposed fact','knowledge','user',0.8,app.current_user_id()
);
SELECT pg_temp.assert_true(
  (SELECT count(*)=2 FROM app.company_memories WHERE organization_id=:'org_a'::uuid),
  'member should be able to propose unverified memory'
);

RESET ROLE;
UPDATE app.organization_capabilities
SET enabled=false
WHERE organization_id=:'org_a'::uuid
  AND capability_key='memory.write';

SET ROLE ai_company_app;
SELECT set_config('app.user_id','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
SELECT pg_temp.assert_true(
  pg_temp.expect_memory_propose_denied(:'org_a'::uuid),
  'disabled memory.write capability must deny direct proposals'
);

RESET ROLE;
UPDATE app.organization_capabilities
SET enabled=true
WHERE organization_id=:'org_a'::uuid
  AND capability_key='memory.write';

SET ROLE ai_company_app;
SELECT set_config('app.user_id','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
SELECT pg_temp.assert_true(
  (SELECT count(*)=0 FROM app.company_memories WHERE organization_id=:'org_a'::uuid),
  'non-member must not see another tenant memory'
);
SELECT pg_temp.assert_true(
  pg_temp.expect_memory_propose_denied(:'org_a'::uuid),
  'non-member must not write another tenant memory'
);
SELECT pg_temp.assert_true(
  pg_temp.expect_memory_helper_denied(:'org_a'::uuid,'user'),
  'non-member must not bypass tenant policy through the proposal helper'
);

RESET ROLE;
SELECT 'AI Company OS Company Memory RLS contract: PASS' AS result;
