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

CREATE OR REPLACE FUNCTION pg_temp.expect_campaign_denied(p_org uuid)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    PERFORM app.accept_action(p_org,'CAMPAIGN.MANAGE','denied-capability');
    RETURN false;
  EXCEPTION
    WHEN insufficient_privilege THEN RETURN true;
  END;
END
$$;

SET ROLE ai_company_app;

SELECT set_config('app.user_id','11111111-1111-1111-1111-111111111111',false);
SELECT (app.create_organization('Company A','company')).id AS org_a \gset
SELECT pg_temp.assert_true(app.is_member(:'org_a'::uuid),'owner membership should be active');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM app.organizations),'owner should see exactly one organization');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM app.organization_members WHERE organization_id=:'org_a'::uuid),'owner membership row should be visible');
SELECT app.accept_action(:'org_a'::uuid,'CONTENT.PREPARE','same-key') AS action_a \gset
SELECT pg_temp.assert_true(app.accept_action(:'org_a'::uuid,'CONTENT.PREPARE','same-key')=:'action_a'::uuid,'idempotency must return the original action id');

RESET ROLE;
SET ROLE ai_company_app;
SELECT set_config('app.user_id','22222222-2222-2222-2222-222222222222',false);
SELECT (app.create_organization('Shop B','shop')).id AS org_b \gset
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM app.organizations),'second user should see only own organization');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM app.organizations WHERE id=:'org_a'::uuid),'cross-tenant organization must be hidden');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM app.audit_log WHERE organization_id=:'org_a'::uuid),'cross-tenant audit must be hidden');
SELECT pg_temp.assert_true(pg_temp.expect_campaign_denied(:'org_b'::uuid),'shop capability pack must deny campaign.manage');

RESET ROLE;
SELECT 'AI Company OS PostgreSQL tenant contract: PASS' AS result;
