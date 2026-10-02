CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS app;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ai_company_app') THEN
    CREATE ROLE ai_company_app NOLOGIN;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;

CREATE TABLE IF NOT EXISTS app.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (btrim(name) <> ''),
  account_type text NOT NULL CHECK (account_type IN ('blogger','specialist','shop','company','hybrid')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.organization_members (
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('owner','admin','member','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id,user_id)
);

CREATE TABLE IF NOT EXISTS app.account_type_capabilities (
  account_type text NOT NULL,
  capability_key text NOT NULL,
  PRIMARY KEY (account_type,capability_key)
);

INSERT INTO app.account_type_capabilities(account_type,capability_key) VALUES
 ('blogger','content.prepare'),('blogger','content.review'),('blogger','inbox.read'),
 ('specialist','content.prepare'),('specialist','content.review'),('specialist','inbox.read'),('specialist','crm.contact'),
 ('shop','content.prepare'),('shop','content.review'),('shop','inbox.read'),('shop','crm.contact'),('shop','catalog.manage'),
 ('company','content.prepare'),('company','content.review'),('company','inbox.read'),('company','crm.contact'),('company','campaign.manage'),('company','analytics.read'),
 ('hybrid','content.prepare'),('hybrid','content.review'),('hybrid','inbox.read'),('hybrid','crm.contact'),('hybrid','catalog.manage'),('hybrid','campaign.manage'),('hybrid','analytics.read')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS app.organization_capabilities (
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  capability_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'account_type',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id,capability_key)
);

CREATE TABLE IF NOT EXISTS app.action_idempotency (
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  action_type text NOT NULL,
  action_id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id,idempotency_key)
);

CREATE TABLE IF NOT EXISTS app.audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION app.is_member(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
  SELECT app.current_user_id() IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM app.organization_members m
       WHERE m.organization_id = p_organization_id
         AND m.user_id = app.current_user_id()
     )
$$;

