-- Corrective least-privilege hardening: an inactive Bureau cannot receive intake.
-- Preserve existing function identity, ownership, grants and all stored rows.
GRANT synapse_gmail_manager TO postgres WITH SET TRUE;
GRANT CREATE ON SCHEMA synapse_gateway TO synapse_gmail_manager;
SET LOCAL ROLE synapse_gmail_manager;
CREATE OR REPLACE FUNCTION synapse_gateway.gmail(p_claims jsonb,p_operation text,p_input jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=on AS $gmail$
DECLARE actor uuid; st synapse_gateway.gmail_oauth_states%ROWTYPE; conn synapse_gateway.gmail_connections%ROWTYPE; result jsonb; item jsonb; ids jsonb; mid uuid; sid uuid; dup uuid; hash_value text; claim_id uuid; roles_valid boolean;
BEGIN
 PERFORM set_config('request.jwt.claims',p_claims::text,true);
 actor:=synapse_gateway.gmail_actor();
 IF p_operation IN('options','status','begin','consume','complete','disconnect') THEN
  IF actor IS NULL THEN RAISE EXCEPTION 'Current global administrator required' USING ERRCODE='42501';END IF;
  IF p_operation='options' THEN RETURN jsonb_build_object('operationsReleased',coalesce((SELECT enabled AND writes_enabled FROM synapse_gateway.operations_control),false),'bureaus',coalesce((SELECT jsonb_agg(jsonb_build_object('id',b.bureau_id,'name',b.bureau_name)) FROM synapse.bureaus b),'[]'::jsonb),'officers',coalesce((SELECT jsonb_agg(jsonb_build_object('id',u.user_id,'name',u.display_name,'bureauId',m.bureau_id)) FROM synapse.users u JOIN synapse.user_bureau_memberships m USING(user_id) JOIN synapse.bureaus b ON b.bureau_id=m.bureau_id AND b.is_active WHERE EXISTS(SELECT FROM synapse.user_role_assignments a JOIN synapse.roles r USING(role_id) WHERE a.user_id=u.user_id AND r.role_code='CASE_OFFICER' AND (a.scope_type='GLOBAL' OR a.bureau_id=m.bureau_id))),'[]'::jsonb));END IF;
  IF p_operation='status' THEN RETURN coalesce((SELECT jsonb_build_object('id',g.id,'address',g.approved_address,'bureauId',g.bureau_id,'reviewOwnerId',g.review_owner_id,'label',g.label_id,'status',g.status,'authorizedAt',g.authorized_at,'lastSyncAt',g.last_sync_at,'lastIngestedAt',g.last_ingested_at,'errorCode',g.last_error_code,'pending',(SELECT count(*) FROM synapse_gateway.gmail_import_queue q WHERE q.connection_id=g.id AND q.status IN('PENDING','RUNNING')),'failed',(SELECT count(*) FROM synapse_gateway.gmail_import_queue q WHERE q.connection_id=g.id AND q.status='FAILED'),'ingested',(SELECT count(*) FROM synapse_gateway.gmail_import_queue q WHERE q.connection_id=g.id AND q.status='INGESTED')) FROM synapse_gateway.gmail_connections g WHERE lower(g.approved_address)=lower(p_input->>'address')),jsonb_build_object('status','NOT_CONNECTED'));END IF;
  IF p_operation='begin' THEN
   IF NOT EXISTS(SELECT FROM synapse.users u JOIN synapse.user_bureau_memberships m USING(user_id) JOIN synapse.bureaus b ON b.bureau_id=m.bureau_id AND b.is_active JOIN synapse.user_role_assignments a USING(user_id) JOIN synapse.roles r USING(role_id) WHERE u.user_id=(p_input->>'reviewOwnerId')::uuid AND m.bureau_id=(p_input->>'bureauId')::uuid AND r.role_code='CASE_OFFICER' AND (a.scope_type='GLOBAL' OR a.bureau_id=m.bureau_id)) THEN RAISE EXCEPTION 'Active scoped intake officer required' USING ERRCODE='42501';END IF;
   INSERT INTO synapse_gateway.gmail_oauth_states(state_hash,actor_id,session_id,connection_id,bureau_id,review_owner_id,label_id,approved_address,verifier_ciphertext,redirect_uri,expires_at) VALUES(p_input->>'stateHash',actor,(p_claims->>'session_id')::uuid,(p_input->>'connectionId')::uuid,(p_input->>'bureauId')::uuid,(p_input->>'reviewOwnerId')::uuid,p_input->>'label',lower(p_input->>'address'),p_input->>'verifierCiphertext',p_input->>'redirectUri',now()+interval '10 minutes');RETURN '{}';
  END IF;
  IF p_operation='consume' THEN
   UPDATE synapse_gateway.gmail_oauth_states SET used_at=now() WHERE state_hash=p_input->>'stateHash' AND actor_id=actor AND session_id=(p_claims->>'session_id')::uuid AND expires_at>now() AND used_at IS NULL RETURNING * INTO st;
   IF NOT FOUND THEN RAISE EXCEPTION 'OAuth state unavailable' USING ERRCODE='28000';END IF;
   RETURN jsonb_build_object('connectionId',st.connection_id,'address',st.approved_address,'bureauId',st.bureau_id,'reviewOwnerId',st.review_owner_id,'label',st.label_id,'verifierCiphertext',st.verifier_ciphertext,'redirectUri',st.redirect_uri);
  END IF;
  IF p_operation='complete' THEN
   SELECT * INTO st FROM synapse_gateway.gmail_oauth_states WHERE state_hash=p_input->>'stateHash' AND actor_id=actor AND session_id=(p_claims->>'session_id')::uuid AND used_at IS NOT NULL AND completed_at IS NULL AND expires_at>now() FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Consumed OAuth state required' USING ERRCODE='28000';END IF;
   IF NOT EXISTS(SELECT FROM synapse.users u JOIN synapse.user_bureau_memberships m USING(user_id) JOIN synapse.bureaus b ON b.bureau_id=m.bureau_id AND b.is_active JOIN synapse.user_role_assignments a USING(user_id) JOIN synapse.roles r USING(role_id) WHERE u.user_id=st.review_owner_id AND m.bureau_id=st.bureau_id AND r.role_code='CASE_OFFICER' AND (a.scope_type='GLOBAL' OR a.bureau_id=m.bureau_id)) THEN RAISE EXCEPTION 'Intake authority changed' USING ERRCODE='42501';END IF;
   IF EXISTS(SELECT FROM synapse_gateway.gmail_connections WHERE lower(approved_address)=st.approved_address AND id<>st.connection_id) THEN RAISE EXCEPTION 'Connection changed' USING ERRCODE='40001';END IF;
   UPDATE synapse_gateway.gmail_oauth_states SET completed_at=now() WHERE state_hash=st.state_hash;
   PERFORM set_config('synapse.gmail_connection',st.connection_id::text,true);
   INSERT INTO synapse.integration_sources(integration_source_id,source_code,source_name,source_type,configuration_reference,is_active) VALUES(st.connection_id,'GMAIL-'||st.connection_id,'Approved complaint Gmail','EMAIL_INBOX','synapse_gateway.gmail_connections:'||st.connection_id,true) ON CONFLICT(integration_source_id) DO NOTHING;
   INSERT INTO synapse_gateway.gmail_connections(id,approved_address,bureau_id,review_owner_id,label_id,status,tokens_ciphertext,authorized_by,source_id) VALUES(st.connection_id,st.approved_address,st.bureau_id,st.review_owner_id,st.label_id,'AUTHORIZED',p_input->>'tokensCiphertext',actor,st.connection_id) ON CONFLICT(lower(approved_address)) DO UPDATE SET status='AUTHORIZED',tokens_ciphertext=excluded.tokens_ciphertext,authorized_by=actor,authorized_at=now(),bureau_id=excluded.bureau_id,review_owner_id=excluded.review_owner_id,label_id=excluded.label_id,last_error_code=NULL;
   INSERT INTO synapse.audit_events(actor_user_id,event_type,entity_type,entity_id,reason) VALUES(actor,'GMAIL_OAUTH_AUTHORIZED','integration',st.connection_id,'Dedicated mailbox verified; ingestion remains separately controlled');
   RETURN jsonb_build_object('authorized',true);
  END IF;
  IF p_operation='disconnect' THEN
   UPDATE synapse_gateway.gmail_connections SET status='DISCONNECTED',tokens_ciphertext='',lease_hash=NULL,lease_until=NULL WHERE lower(approved_address)=lower(p_input->>'address') RETURNING id INTO mid;
   INSERT INTO synapse.audit_events(actor_user_id,event_type,entity_type,entity_id,reason) VALUES(actor,'GMAIL_DISCONNECTED','integration',mid,'Authorized administrator disconnected mailbox');RETURN jsonb_build_object('disconnected',true);
  END IF;
 END IF;
 IF p_operation='worker.acquire' THEN
  IF NOT EXISTS(SELECT FROM synapse_gateway.operations_control WHERE enabled AND writes_enabled) THEN RETURN jsonb_build_object('blocked','OPERATIONS_RELEASE_REQUIRED');END IF;
  SELECT * INTO conn FROM synapse_gateway.gmail_connections WHERE lower(approved_address)=lower(p_input->>'address') AND status='AUTHORIZED' AND (lease_until IS NULL OR lease_until<now()) FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN jsonb_build_object('blocked','GMAIL_NOT_READY_OR_BUSY');END IF;
  SELECT EXISTS(SELECT FROM synapse.users u JOIN synapse.user_bureau_memberships m USING(user_id) JOIN synapse.bureaus b ON b.bureau_id=m.bureau_id AND b.is_active JOIN synapse.user_role_assignments a USING(user_id) JOIN synapse.roles r USING(role_id) WHERE u.user_id=conn.review_owner_id AND m.bureau_id=conn.bureau_id AND r.role_code='CASE_OFFICER' AND (a.scope_type='GLOBAL' OR a.bureau_id=m.bureau_id)) INTO roles_valid;
  IF NOT roles_valid THEN UPDATE synapse_gateway.gmail_connections SET last_error_code='INTAKE_AUTHORITY_CHANGED' WHERE id=conn.id;RETURN jsonb_build_object('blocked','INTAKE_AUTHORITY_CHANGED');END IF;
  UPDATE synapse_gateway.gmail_connections SET lease_hash=p_input->>'leaseHash',lease_until=now()+interval '90 seconds' WHERE id=conn.id;
  RETURN jsonb_build_object('id',conn.id,'address',conn.approved_address,'label',conn.label_id,'tokensCiphertext',conn.tokens_ciphertext,'cursor',conn.cursor,'previouslyVerified',conn.last_ingested_at IS NOT NULL);
 END IF;
 SELECT * INTO conn FROM synapse_gateway.gmail_connections WHERE id=(p_input->>'connectionId')::uuid AND lease_hash=p_input->>'leaseHash' AND lease_until>now() AND status='AUTHORIZED' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Current worker lease required' USING ERRCODE='28000';END IF;
 IF NOT EXISTS(SELECT FROM synapse_gateway.operations_control WHERE enabled AND writes_enabled) THEN RAISE EXCEPTION 'Operations release required' USING ERRCODE='42501';END IF;
 PERFORM set_config('synapse.gmail_connection',conn.id::text,true);PERFORM set_config('synapse.user_id','',true);
 IF p_operation='worker.credentials' THEN UPDATE synapse_gateway.gmail_connections SET tokens_ciphertext=p_input->>'tokensCiphertext' WHERE id=conn.id;RETURN '{}';END IF;
 IF p_operation='worker.enqueue' THEN
  IF jsonb_array_length(p_input->'messageIds')>50 THEN RAISE EXCEPTION 'Batch limit' USING ERRCODE='22023';END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_input->'messageIds') LOOP INSERT INTO synapse_gateway.gmail_import_queue(connection_id,message_id) VALUES(conn.id,item#>>'{}') ON CONFLICT(connection_id,message_id) DO NOTHING;END LOOP;
  UPDATE synapse_gateway.gmail_connections SET cursor=p_input->'cursor' WHERE id=conn.id;RETURN '{}';
 END IF;
 IF p_operation='worker.next' THEN
  UPDATE synapse_gateway.gmail_import_queue SET status='PENDING' WHERE connection_id=conn.id AND status='RUNNING';
  UPDATE synapse_gateway.gmail_import_queue SET status='RUNNING' WHERE id=(SELECT q.id FROM synapse_gateway.gmail_import_queue q WHERE q.connection_id=conn.id AND q.status='PENDING' ORDER BY q.created_at,q.id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id INTO claim_id;
  RETURN coalesce((SELECT jsonb_build_object('id',q.id,'messageId',q.message_id) FROM synapse_gateway.gmail_import_queue q WHERE q.id=claim_id),'{}');
 END IF;
 IF p_operation='worker.fail' THEN UPDATE synapse_gateway.gmail_import_queue SET status='FAILED',error_code=left(p_input->>'code',80) WHERE id=(p_input->>'queueId')::uuid AND connection_id=conn.id;UPDATE synapse_gateway.gmail_connections SET last_error_code=left(p_input->>'code',80) WHERE id=conn.id;RETURN '{}';END IF;
 IF p_operation='worker.retry' THEN UPDATE synapse_gateway.gmail_import_queue SET status='PENDING',error_code=NULL WHERE connection_id=conn.id AND status='FAILED';RETURN '{}';END IF;
 IF p_operation='worker.finish' THEN UPDATE synapse_gateway.gmail_connections SET lease_hash=NULL,lease_until=NULL,last_sync_at=now(),last_error_code=p_input->>'errorCode',status=CASE WHEN p_input->>'errorCode'='GMAIL_REAUTHORIZE_REQUIRED' THEN 'REAUTH_REQUIRED' ELSE status END WHERE id=conn.id;RETURN '{}';END IF;
 IF p_operation='worker.ingest' THEN
  IF NOT EXISTS(SELECT FROM synapse.users u JOIN synapse.user_bureau_memberships m USING(user_id) JOIN synapse.bureaus b ON b.bureau_id=m.bureau_id AND b.is_active JOIN synapse.user_role_assignments a USING(user_id) JOIN synapse.roles r USING(role_id) WHERE u.user_id=conn.review_owner_id AND m.bureau_id=conn.bureau_id AND r.role_code='CASE_OFFICER' AND (a.scope_type='GLOBAL' OR a.bureau_id=m.bureau_id)) THEN RAISE EXCEPTION 'Intake authority changed' USING ERRCODE='42501';END IF;
  IF length(p_input->>'body')>200000 OR length(p_input->>'subject')>4000 OR octet_length(decode(p_input->>'rawMime','base64'))>8388608 OR jsonb_array_length(p_input->'attachments')>20 THEN RAISE EXCEPTION 'Email size limit' USING ERRCODE='22023';END IF;
  IF NOT EXISTS(SELECT FROM synapse_gateway.gmail_import_queue q WHERE q.id=(p_input->>'queueId')::uuid AND q.connection_id=conn.id AND q.message_id=p_input->>'messageId' AND q.status='RUNNING') THEN RAISE EXCEPTION 'Claimed message required' USING ERRCODE='42501';END IF;
  SELECT inbound_message_id INTO mid FROM synapse.inbound_messages WHERE integration_source_id=conn.source_id AND external_message_id=p_input->>'messageId';
  IF mid IS NOT NULL THEN UPDATE synapse_gateway.gmail_import_queue SET status='INGESTED',error_code=NULL WHERE id=(p_input->>'queueId')::uuid;RETURN jsonb_build_object('duplicate',true);END IF;
  mid:=gen_random_uuid();sid:=gen_random_uuid();
  SELECT d.submission_id INTO dup FROM synapse.case_submissions d JOIN synapse.inbound_messages m USING(inbound_message_id) WHERE m.integration_source_id=conn.source_id AND m.normalized_fingerprint=p_input->>'fingerprint' LIMIT 1;
  INSERT INTO synapse.inbound_messages(inbound_message_id,integration_source_id,external_message_id,internet_message_id,sender_address,subject,received_at,raw_body_storage_key,normalized_fingerprint,message_status) VALUES(mid,conn.source_id,p_input->>'messageId',p_input->>'internetMessageId',p_input->>'sender',p_input->>'subject',(p_input->>'receivedAt')::timestamptz,'private-postgres-gmail:'||mid,p_input->>'fingerprint','RECEIVED');
  INSERT INTO synapse_gateway.gmail_message_bytes(inbound_message_id,connection_id,raw_mime) VALUES(mid,conn.id,decode(p_input->>'rawMime','base64'));
  INSERT INTO synapse.case_submissions(submission_id,inbound_message_id,source_type,source_reference,submitted_by_user_id,original_language_code,original_subject,original_body,submission_status,duplicate_of_submission_id,received_at,intake_bureau_id,intake_owner_user_id,mail_connection_id) VALUES(sid,mid,'EMAIL','gmail:'||conn.id||':'||(p_input->>'messageId'),NULL,'und',p_input->>'subject',p_input->>'body','DRAFT',dup,(p_input->>'receivedAt')::timestamptz,conn.bureau_id,conn.review_owner_id,conn.id);
  FOR item IN SELECT value FROM jsonb_array_elements(p_input->'attachments') LOOP INSERT INTO synapse_gateway.gmail_attachments(submission_id,name,media_type,sha256,bytes,scan) VALUES(sid,item->>'name',item->>'mediaType',item->>'sha256',decode(item->>'bytes','base64'),item->>'scan');END LOOP;
  INSERT INTO synapse.audit_events(actor_user_id,event_type,entity_type,entity_id,reason,metadata) VALUES(NULL,'GMAIL_MESSAGE_INGESTED','submission',sid,'Original Gmail message retained as an unregistered draft; human verification required',jsonb_build_object('connectionId',conn.id,'messageId',p_input->>'messageId','duplicateCandidate',dup,'attachmentCount',jsonb_array_length(p_input->'attachments'),'servicePrincipal','GMAIL_INGESTION'));
  UPDATE synapse_gateway.gmail_import_queue SET status='INGESTED',error_code=NULL WHERE id=(p_input->>'queueId')::uuid;
  UPDATE synapse_gateway.gmail_connections SET last_ingested_at=now(),last_error_code=NULL WHERE id=conn.id;
  RETURN jsonb_build_object('draftId',sid,'duplicateCandidate',dup IS NOT NULL);
 END IF;
 RAISE EXCEPTION 'Unsupported Gmail operation' USING ERRCODE='22023';
END $gmail$;
RESET ROLE;
REVOKE CREATE ON SCHEMA synapse_gateway FROM synapse_gmail_manager;
GRANT synapse_gmail_manager TO postgres WITH INHERIT FALSE,SET FALSE;
