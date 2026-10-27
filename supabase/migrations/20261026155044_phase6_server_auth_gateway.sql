-- Application-owned alternative to the UNAPPLIED auth.sessions candidate.
-- No managed objects, source-table permissions or read gates are broadened.
-- A separately provisioned, non-superuser server login may assume only the gateway.
CREATE ROLE synapse_web_gateway NOLOGIN NOINHERIT NOBYPASSRLS;
CREATE SCHEMA synapse_gateway;
REVOKE ALL ON SCHEMA synapse_gateway FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA synapse_gateway TO synapse_web_gateway,synapse_case_reader;

-- Browser JWTs can no longer enter protected read functions at all. Current-session
-- revocation remains callable: it can only revoke the verified subject's own session.
GRANT synapse_case_reader TO postgres WITH SET TRUE;
GRANT CREATE ON SCHEMA synapse_gateway TO synapse_case_reader;
SET LOCAL ROLE synapse_case_reader;
REVOKE EXECUTE ON FUNCTION public.synapse_phase1_me(),public.synapse_phase1_cases(text,text,text,integer,integer,text) FROM authenticated;
CREATE FUNCTION synapse_gateway.read(p_claims jsonb,p_operation text,p_query jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=on AS $gateway$
DECLARE actor uuid; roles jsonb; memberships jsonb;
BEGIN
  -- Claims are accepted ONLY from the trusted server login, after auth.getUser().
  -- They are never accepted from a browser payload or an exposed PostgREST RPC.
  PERFORM set_config('request.jwt.claims',p_claims::text,true);
  IF synapse.phase1_auth_subject() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
  actor := synapse.phase1_actor_id();
  IF p_operation='account' THEN
    IF actor IS NULL THEN RETURN jsonb_build_object('status','PENDING_APPROVAL','roles','[]'::jsonb,'memberships','[]'::jsonb); END IF;
    SELECT coalesce(jsonb_agg(DISTINCT r.role_code),'[]'::jsonb) INTO roles FROM synapse.user_role_assignments a JOIN synapse.roles r USING(role_id)
      WHERE a.user_id=actor AND r.is_active AND (a.scope_type='GLOBAL' OR a.bureau_id IN (SELECT bureau_id FROM synapse.user_bureau_memberships));
    SELECT coalesce(jsonb_agg(DISTINCT m.bureau_id),'[]'::jsonb) INTO memberships FROM synapse.user_bureau_memberships m WHERE m.user_id=actor;
    RETURN jsonb_build_object('status',CASE WHEN jsonb_array_length(roles)>0 AND (jsonb_array_length(memberships)>0 OR roles ? 'SYSTEM_ADMIN') THEN 'APPROVED' ELSE 'PENDING_APPROVAL' END,
      'internalUserId',actor,'displayName',(SELECT display_name FROM synapse.users WHERE user_id=actor),'roles',roles,'memberships',memberships);
  ELSIF p_operation='identity' THEN RETURN public.synapse_phase1_me();
  ELSIF p_operation='cases' THEN RETURN public.synapse_phase1_cases(coalesce(p_query->>'q',''),p_query->>'status',p_query->>'priority',
    coalesce((p_query->>'page')::int,1),coalesce((p_query->>'pageSize')::int,20),coalesce(p_query->>'sort','received_desc'));
  END IF;
  RAISE EXCEPTION 'Unsupported operation' USING ERRCODE='22023';
END $gateway$;
REVOKE ALL ON FUNCTION synapse_gateway.read(jsonb,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION synapse_gateway.read(jsonb,text,jsonb) TO synapse_web_gateway;
RESET ROLE;
REVOKE CREATE ON SCHEMA synapse_gateway FROM synapse_case_reader;
GRANT synapse_case_reader TO postgres WITH INHERIT FALSE,SET FALSE;

-- No complaint-body access is granted to this account-management principal.
CREATE ROLE synapse_account_manager NOLOGIN NOINHERIT NOBYPASSRLS;
GRANT USAGE ON SCHEMA synapse_gateway,synapse TO synapse_account_manager;
GRANT EXECUTE ON FUNCTION synapse.phase2_verified_subject(),synapse.phase2_session_id() TO synapse_account_manager;
GRANT SELECT(session_id,auth_user_id) ON synapse.auth_session_revocations TO synapse_account_manager;
CREATE POLICY account_manager_session ON synapse.auth_session_revocations FOR SELECT TO synapse_account_manager
  USING(auth_user_id=(SELECT synapse.phase2_verified_subject()));
CREATE TABLE synapse_gateway.onboarding (
  auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  email text NOT NULL CHECK(length(email)<=254), display_name text NOT NULL CHECK(length(display_name) BETWEEN 1 AND 150),
  email_confirmed boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN('PENDING','APPROVED','REJECTED','SUSPENDED','REVOKED')),
  revision bigint NOT NULL DEFAULT 1, requested_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz,
  decided_by uuid REFERENCES synapse.users(user_id), reason text
);
CREATE TABLE synapse_gateway.account_audit (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), auth_user_id uuid NOT NULL, actor_user_id uuid,
  action text NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now(), detail jsonb NOT NULL
);
CREATE TABLE synapse_gateway.auth_limits (
  bucket text PRIMARY KEY CHECK(length(bucket)=64), opened_at timestamptz NOT NULL, attempts integer NOT NULL
);
CREATE TABLE synapse_gateway.recovery_grants (
  session_id uuid PRIMARY KEY, auth_user_id uuid NOT NULL REFERENCES auth.users(id), expires_at timestamptz NOT NULL, used_at timestamptz
);
ALTER TABLE synapse_gateway.onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE synapse_gateway.onboarding FORCE ROW LEVEL SECURITY;
ALTER TABLE synapse_gateway.account_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE synapse_gateway.account_audit FORCE ROW LEVEL SECURITY;
ALTER TABLE synapse_gateway.auth_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE synapse_gateway.auth_limits FORCE ROW LEVEL SECURITY;
ALTER TABLE synapse_gateway.recovery_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE synapse_gateway.recovery_grants FORCE ROW LEVEL SECURITY;
CREATE POLICY account_manager_onboarding ON synapse_gateway.onboarding TO synapse_account_manager USING(true) WITH CHECK(true);
CREATE POLICY account_manager_audit ON synapse_gateway.account_audit FOR INSERT TO synapse_account_manager WITH CHECK(true);
CREATE POLICY account_manager_limits ON synapse_gateway.auth_limits TO synapse_account_manager USING(true) WITH CHECK(true);
CREATE POLICY account_manager_recovery ON synapse_gateway.recovery_grants TO synapse_account_manager USING(true) WITH CHECK(true);
GRANT SELECT,INSERT,UPDATE ON synapse_gateway.onboarding,synapse_gateway.auth_limits,synapse_gateway.recovery_grants TO synapse_account_manager;
GRANT INSERT ON synapse_gateway.account_audit TO synapse_account_manager;
GRANT SELECT(auth_user_id,internal_user_id,revoked_at),INSERT(auth_user_id,internal_user_id),UPDATE(revoked_at) ON synapse.auth_identity_links TO synapse_account_manager;
GRANT SELECT(user_id,email,account_status),INSERT(user_id,email,display_name,account_status),UPDATE(account_status) ON synapse.users TO synapse_account_manager;
GRANT SELECT(role_id,role_code,is_active) ON synapse.roles TO synapse_account_manager;
GRANT SELECT(user_id,role_id,scope_type,bureau_id,valid_from,valid_until),INSERT(user_id,role_id,scope_type,bureau_id,valid_until,assigned_by_user_id),UPDATE(valid_until) ON synapse.user_role_assignments TO synapse_account_manager;
GRANT SELECT(user_id,bureau_id,valid_from,valid_until),INSERT(user_id,bureau_id,valid_until),UPDATE(valid_until) ON synapse.user_bureau_memberships TO synapse_account_manager;
GRANT SELECT(bureau_id,is_active,bureau_name) ON synapse.bureaus TO synapse_account_manager;
CREATE POLICY account_manager_links ON synapse.auth_identity_links TO synapse_account_manager USING(true) WITH CHECK(true);
CREATE POLICY account_manager_users ON synapse.users TO synapse_account_manager USING(true) WITH CHECK(true);
CREATE POLICY account_manager_roles ON synapse.roles FOR SELECT TO synapse_account_manager USING(is_active);
CREATE POLICY account_manager_assignments ON synapse.user_role_assignments TO synapse_account_manager USING(true) WITH CHECK(true);
CREATE POLICY account_manager_memberships ON synapse.user_bureau_memberships TO synapse_account_manager USING(true) WITH CHECK(true);
CREATE POLICY account_manager_bureaus ON synapse.bureaus FOR SELECT TO synapse_account_manager USING(is_active);

