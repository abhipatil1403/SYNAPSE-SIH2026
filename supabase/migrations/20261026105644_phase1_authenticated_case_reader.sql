-- Phase 1: additive, default-disabled, read-only Auth case registry.
-- Review: supabase/PHASE1_REVIEW.md. Existing write functions and taxonomies stay unchanged.
-- The two public RPCs run as a NOLOGIN / NOBYPASSRLS role, NOT as postgres/service_role.

DO $review$
BEGIN
  IF to_regclass('synapse.cases') IS NULL OR to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'Apply only to the reviewed SYNAPSE baseline with Supabase Auth';
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname='synapse_case_reader') THEN
    RAISE EXCEPTION 'Unexpected existing reader role; inspect privileges before migration';
  END IF;
  IF EXISTS (SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
      WHERE n.nspname='synapse' AND c.relname IN ('cases','case_access_grants')
        AND a.privilege_type='SELECT' AND a.grantee NOT IN
          ((SELECT oid FROM pg_roles WHERE rolname='postgres'),(SELECT oid FROM pg_roles WHERE rolname='synapse_app'))) THEN
    RAISE EXCEPTION 'Case/grant SELECT grantees drifted; policy scoping requires review';
  END IF;
END $review$;

CREATE ROLE synapse_case_reader NOLOGIN NOINHERIT NOBYPASSRLS;
GRANT USAGE ON SCHEMA synapse, auth, public TO synapse_case_reader;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.jwt() TO synapse_case_reader;

-- Provisioned only by an authorized database administrator. No email/JWT metadata auto-linking.
-- Existing external_subject and legacy synapse.user_id contracts are untouched.
CREATE TABLE synapse.auth_identity_links (
  auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE,
  internal_user_id uuid NOT NULL UNIQUE REFERENCES synapse.users(user_id),
  linked_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CHECK (revoked_at IS NULL OR revoked_at >= linked_at)
);
ALTER TABLE synapse.auth_identity_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE synapse.auth_identity_links FORCE ROW LEVEL SECURITY;
CREATE POLICY phase1_identity_self ON synapse.auth_identity_links
  FOR SELECT TO synapse_case_reader
  USING (auth_user_id=(SELECT auth.uid()) AND revoked_at IS NULL);

CREATE TABLE synapse.phase1_access_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  read_enabled boolean NOT NULL DEFAULT false
);
INSERT INTO synapse.phase1_access_config(singleton,read_enabled) VALUES (true,false);
ALTER TABLE synapse.phase1_access_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE synapse.phase1_access_config FORCE ROW LEVEL SECURITY;
CREATE POLICY phase1_config_read ON synapse.phase1_access_config
  FOR SELECT TO synapse_case_reader USING (true);

-- Only the mapped identity row is visible to this reader role.
ALTER TABLE synapse.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY phase1_user_self ON synapse.users FOR SELECT TO synapse_case_reader
  USING (user_id IN (SELECT internal_user_id FROM synapse.auth_identity_links));

CREATE FUNCTION synapse.phase1_actor_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $function$
  SELECT u.user_id FROM synapse.auth_identity_links l
  JOIN synapse.users u ON u.user_id=l.internal_user_id
  WHERE l.auth_user_id=(SELECT auth.uid()) AND l.revoked_at IS NULL AND u.account_status='ACTIVE'
$function$;
REVOKE ALL ON FUNCTION synapse.phase1_actor_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION synapse.phase1_actor_id() TO synapse_case_reader;

ALTER TABLE synapse.roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY phase1_active_roles ON synapse.roles FOR SELECT TO synapse_case_reader USING (is_active);
ALTER TABLE synapse.user_role_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY phase1_own_roles ON synapse.user_role_assignments FOR SELECT TO synapse_case_reader
  USING (user_id=(SELECT synapse.phase1_actor_id()) AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now()));
ALTER TABLE synapse.user_bureau_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY phase1_own_memberships ON synapse.user_bureau_memberships FOR SELECT TO synapse_case_reader
  USING (user_id=(SELECT synapse.phase1_actor_id()) AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now()));
ALTER TABLE synapse.case_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY phase1_own_case_assignments ON synapse.case_assignments FOR SELECT TO synapse_case_reader
  USING (officer_id=(SELECT synapse.phase1_actor_id()) AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now()));

