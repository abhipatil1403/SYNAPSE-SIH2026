-- Hosted compatibility correction. No legacy workflow or taxonomy changes.
-- auth schema is managed: postgres cannot delegate its USAGE. Read the verified
-- PostgREST JWT context directly, with strict role/type checks, through an invoker helper.
-- Only the gateway/server validates JWTs; no browser-controlled actor setting is accepted.
CREATE FUNCTION synapse.phase1_auth_subject() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $function$
DECLARE claims jsonb;
BEGIN
  claims:=coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
  IF jsonb_typeof(claims) IS DISTINCT FROM 'object'
    OR claims->>'role' IS DISTINCT FROM 'authenticated'
    OR claims->>'is_anonymous'='true' THEN RETURN NULL; END IF;
  RETURN nullif(claims->>'sub','')::uuid;
EXCEPTION WHEN invalid_text_representation THEN RETURN NULL;
END $function$;
REVOKE ALL ON FUNCTION synapse.phase1_auth_subject() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION synapse.phase1_auth_subject() TO synapse_case_reader;
CREATE OR REPLACE FUNCTION synapse.phase1_actor_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $function$
  SELECT u.user_id FROM synapse.auth_identity_links l
  JOIN synapse.users u ON u.user_id=l.internal_user_id
  WHERE l.auth_user_id=(SELECT synapse.phase1_auth_subject()) AND l.revoked_at IS NULL AND u.account_status='ACTIVE'
$function$;
ALTER POLICY phase1_identity_self ON synapse.auth_identity_links
  USING (auth_user_id=(SELECT synapse.phase1_auth_subject()) AND revoked_at IS NULL);

GRANT synapse_case_reader TO postgres WITH SET TRUE;
GRANT CREATE ON SCHEMA public TO synapse_case_reader;
SET LOCAL ROLE synapse_case_reader;
CREATE OR REPLACE FUNCTION public.synapse_phase1_me() RETURNS jsonb LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path='' SET row_security=on AS $function$
DECLARE actor uuid := synapse.phase1_actor_id(); payload jsonb;
BEGIN
  IF synapse.phase1_auth_subject() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
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

CREATE OR REPLACE FUNCTION public.synapse_phase1_cases(p_search text DEFAULT '',p_status text DEFAULT NULL,
  p_priority text DEFAULT NULL,p_page integer DEFAULT 1,p_page_size integer DEFAULT 20,
  p_sort text DEFAULT 'received_desc') RETURNS jsonb LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path='' SET row_security=on AS $function$
DECLARE payload jsonb;
BEGIN
  IF synapse.phase1_auth_subject() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
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

REVOKE ALL ON FUNCTION public.synapse_phase1_me(),
  public.synapse_phase1_cases(text,text,text,integer,integer,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.synapse_phase1_me(),
  public.synapse_phase1_cases(text,text,text,integer,integer,text) TO authenticated;
RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM synapse_case_reader;
GRANT synapse_case_reader TO postgres WITH INHERIT FALSE, SET FALSE;
DO $review$
BEGIN
  IF has_schema_privilege(current_user,'auth','USAGE WITH GRANT OPTION') THEN
    REVOKE USAGE ON SCHEMA auth FROM synapse_case_reader;
  ELSIF has_schema_privilege('synapse_case_reader','auth','USAGE') THEN
    RAISE EXCEPTION 'Unexpected managed Auth access; revoke through its owner before proceeding';
  END IF;
END $review$;
COMMENT ON FUNCTION synapse.phase1_auth_subject() IS
  'Invoker helper for gateway-verified request.jwt.claims only. No synapse.user_id, legacy claim.sub, email, or user_metadata authority.';