CREATE OR REPLACE FUNCTION app.current_org_role(p_organization_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
  SELECT m.role
  FROM app.organization_members m
  WHERE m.organization_id = p_organization_id
    AND m.user_id = app.current_user_id()
$$;

CREATE OR REPLACE FUNCTION app.role_allows_action(p_role text,p_action_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_role
    WHEN 'owner' THEN p_action_type IN (
      'CONTENT.PREPARE','CONTENT.REVIEW','INBOX.READ','CRM.CONTACT_UPSERT',
      'CATALOG.MANAGE','CAMPAIGN.MANAGE','ANALYTICS.READ'
    )
    WHEN 'admin' THEN p_action_type IN (
      'CONTENT.PREPARE','CONTENT.REVIEW','INBOX.READ','CRM.CONTACT_UPSERT',
      'CATALOG.MANAGE','CAMPAIGN.MANAGE','ANALYTICS.READ'
    )
    WHEN 'member' THEN p_action_type IN (
      'CONTENT.PREPARE','CONTENT.REVIEW','INBOX.READ','CRM.CONTACT_UPSERT',
      'CATALOG.MANAGE','CAMPAIGN.MANAGE','ANALYTICS.READ'
    )
    WHEN 'viewer' THEN false
    ELSE false
  END
$$;

ALTER TABLE app.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.organization_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.action_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organizations_member_select ON app.organizations;
CREATE POLICY organizations_member_select ON app.organizations
FOR SELECT TO ai_company_app
USING (app.is_member(id));

DROP POLICY IF EXISTS membership_self_select ON app.organization_members;
CREATE POLICY membership_self_select ON app.organization_members
FOR SELECT TO ai_company_app
USING (user_id = app.current_user_id());

DROP POLICY IF EXISTS org_capabilities_member_select ON app.organization_capabilities;
CREATE POLICY org_capabilities_member_select ON app.organization_capabilities
FOR SELECT TO ai_company_app
USING (app.is_member(organization_id));

DROP POLICY IF EXISTS idempotency_member_select ON app.action_idempotency;
CREATE POLICY idempotency_member_select ON app.action_idempotency
FOR SELECT TO ai_company_app
USING (app.is_member(organization_id));

DROP POLICY IF EXISTS audit_member_select ON app.audit_log;
CREATE POLICY audit_member_select ON app.audit_log
FOR SELECT TO ai_company_app
USING (app.is_member(organization_id));

CREATE OR REPLACE FUNCTION app.create_organization(p_name text,p_account_type text)
RETURNS app.organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, public
AS $$
DECLARE
  v_user uuid := app.current_user_id();
  v_org app.organizations;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'app.user_id is required' USING ERRCODE='28000';
  END IF;
  IF btrim(coalesce(p_name,'')) = '' THEN
    RAISE EXCEPTION 'organization name required' USING ERRCODE='22023';
  END IF;
  IF p_account_type NOT IN ('blogger','specialist','shop','company','hybrid') THEN
    RAISE EXCEPTION 'invalid account type' USING ERRCODE='22023';
  END IF;

  INSERT INTO app.organizations(name,account_type)
  VALUES (btrim(p_name),p_account_type)
  RETURNING * INTO v_org;

  INSERT INTO app.organization_members(organization_id,user_id,role)
  VALUES (v_org.id,v_user,'owner');

  INSERT INTO app.organization_capabilities(organization_id,capability_key)
  SELECT v_org.id,capability_key
  FROM app.account_type_capabilities
  WHERE account_type=p_account_type;

  INSERT INTO app.audit_log(organization_id,user_id,event_type,payload)
  VALUES (v_org.id,v_user,'organization.created',jsonb_build_object('account_type',p_account_type));

  RETURN v_org;
END
$$;

CREATE OR REPLACE FUNCTION app.accept_action_result(p_organization_id uuid,p_action_type text,p_idempotency_key text)
RETURNS TABLE(action_id uuid,duplicate boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app, public
AS $$
DECLARE
  v_user uuid := app.current_user_id();
  v_role text;
  v_capability text;
  v_action_id uuid;
  v_saved_action_type text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'app.user_id is required' USING ERRCODE='28000';
  END IF;
  IF btrim(coalesce(p_idempotency_key,'')) = '' THEN
    RAISE EXCEPTION 'idempotency key required' USING ERRCODE='22023';
  END IF;
  IF NOT app.is_member(p_organization_id) THEN
    RAISE EXCEPTION 'organization membership required' USING ERRCODE='42501';
  END IF;

  v_role := app.current_org_role(p_organization_id);
  IF NOT app.role_allows_action(v_role,p_action_type) THEN
    RAISE EXCEPTION 'role denied: % cannot execute %',coalesce(v_role,'none'),p_action_type
      USING ERRCODE='42501';
  END IF;

  v_capability := CASE p_action_type
    WHEN 'CONTENT.PREPARE' THEN 'content.prepare'
    WHEN 'CONTENT.REVIEW' THEN 'content.review'
    WHEN 'INBOX.READ' THEN 'inbox.read'
    WHEN 'CRM.CONTACT_UPSERT' THEN 'crm.contact'
    WHEN 'CATALOG.MANAGE' THEN 'catalog.manage'
    WHEN 'CAMPAIGN.MANAGE' THEN 'campaign.manage'
    WHEN 'ANALYTICS.READ' THEN 'analytics.read'
    ELSE NULL
  END;

  IF v_capability IS NULL THEN
    RAISE EXCEPTION 'unknown action type' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM app.organization_capabilities
    WHERE organization_id=p_organization_id
      AND capability_key=v_capability
      AND enabled=true
  ) THEN
    RAISE EXCEPTION 'capability denied: %',v_capability USING ERRCODE='42501';
  END IF;

  INSERT INTO app.action_idempotency AS stored(organization_id,idempotency_key,action_type,user_id)
  VALUES (p_organization_id,p_idempotency_key,p_action_type,v_user)
  ON CONFLICT (organization_id,idempotency_key) DO NOTHING
  RETURNING stored.action_id INTO v_action_id;

  IF v_action_id IS NULL THEN
    -- A separate statement sees the winning transaction after the unique-index
    -- conflict has settled under the runtime's default READ COMMITTED isolation.
    SELECT saved.action_id,saved.action_type INTO STRICT v_action_id,v_saved_action_type
    FROM app.action_idempotency AS saved
    WHERE saved.organization_id=p_organization_id
      AND saved.idempotency_key=p_idempotency_key;

    IF v_saved_action_type <> p_action_type THEN
      RAISE EXCEPTION 'idempotency key is already bound to a different action type'
        USING ERRCODE='22023';
    END IF;

    RETURN QUERY SELECT v_action_id,true;
    RETURN;
  END IF;

  INSERT INTO app.audit_log(organization_id,user_id,event_type,payload)
  VALUES (
    p_organization_id,
    v_user,
    'action.accepted',
    jsonb_build_object(
      'action_id',v_action_id,
      'action_type',p_action_type,
      'capability',v_capability,
      'idempotency_key',p_idempotency_key
    )
  );

  RETURN QUERY SELECT v_action_id,false;
END
$$;

-- Preserve the existing SQL contract for callers that only need the action ID.
CREATE OR REPLACE FUNCTION app.accept_action(p_organization_id uuid,p_action_type text,p_idempotency_key text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
  SELECT action_id FROM app.accept_action_result(p_organization_id,p_action_type,p_idempotency_key)
$$;

REVOKE ALL ON FUNCTION app.accept_action_result(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON SCHEMA app FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO ai_company_app;
GRANT SELECT ON app.organizations,app.organization_members,app.organization_capabilities,app.action_idempotency,app.audit_log TO ai_company_app;
GRANT EXECUTE ON FUNCTION app.current_user_id(),app.is_member(uuid),app.current_org_role(uuid),app.role_allows_action(text,text),app.create_organization(text,text),app.accept_action(uuid,text,text),app.accept_action_result(uuid,text,text) TO ai_company_app;
