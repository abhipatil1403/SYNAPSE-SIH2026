-- Additive private read-only workspace. Existing activation settings stay OFF.
-- Default result contains approved self-account metadata only, not case counts.
-- No browser/API execution grant, table ownership, business write or managed Auth change.
GRANT SELECT(summary,disposed_at) ON synapse.cases TO synapse_case_reader;
GRANT SELECT(state_name) ON synapse.institutions TO synapse_case_reader;
GRANT SELECT(sla_instance_id,sla_policy_version_id,original_due_at) ON synapse.sla_instances TO synapse_case_reader;
GRANT synapse_case_reader TO postgres WITH SET TRUE;
GRANT CREATE ON SCHEMA synapse_gateway TO synapse_case_reader;
SET LOCAL ROLE synapse_case_reader;

CREATE FUNCTION synapse_gateway.workspace(p_claims jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=on AS $$
DECLARE account jsonb; me jsonb; result jsonb; rows jsonb; ids uuid[]; row_count bigint; bytes bigint;
BEGIN
 -- The unexposed gateway accepts claims only from the restricted web login,
 -- after online Supabase getUser verification; it never accepts browser actors.
 account:=synapse_gateway.read(p_claims,'account','{}');
 IF account->>'status' IS DISTINCT FROM 'APPROVED' THEN
  RAISE EXCEPTION 'Current approved account required' USING ERRCODE='42501';
 END IF;
 me:=jsonb_build_object('id',account->'internalUserId','name',account->'displayName',
  'bureauIds',account->'memberships','roles',account->'roles');
 result:=jsonb_build_object('revision',floor(extract(epoch FROM clock_timestamp())*1000000)::bigint::text,
  'generatedAt',clock_timestamp(),'me',me,'directory',jsonb_build_array(me),
  'cases','[]'::jsonb,'drafts','[]'::jsonb,'tasks','[]'::jsonb,'evidence','[]'::jsonb,
  'matches','[]'::jsonb,'relationships','[]'::jsonb,'findings','[]'::jsonb,'policies','[]'::jsonb,
  'bureaus','[]'::jsonb,'institutions','[]'::jsonb,'categories','[]'::jsonb,'comments','[]'::jsonb,
  'activity','[]'::jsonb,'sla','[]'::jsonb,'events','[]'::jsonb,'notifications','[]'::jsonb,
  'accessRequests','[]'::jsonb,'transfers','[]'::jsonb);
 IF NOT EXISTS(SELECT FROM synapse.phase1_access_config WHERE singleton AND read_enabled AND read_until>now()) THEN
  RETURN result||jsonb_build_object('workspace',jsonb_build_object('mode','ACCOUNT_ONLY','sources','[]'::jsonb,
   'reason','Your account is connected. Complaint access awaits a reviewed, time-limited read-only preview.'));
 END IF;
 -- RLS applies before totals/aggregation. Reject oversized projections, never
 -- silently paginate the dataset and present truncated dashboard totals.
 SELECT count(*),coalesce(sum(octet_length(coalesce(summary,''))+octet_length(title)),0)
 INTO row_count,bytes FROM synapse.cases;
 IF row_count>5000 OR bytes>4194304 THEN
  RAISE EXCEPTION 'Read projection exceeds reviewed limit' USING ERRCODE='54000';
 END IF;
 SELECT coalesce(array_agg(case_id),'{}'::uuid[]),coalesce(jsonb_agg(jsonb_build_object(
  'id',case_id,'caseNumber',case_number::text,'institutionId',institution_id,'categoryId',category_id,
  'bureauId',lead_bureau_id,'officerId',accountable_officer_id,'subject',title,'summary',coalesce(summary,''),
  'status',current_status_code,'priority',priority_code,'receivedAt',received_at,'updatedAt',updated_at,
  'disposedAt',disposed_at,'version',row_version::text) ORDER BY received_at DESC,case_id),'[]'::jsonb)
 INTO ids,rows FROM synapse.cases;
 result:=result||jsonb_build_object('cases',rows,
  'institutions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',institution_id,'name',canonical_name,'state',coalesce(state_name,'')) ORDER BY institution_id)
   FROM synapse.institutions),'[]'::jsonb),
  'bureaus',coalesce((SELECT jsonb_agg(jsonb_build_object('id',bureau_id,'name',bureau_name) ORDER BY bureau_id)
   FROM synapse.bureaus),'[]'::jsonb),
  'categories',coalesce((SELECT jsonb_agg(jsonb_build_object('id',category_id,'name',category_name) ORDER BY category_id)
   FROM synapse.case_categories),'[]'::jsonb),
  'sla',coalesce((SELECT jsonb_agg(jsonb_build_object('id',sla_instance_id,'caseId',case_id,'taskId',NULL,
   'dueAt',current_due_at,'originalDueAt',original_due_at,'status',sla_status,'policyVersionId',sla_policy_version_id) ORDER BY sla_instance_id)
   FROM synapse.sla_instances WHERE case_id=ANY(ids) AND work_item_id IS NULL),'[]'::jsonb));
 RETURN result||jsonb_build_object('workspace',jsonb_build_object('mode','READ_ONLY',
  'sources',jsonb_build_array('cases','institutions','sla','references'),
  'reason','Read-only Supabase preview. Case and case-level SLA data only; business writes and other workflow integrations remain disabled.'));
END $$;
REVOKE ALL ON FUNCTION synapse_gateway.workspace(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION synapse_gateway.workspace(jsonb) TO synapse_web_gateway;
RESET ROLE;
REVOKE CREATE ON SCHEMA synapse_gateway FROM synapse_case_reader;
GRANT synapse_case_reader TO postgres WITH INHERIT FALSE,SET FALSE;