GRANT synapse_account_manager TO postgres WITH SET TRUE;
GRANT CREATE ON SCHEMA synapse_gateway TO synapse_account_manager;
SET LOCAL ROLE synapse_account_manager;
CREATE FUNCTION synapse_gateway.account(p_claims jsonb,p_operation text,p_input jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=on AS $account$
DECLARE subject uuid; actor uuid; target synapse_gateway.onboarding%ROWTYPE; internal_id uuid; selected_role uuid;
BEGIN
  PERFORM set_config('request.jwt.claims',p_claims::text,true);
  subject := synapse.phase2_verified_subject();
  IF subject IS NULL OR synapse.phase2_session_id() IS NULL OR EXISTS(SELECT FROM synapse.auth_session_revocations WHERE session_id=synapse.phase2_session_id()) THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='28000'; END IF;
  IF p_operation='request' THEN
    IF coalesce(p_input->>'email','')='' OR coalesce(p_input->>'name','')='' OR coalesce((p_input->>'confirmed')::boolean,false)=false THEN RAISE EXCEPTION 'Verified email required' USING ERRCODE='22023'; END IF;
    INSERT INTO synapse_gateway.onboarding(auth_user_id,email,display_name,email_confirmed) VALUES(subject,p_input->>'email',p_input->>'name',true)
      ON CONFLICT(auth_user_id) DO NOTHING;
    RETURN jsonb_build_object('requested',true);
  ELSIF p_operation='recovery.begin' THEN
    INSERT INTO synapse_gateway.recovery_grants(session_id,auth_user_id,expires_at) VALUES((p_claims->>'session_id')::uuid,subject,now()+interval '15 minutes')
      ON CONFLICT(session_id) DO UPDATE SET expires_at=excluded.expires_at WHERE synapse_gateway.recovery_grants.used_at IS NULL;
    RETURN jsonb_build_object('recovery',true);
  ELSIF p_operation='recovery.consume' THEN
    UPDATE synapse_gateway.recovery_grants SET used_at=now() WHERE session_id=(p_claims->>'session_id')::uuid AND auth_user_id=subject AND expires_at>now() AND used_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Recovery link unavailable' USING ERRCODE='42501'; END IF;
    RETURN jsonb_build_object('consumed',true);
  END IF;
  SELECT l.internal_user_id INTO actor FROM synapse.auth_identity_links l JOIN synapse.users u ON u.user_id=l.internal_user_id
    WHERE l.auth_user_id=subject AND l.revoked_at IS NULL AND u.account_status='ACTIVE';
  IF actor IS NULL OR NOT EXISTS(SELECT FROM synapse.user_role_assignments a JOIN synapse.roles r USING(role_id)
    WHERE a.user_id=actor AND r.role_code='SYSTEM_ADMIN' AND r.is_active AND a.scope_type='GLOBAL'
      AND a.valid_from<=now() AND (a.valid_until IS NULL OR a.valid_until>now())) THEN RAISE EXCEPTION 'Administrator approval required' USING ERRCODE='42501'; END IF;
  IF p_operation='list' THEN RETURN jsonb_build_object('requests',coalesce((SELECT jsonb_agg(to_jsonb(o)) FROM (SELECT auth_user_id,email,display_name,status,revision::text,requested_at FROM synapse_gateway.onboarding ORDER BY requested_at DESC LIMIT 100) o),'[]'::jsonb),
    'bureaus',coalesce((SELECT jsonb_agg(jsonb_build_object('id',bureau_id,'name',bureau_name)) FROM synapse.bureaus WHERE is_active),'[]'::jsonb)); END IF;
  IF p_operation<>'decide' OR subject=(p_input->>'authId')::uuid THEN RAISE EXCEPTION 'Independent approval required' USING ERRCODE='42501'; END IF;
  SELECT * INTO target FROM synapse_gateway.onboarding WHERE auth_user_id=(p_input->>'authId')::uuid FOR UPDATE;
  IF NOT FOUND OR target.revision<>(p_input->>'revision')::bigint THEN RAISE EXCEPTION 'Account changed' USING ERRCODE='40001'; END IF;
  IF length(coalesce(p_input->>'reason','')) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'Reason required' USING ERRCODE='22023'; END IF;
  IF p_input->>'decision'='APPROVED' THEN
    IF target.status<>'PENDING' OR NOT target.email_confirmed OR NOT EXISTS(SELECT FROM synapse.bureaus WHERE bureau_id=(p_input->>'bureauId')::uuid AND is_active)
      OR (p_input->>'until')::timestamptz NOT BETWEEN now()+interval '1 hour' AND now()+interval '90 days' THEN RAISE EXCEPTION 'Invalid approval scope' USING ERRCODE='22023'; END IF;
    SELECT role_id INTO selected_role FROM synapse.roles WHERE role_code=p_input->>'role' AND role_code IN('CASE_OFFICER','BUREAU_HEAD','AUDITOR','REVIEWER') AND is_active;
    IF selected_role IS NULL THEN RAISE EXCEPTION 'Invalid approved role' USING ERRCODE='22023'; END IF;
    IF EXISTS(SELECT FROM synapse.users WHERE lower(email)=lower(target.email)) OR EXISTS(SELECT FROM synapse.auth_identity_links WHERE auth_user_id=target.auth_user_id) THEN
      RAISE EXCEPTION 'Existing identity needs explicit reconciliation' USING ERRCODE='23505'; END IF;
    internal_id := gen_random_uuid();
    INSERT INTO synapse.users(user_id,email,display_name,account_status) VALUES(internal_id,target.email,target.display_name,'ACTIVE');
    INSERT INTO synapse.auth_identity_links(auth_user_id,internal_user_id) VALUES(target.auth_user_id,internal_id);
    INSERT INTO synapse.user_bureau_memberships(user_id,bureau_id,valid_until) VALUES(internal_id,(p_input->>'bureauId')::uuid,(p_input->>'until')::timestamptz);
    INSERT INTO synapse.user_role_assignments(user_id,role_id,scope_type,bureau_id,valid_until,assigned_by_user_id) VALUES(internal_id,selected_role,'BUREAU',(p_input->>'bureauId')::uuid,(p_input->>'until')::timestamptz,actor);
  ELSIF p_input->>'decision' IN('SUSPENDED','REVOKED') THEN
    SELECT internal_user_id INTO internal_id FROM synapse.auth_identity_links WHERE auth_user_id=target.auth_user_id;
    IF internal_id IS NULL THEN RAISE EXCEPTION 'Approved identity required' USING ERRCODE='22023'; END IF;
    UPDATE synapse.users SET account_status='SUSPENDED' WHERE user_id=internal_id;
    UPDATE synapse.user_role_assignments SET valid_until=now() WHERE user_id=internal_id AND valid_from<now() AND (valid_until IS NULL OR valid_until>now());
    UPDATE synapse.user_bureau_memberships SET valid_until=now() WHERE user_id=internal_id AND valid_from<now() AND (valid_until IS NULL OR valid_until>now());
    IF p_input->>'decision'='REVOKED' THEN UPDATE synapse.auth_identity_links SET revoked_at=now() WHERE auth_user_id=target.auth_user_id; END IF;
  ELSIF p_input->>'decision'<>'REJECTED' OR target.status<>'PENDING' THEN RAISE EXCEPTION 'Invalid decision' USING ERRCODE='22023'; END IF;
  UPDATE synapse_gateway.onboarding SET status=p_input->>'decision',revision=revision+1,decided_at=now(),decided_by=actor,reason=p_input->>'reason' WHERE auth_user_id=target.auth_user_id;
  INSERT INTO synapse_gateway.account_audit(auth_user_id,actor_user_id,action,detail) VALUES(target.auth_user_id,actor,p_input->>'decision',p_input-'email'-'name');
  RETURN jsonb_build_object('saved',true);
END $account$;
CREATE FUNCTION synapse_gateway.limit_attempt(p_bucket text,p_limit integer,p_window integer) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=on AS $limit$
DECLARE attempts integer;
BEGIN
  IF p_limit NOT BETWEEN 1 AND 100 OR p_window NOT BETWEEN 30 AND 3600 THEN RAISE EXCEPTION 'Invalid throttle' USING ERRCODE='22023'; END IF;
  INSERT INTO synapse_gateway.auth_limits(bucket,opened_at,attempts) VALUES(p_bucket,now(),1)
  ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN synapse_gateway.auth_limits.opened_at<now()-make_interval(secs=>p_window) THEN 1 ELSE synapse_gateway.auth_limits.attempts+1 END,
    opened_at=CASE WHEN synapse_gateway.auth_limits.opened_at<now()-make_interval(secs=>p_window) THEN now() ELSE synapse_gateway.auth_limits.opened_at END RETURNING auth_limits.attempts INTO attempts;
  RETURN attempts<=p_limit;
END $limit$;
REVOKE ALL ON FUNCTION synapse_gateway.account(jsonb,text,jsonb),synapse_gateway.limit_attempt(text,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION synapse_gateway.account(jsonb,text,jsonb),synapse_gateway.limit_attempt(text,integer,integer) TO synapse_web_gateway;
RESET ROLE;
REVOKE CREATE ON SCHEMA synapse_gateway FROM synapse_account_manager;
GRANT synapse_account_manager TO postgres WITH INHERIT FALSE,SET FALSE;
-- These source roles own no tables and expose no new public-schema RPC.