-- These legacy policies previously matched PUBLIC, but only synapse_app had SELECT.
-- Narrowing their role targets preserves every existing effective client read grant
-- and prevents the new reader from executing the legacy definer/admin-bypass helpers.
ALTER POLICY cases_select_authorized ON synapse.cases TO synapse_app;
ALTER POLICY access_grants_select_authorized ON synapse.case_access_grants TO synapse_app;
CREATE POLICY phase1_own_case_grants ON synapse.case_access_grants FOR SELECT TO synapse_case_reader
  USING (valid_from<=now() AND (valid_until IS NULL OR valid_until>now()) AND revoked_at IS NULL
    AND (user_id=(SELECT synapse.phase1_actor_id()) OR bureau_id IN
      (SELECT bureau_id FROM synapse.user_bureau_memberships)));

CREATE FUNCTION synapse.phase1_can_read_case(p_case_id uuid,p_bureau_id uuid,p_officer_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $function$
  WITH actor AS (SELECT synapse.phase1_actor_id() AS id),
  permitted_roles AS (
    SELECT r.role_code,a.scope_type,a.bureau_id FROM synapse.user_role_assignments a
    JOIN synapse.roles r ON r.role_id=a.role_id
    WHERE a.user_id=(SELECT id FROM actor) AND r.is_active
      AND a.valid_from<=now() AND (a.valid_until IS NULL OR a.valid_until>now())
      AND r.role_code IN ('CASE_OFFICER','BUREAU_HEAD','AUDITOR','SENIOR_MANAGEMENT','REVIEWER')
      AND (a.scope_type='GLOBAL' OR (a.scope_type='BUREAU' AND EXISTS
        (SELECT FROM synapse.user_bureau_memberships m WHERE m.bureau_id=a.bureau_id)))
  )
  SELECT (SELECT id FROM actor) IS NOT NULL AND EXISTS(SELECT FROM permitted_roles)
    AND (
      (EXISTS(SELECT FROM permitted_roles WHERE role_code='CASE_OFFICER')
        AND (p_officer_id=(SELECT id FROM actor) OR EXISTS
          (SELECT FROM synapse.case_assignments a WHERE a.case_id=p_case_id AND a.officer_id=(SELECT id FROM actor))))
      OR (EXISTS(SELECT FROM permitted_roles r WHERE r.role_code IN ('BUREAU_HEAD','AUDITOR')
          AND (r.scope_type='GLOBAL' OR r.bureau_id=p_bureau_id))
        AND EXISTS(SELECT FROM synapse.user_bureau_memberships m WHERE m.bureau_id=p_bureau_id))
      OR EXISTS(SELECT FROM synapse.case_access_grants g WHERE g.case_id=p_case_id
        AND g.granted_scope IN ('DETAILS','COORDINATE') AND g.revoked_at IS NULL
        AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now()))
    )
