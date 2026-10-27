-- Confirmed by the isolated negative test: assignment alone previously passed
-- with an active officer role belonging to a different Bureau. Preserve explicit
-- cross-Bureau DETAILS/COORDINATE grants, but bind ordinary officer reads to the
-- case Bureau's current role and membership. No grant or legacy function changes.
CREATE OR REPLACE FUNCTION synapse.phase1_can_read_case(p_case_id uuid,p_bureau_id uuid,p_officer_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $function$
 WITH actor AS (SELECT synapse.phase1_actor_id() AS id),
 permitted_roles AS (
  SELECT r.role_code,a.scope_type,a.bureau_id FROM synapse.user_role_assignments a JOIN synapse.roles r ON r.role_id=a.role_id
  WHERE a.user_id=(SELECT id FROM actor) AND r.is_active AND a.valid_from<=now() AND (a.valid_until IS NULL OR a.valid_until>now())
   AND r.role_code IN('CASE_OFFICER','BUREAU_HEAD','AUDITOR','SENIOR_MANAGEMENT','REVIEWER')
   AND (a.scope_type='GLOBAL' OR (a.scope_type='BUREAU' AND EXISTS(SELECT FROM synapse.user_bureau_memberships m WHERE m.bureau_id=a.bureau_id)))
 )
 SELECT (SELECT id FROM actor) IS NOT NULL AND EXISTS(SELECT FROM permitted_roles) AND (
  (EXISTS(SELECT FROM permitted_roles r WHERE r.role_code='CASE_OFFICER' AND (r.scope_type='GLOBAL' OR r.bureau_id=p_bureau_id))
   AND EXISTS(SELECT FROM synapse.user_bureau_memberships m WHERE m.bureau_id=p_bureau_id)
   AND (p_officer_id=(SELECT id FROM actor) OR EXISTS(SELECT FROM synapse.case_assignments a WHERE a.case_id=p_case_id AND a.officer_id=(SELECT id FROM actor))))
  OR (EXISTS(SELECT FROM permitted_roles r WHERE r.role_code IN('BUREAU_HEAD','AUDITOR') AND (r.scope_type='GLOBAL' OR r.bureau_id=p_bureau_id))
   AND EXISTS(SELECT FROM synapse.user_bureau_memberships m WHERE m.bureau_id=p_bureau_id))
  OR EXISTS(SELECT FROM synapse.case_access_grants g WHERE g.case_id=p_case_id AND g.granted_scope IN('DETAILS','COORDINATE') AND g.revoked_at IS NULL
   AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now()))
 )
$function$;
