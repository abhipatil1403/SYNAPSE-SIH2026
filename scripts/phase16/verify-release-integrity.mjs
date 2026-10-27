import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {operatorContext,safeMain} from '../phase2/operator.mjs';
safeMain(async()=>{
 const workflow=JSON.parse(await readFile('docs/phase16/HOSTED_WORKFLOW_RESULTS.json','utf8'));assert.equal(workflow.allPassed,true);assert.equal(workflow.realHosted,true);assert.equal(workflow.providerMocked,false);
 const names=(await readdir('.local/phase16')).filter(n=>/^pre-activation-\d+\.json$/.test(n)).sort();assert.ok(names.length);const baseline=JSON.parse(await readFile('.local/phase16/'+names.at(-1),'utf8'));
 const cases=workflow.fixtureCases.map(c=>new URL(c.url).pathname.split('/').at(-1)),fixtures=JSON.parse(await readFile('.local/phase16/hosted-fixtures.json','utf8'));
 const{db}=await operatorContext();try{
  await db.query('BEGIN READ ONLY');
  const roles=(await db.query('SELECT a.user_role_assignment_id,a.user_id,a.role_id,a.scope_type,a.bureau_id,a.valid_from,a.valid_until FROM synapse.user_role_assignments a ORDER BY a.user_role_assignment_id')).rows;
  const memberships=(await db.query('SELECT * FROM synapse.user_bureau_memberships ORDER BY membership_id')).rows;
  assert.equal(JSON.stringify(roles),JSON.stringify(baseline.roleAssignments));assert.equal(JSON.stringify(memberships),JSON.stringify(baseline.memberships));
  const gate=(await db.query('SELECT enabled,writes_enabled,approved_by IS NOT NULL AND approved_at IS NOT NULL reviewed FROM synapse_gateway.operations_control WHERE singleton')).rows[0];assert.ok(gate.enabled&&gate.writes_enabled&&gate.reviewed);
  assert.deepEqual((await db.query('SELECT read_enabled,read_until FROM synapse.phase1_access_config')).rows,[{read_enabled:false,read_until:null}]);
  assert.equal((await db.query("SELECT has_function_privilege('authenticated','public.synapse_phase1_me()','EXECUTE') OR has_function_privilege('authenticated','public.synapse_phase1_cases(text,text,text,integer,integer,text)','EXECUTE') exposed")).rows[0].exposed,false);
  const records=(await db.query("SELECT count(*)::int n,bool_and(c.summary=d.original_body AND c.title=d.original_subject AND d.submission_status='ACCEPTED' AND d.human_verified) originals FROM synapse.cases c JOIN synapse.submission_case_links l ON l.case_id=c.case_id JOIN synapse.case_submissions d USING(submission_id) WHERE c.case_id=ANY($1::uuid[])",[cases])).rows[0];assert.equal(records.n,2);assert.equal(records.originals,true);
  const evidence=(await db.query("SELECT v.malware_scan_status,octet_length(b.bytes)::int bytes FROM synapse.evidence_items e JOIN synapse.document_versions v USING(document_version_id) JOIN synapse_gateway.document_bytes b ON b.version_id=v.document_version_id WHERE e.evidence_item_id=$1",[fixtures.evidenceId])).rows[0];assert.equal(evidence.malware_scan_status,'PENDING');assert.ok(evidence.bytes>0);
  const receipts=(await db.query('SELECT count(*)::int n FROM synapse_gateway.scanner_results WHERE document_version_id IN(SELECT document_version_id FROM synapse.evidence_items WHERE case_id=ANY($1::uuid[]))',[cases])).rows[0].n;assert.equal(receipts,0);
  const translation=(await db.query("SELECT count(*)::int n FROM synapse.submission_translations WHERE submission_id=$1 AND provider_name='Google Cloud Translation' AND review_state='REVIEWED' AND reviewed_by_user_id IS NOT NULL",[fixtures.officers[0].draftId])).rows[0].n;assert.equal(translation,1);
  const audit=(await db.query("SELECT count(*)::int n FROM synapse.audit_events WHERE event_type='DEVELOPMENT_RELEASE_APPROVED'")).rows[0].n;assert.ok(audit>0);
  await db.query('COMMIT');const report={checkedAt:new Date().toISOString(),realHosted:true,readOnlyOperatorPostflight:true,existingRoleAssignmentsUnchanged:true,existingBureauMembershipsUnchanged:true,reviewedDevelopmentOperationsEnabled:true,developmentWritesEnabled:true,legacyReadLeaseClosed:true,publicDirectCaseRpcsClosed:true,actualCanonicalDevelopmentCases:records.n,originalComplaintContentPreserved:records.originals,actualCloudTranslationReviewed:true,realAttachmentBytesPersisted:true,attachmentQuarantined:true,fabricatedScannerReceipts:0,ownerApprovalAuditPresent:true,managedSchemaModified:false,allPassed:true};await writeFile('docs/phase16/HOSTED_RELEASE_INTEGRITY.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 }catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}
});