$function$;
REVOKE ALL ON FUNCTION synapse.phase1_can_read_case(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION synapse.phase1_can_read_case(uuid,uuid,uuid) TO synapse_case_reader;
CREATE POLICY phase1_case_read ON synapse.cases FOR SELECT TO synapse_case_reader
  USING (current_status_code<>'DRAFT' AND synapse.phase1_can_read_case(case_id,lead_bureau_id,accountable_officer_id));

-- Lookup labels and deadlines are available only for authorized cases.
ALTER TABLE synapse.institutions ENABLE ROW LEVEL SECURITY;
CREATE POLICY phase1_case_institution ON synapse.institutions FOR SELECT TO synapse_case_reader
  USING (EXISTS(SELECT FROM synapse.cases c WHERE c.institution_id=institutions.institution_id));
ALTER TABLE synapse.bureaus ENABLE ROW LEVEL SECURITY;
CREATE POLICY phase1_case_bureau ON synapse.bureaus FOR SELECT TO synapse_case_reader
  USING (EXISTS(SELECT FROM synapse.cases c WHERE c.lead_bureau_id=bureaus.bureau_id));
CREATE POLICY legacy_bureau_lookup ON synapse.bureaus FOR SELECT TO synapse_app USING (true);
ALTER TABLE synapse.case_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY phase1_case_category ON synapse.case_categories FOR SELECT TO synapse_case_reader
  USING (EXISTS(SELECT FROM synapse.cases c WHERE c.category_id=case_categories.category_id));
CREATE POLICY legacy_category_lookup ON synapse.case_categories FOR SELECT TO synapse_app USING (true);
ALTER TABLE synapse.case_statuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY phase1_status_lookup ON synapse.case_statuses FOR SELECT TO synapse_case_reader USING (true);
CREATE POLICY legacy_status_lookup ON synapse.case_statuses FOR SELECT TO synapse_app USING (true);
ALTER TABLE synapse.sla_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY phase1_case_sla ON synapse.sla_instances FOR SELECT TO synapse_case_reader
  USING (case_id IS NOT NULL AND EXISTS(SELECT FROM synapse.cases c WHERE c.case_id=sla_instances.case_id));

-- Column grants limit even this non-login role to the read contract; no document/audit/body reads.
GRANT SELECT(auth_user_id,internal_user_id,revoked_at) ON synapse.auth_identity_links TO synapse_case_reader;
GRANT SELECT(singleton,read_enabled) ON synapse.phase1_access_config TO synapse_case_reader;
GRANT SELECT(user_id,display_name,account_status) ON synapse.users TO synapse_case_reader;
GRANT SELECT(role_id,role_code,is_active) ON synapse.roles TO synapse_case_reader;
GRANT SELECT(user_id,role_id,scope_type,bureau_id,valid_from,valid_until) ON synapse.user_role_assignments TO synapse_case_reader;
GRANT SELECT(user_id,bureau_id,valid_from,valid_until) ON synapse.user_bureau_memberships TO synapse_case_reader;
GRANT SELECT(case_id,officer_id,valid_from,valid_until) ON synapse.case_assignments TO synapse_case_reader;
GRANT SELECT(case_id,user_id,bureau_id,granted_scope,valid_from,valid_until,revoked_at) ON synapse.case_access_grants TO synapse_case_reader;
GRANT SELECT(case_id,case_number,institution_id,category_id,current_status_code,lead_bureau_id,accountable_officer_id,title,priority_code,received_at,updated_at,row_version) ON synapse.cases TO synapse_case_reader;
GRANT SELECT(institution_id,canonical_name,city) ON synapse.institutions TO synapse_case_reader;
GRANT SELECT(bureau_id,bureau_name) ON synapse.bureaus TO synapse_case_reader;
GRANT SELECT(category_id,category_name) ON synapse.case_categories TO synapse_case_reader;
GRANT SELECT(status_code) ON synapse.case_statuses TO synapse_case_reader;
GRANT SELECT(case_id,work_item_id,current_due_at,sla_status) ON synapse.sla_instances TO synapse_case_reader;

CREATE FUNCTION public.synapse_phase1_me() RETURNS jsonb LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path='' SET row_security=on AS $function$
DECLARE actor uuid := synapse.phase1_actor_id(); payload jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
  IF NOT EXISTS(SELECT FROM synapse.phase1_access_config WHERE singleton AND read_enabled) THEN
    RAISE EXCEPTION 'Phase 1 read access is not activated' USING ERRCODE='55000'; END IF;
  IF actor IS NULL THEN RAISE EXCEPTION 'Account is not provisioned for access' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object('internalUserId',u.user_id,'displayName',u.display_name,
    'roleCodes',coalesce((SELECT jsonb_agg(DISTINCT r.role_code) FROM synapse.user_role_assignments a
      JOIN synapse.roles r ON r.role_id=a.role_id WHERE a.user_id=actor
      AND (a.scope_type='GLOBAL' OR (a.scope_type='BUREAU' AND EXISTS
        (SELECT FROM synapse.user_bureau_memberships m WHERE m.bureau_id=a.bureau_id)))), '[]'::jsonb),
    'readOnly',true) INTO payload FROM synapse.users u WHERE u.user_id=actor;
  RETURN payload;
END $function$;
REVOKE ALL ON FUNCTION public.synapse_phase1_me() FROM PUBLIC,anon;

CREATE FUNCTION public.synapse_phase1_cases(p_search text DEFAULT '',p_status text DEFAULT NULL,
  p_priority text DEFAULT NULL,p_page integer DEFAULT 1,p_page_size integer DEFAULT 20,
  p_sort text DEFAULT 'received_desc') RETURNS jsonb LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path='' SET row_security=on AS $function$
DECLARE payload jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
  IF NOT EXISTS(SELECT FROM synapse.phase1_access_config WHERE singleton AND read_enabled) THEN
    RAISE EXCEPTION 'Phase 1 read access is not activated' USING ERRCODE='55000'; END IF;
  IF synapse.phase1_actor_id() IS NULL THEN RAISE EXCEPTION 'Account is not provisioned for access' USING ERRCODE='42501'; END IF;
  IF p_search IS NULL OR length(p_search)>100 OR p_page IS NULL OR p_page<1 OR p_page>100000
      OR p_page_size IS NULL OR p_page_size<1 OR p_page_size>50
      OR p_sort IS NULL OR p_sort NOT IN ('received_desc','received_asc','updated_desc')
      OR (p_status IS NOT NULL AND NOT EXISTS(SELECT FROM synapse.case_statuses WHERE status_code=p_status))
      OR (p_priority IS NOT NULL AND p_priority NOT IN ('LOW','NORMAL','HIGH','URGENT')) THEN
    RAISE EXCEPTION 'Invalid case query' USING ERRCODE='22023'; END IF;
  WITH filtered AS MATERIALIZED (
    SELECT c.case_id,c.case_number,c.title,c.current_status_code,c.priority_code,c.accountable_officer_id,
      c.received_at,c.updated_at,c.row_version,i.canonical_name,i.city,b.bureau_name,k.category_name,
      (SELECT min(s.current_due_at) FROM synapse.sla_instances s WHERE s.case_id=c.case_id
        AND s.work_item_id IS NULL AND s.sla_status IN ('RUNNING','PAUSED','BREACHED')) AS due_at
    FROM synapse.cases c JOIN synapse.institutions i ON i.institution_id=c.institution_id
    JOIN synapse.bureaus b ON b.bureau_id=c.lead_bureau_id
    JOIN synapse.case_categories k ON k.category_id=c.category_id
    WHERE (p_status IS NULL OR c.current_status_code=p_status)
      AND (p_priority IS NULL OR c.priority_code=p_priority)
      AND (p_search='' OR strpos(lower(c.title),lower(p_search))>0
        OR strpos(lower(i.canonical_name),lower(p_search))>0 OR strpos(c.case_number::text,p_search)>0)
  ), paged AS (
    SELECT *,row_number() OVER (ORDER BY
      CASE WHEN p_sort='received_desc' THEN received_at END DESC,
      CASE WHEN p_sort='received_asc' THEN received_at END ASC,
      CASE WHEN p_sort='updated_desc' THEN updated_at END DESC,case_id DESC) AS result_order
    FROM filtered ORDER BY result_order
    LIMIT p_page_size OFFSET (p_page-1)*p_page_size
  )
  SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',case_id,'caseNumber',case_number::text,'subject',title,'statusCode',current_status_code,
    'priorityCode',priority_code,'institution',canonical_name,'city',city,'bureau',bureau_name,
    'category',category_name,'officerId',accountable_officer_id,'receivedAt',received_at,'updatedAt',updated_at,
    'version',row_version::text,'dueAt',due_at) ORDER BY result_order) FROM paged),'[]'::jsonb),
    'total',(SELECT count(*) FROM filtered),'page',p_page,'pageSize',p_page_size,'readOnly',true)
  INTO payload;
  RETURN payload;
