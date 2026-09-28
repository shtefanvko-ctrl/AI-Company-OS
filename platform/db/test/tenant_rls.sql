\set ON_ERROR_STOP on

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
SELECT app.current_user_id() AS current_user_id, :'org_a'::uuid AS org_a, app.is_member(:'org_a'::uuid) AS member_check;
SELECT count(*) AS visible_memberships FROM app.organization_members WHERE organization_id=:'org_a'::uuid;
SELECT count(*) AS visible_organizations FROM app.organizations;
SELECT CASE WHEN count(*)=1 THEN 1 ELSE 1/0 END AS own_org_visible
FROM app.organizations;
SELECT CASE WHEN count(*)=1 THEN 1 ELSE 1/0 END AS own_membership_visible
FROM app.organization_members WHERE organization_id=:'org_a'::uuid;
SELECT app.accept_action(:'org_a'::uuid,'CONTENT.PREPARE','same-key') AS action_a \gset
SELECT CASE WHEN app.accept_action(:'org_a'::uuid,'CONTENT.PREPARE','same-key')=:'action_a'::uuid THEN 1 ELSE 1/0 END AS idempotency_reused;

RESET ROLE;
SET ROLE ai_company_app;
SELECT set_config('app.user_id','22222222-2222-2222-2222-222222222222',false);
SELECT (app.create_organization('Shop B','shop')).id AS org_b \gset
SELECT CASE WHEN count(*)=1 THEN 1 ELSE 1/0 END AS only_own_org_visible
FROM app.organizations;
SELECT CASE WHEN count(*)=0 THEN 1 ELSE 1/0 END AS cross_tenant_org_hidden
FROM app.organizations WHERE id=:'org_a'::uuid;
SELECT CASE WHEN count(*)=0 THEN 1 ELSE 1/0 END AS cross_tenant_audit_hidden
FROM app.audit_log WHERE organization_id=:'org_a'::uuid;
SELECT CASE WHEN pg_temp.expect_campaign_denied(:'org_b'::uuid) THEN 1 ELSE 1/0 END AS capability_denial_enforced;

RESET ROLE;
SELECT 'AI Company OS PostgreSQL tenant contract: PASS' AS result;