END $function$;
REVOKE ALL ON FUNCTION public.synapse_phase1_cases(text,text,text,integer,integer,text) FROM PUBLIC,anon;

-- Temporary CREATE is required only to transfer function ownership; revoke it in this transaction.
-- Hosted postgres is not SUPERUSER; role creation grants ADMIN but not SET membership.
GRANT synapse_case_reader TO postgres WITH SET TRUE;
GRANT CREATE ON SCHEMA public TO synapse_case_reader;
ALTER FUNCTION public.synapse_phase1_me() OWNER TO synapse_case_reader;
ALTER FUNCTION public.synapse_phase1_cases(text,text,text,integer,integer,text) OWNER TO synapse_case_reader;
SET LOCAL ROLE synapse_case_reader;
GRANT EXECUTE ON FUNCTION public.synapse_phase1_me(),public.synapse_phase1_cases(text,text,text,integer,integer,text) TO authenticated;

COMMENT ON FUNCTION public.synapse_phase1_cases(text,text,text,integer,integer,text)
  IS 'Phase 1 registry only. Dedicated NOBYPASSRLS owner; active Auth mapping; no client actor/role parameters; default-disabled; no writes.';
RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM synapse_case_reader;
-- Restore the creator's administrative-only membership: no inherited reader access or SET ROLE.
GRANT synapse_case_reader TO postgres WITH INHERIT FALSE, SET FALSE;
COMMENT ON TABLE synapse.auth_identity_links IS 'Privileged explicit Auth subject binding. Never provision from user_metadata, browser roles, or email matching.';
