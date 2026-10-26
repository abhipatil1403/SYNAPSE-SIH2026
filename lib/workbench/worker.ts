import { randomUUID, createHash } from "node:crypto";
import { WorkbenchStore } from "./store";
import { GeminiEmbeddings, GmailReadOnly } from "../automation/google";
import { IntegrationError,type TranslationProvider } from "../automation/providers";
import { normalizeText, cosine, lexicalSupport } from "../automation/normalization";
import { canRead, role } from "../platform/authorization";
import { snapshotSchema, type State } from "../platform/contracts";
import type { PoolClient } from "pg";
import {scanWithClamAv} from './attachments';
const hash=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
type WorkerSettings={developmentProcessingApproved:boolean;gemini?:GeminiEmbeddings;translation?:TranslationProvider};
function advance(s:State){s.revision=String(BigInt(s.revision)+1n);s.generatedAt=new Date().toISOString();}
/** Claims one durable job; network calls never run inside the locked transaction. */
export async function processOneJob(store:WorkbenchStore,settings:WorkerSettings){
 const job=await store.locked(async c=>{
  const row=(await c.query("SELECT id,kind,target_id,actor_id,bureau_id,payload,attempts FROM workbench.jobs WHERE environment_id=$1 AND ((status='PENDING' AND available_at<=now()) OR (status='RUNNING' AND lease_until<now())) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1",[store.environmentId])).rows[0];if(!row)return null;
  const token=randomUUID();await c.query("UPDATE workbench.jobs SET status='RUNNING',attempts=attempts+1,lease_until=now()+interval '5 minutes',lease_token=$2 WHERE id=$1",[row.id,token]);return {...row,token};
 });if(!job)return false;
 const lease=async(c:PoolClient)=>{const active=await c.query("SELECT 1 FROM workbench.jobs WHERE id=$1 AND lease_token=$2 AND status='RUNNING' AND lease_until>now()",[job.id,job.token]);if(!active.rowCount)throw new IntegrationError('WORKER_LEASE_EXPIRED');};
 try{
  let result:Record<string,unknown>={};
  if(job.kind==='EMAIL'){
   await store.locked(async c=>{await lease(c);const before=await store.intakeState(c,{sourceReference:'gmail:'+job.id,actorId:job.payload.reviewOwnerId}),s=structuredClone(before),now=new Date().toISOString(),owner=s.staff.find(u=>u.id===job.payload.reviewOwnerId&&u.active);
    if(!owner||!role(owner,'CASE_OFFICER',job.bureau_id,now))throw new IntegrationError('CURRENT_INTAKE_REVIEW_OWNER_REQUIRED',false);
    if(typeof job.payload.body!=='string'||job.payload.body.length>200000)throw new IntegrationError('EMAIL_BODY_REQUIRES_MANUAL_REVIEW',false);
    // Job UUID binds mailbox+message receipts without cross-mailbox message-ID
    // collisions or disclosing the mailbox address in the source reference.
    const sourceReference='gmail:'+job.id;if(s.drafts.some(d=>d.source==='EMAIL'&&d.sourceReference===sourceReference)){result={idempotent:true};return;}
    const repeated=(await c.query('SELECT 1 FROM workbench.message_receipts own JOIN workbench.message_receipts other ON own.environment_id=other.environment_id AND own.body_fingerprint=other.body_fingerprint AND own.job_id<>other.job_id WHERE own.job_id=$1 LIMIT 1',[job.id])).rowCount!>0;
    const id=randomUUID();s.drafts.push({id,source:'EMAIL',sourceReference,subject:job.payload.subject,body:job.payload.body,language:'und',institutionId:null,bureauId:job.bureau_id,creatorId:owner.id,state:'DRAFT',verified:false,reviewerId:null,linkedCaseId:null,receivedAt:job.payload.receivedAt,version:'1',ingestedBy:'GMAIL_WORKER',repeatedSubmission:repeated});
    snapshotSchema.shape.drafts.parse(s.drafts);advance(s);await store.save(c,before,s);result={draftId:id,humanVerificationRequired:true,originalMimeRetained:true,attachmentCount:job.payload.attachments?.length??0};
   });
  }else if(job.kind==='TRANSLATE'){
   if(!settings.translation)throw new IntegrationError('INDICTRANS_CONFIGURATION_REQUIRED',false);
   const source=await store.locked(async c=>{await lease(c);const s=await store.intakeState(c,{draftId:job.target_id}),d=s.drafts.find(d=>d.id===job.target_id);if(!d)throw new IntegrationError('DRAFT_UNAVAILABLE',false);return {draft:structuredClone(d),fingerprint:hash(d.language+'\n'+d.subject+'\n'+d.body)};});
   const translated=await settings.translation.translate(source.draft.subject,source.draft.body,source.draft.language);
   await store.locked(async c=>{await lease(c);const before=await store.intakeState(c,{draftId:source.draft.id}),s=structuredClone(before),d=s.drafts.find(d=>d.id===source.draft.id);if(!d||hash(d.language+'\n'+d.subject+'\n'+d.body)!==source.fingerprint)throw new IntegrationError('SOURCE_CHANGED');
    if(translated.required===false){d.language='en';d.version=String(BigInt(d.version)+1n);advance(s);await store.save(c,before,s);return;}
    if(!s.translations?.some(t=>t.draftId===d.id&&t.provider===translated.provider&&t.reviewStatus!=='SUPERSEDED')){s.translations??=[];s.translations.push({id:randomUUID(),draftId:d.id,language:translated.language,subject:translated.subject,body:translated.body,provider:translated.provider,version:translated.version,machineSubject:translated.subject,machineBody:translated.body,correctedBy:null,reason:'Actual model response; human comparison with original required',modelId:translated.modelId,modelRevision:translated.modelRevision,targetLanguage:translated.targetLanguage,detector:translated.detector,reviewStatus:'NEEDS_REVIEW'});d.version=String(BigInt(d.version)+1n);advance(s);await store.save(c,before,s);}
   });result={provider:translated.provider,version:translated.version,language:translated.language,confidence:translated.score,humanReviewRequired:true};
  }else if(job.kind==='MATCH'){
   const source=await store.locked(async c=>{
    await lease(c);const initial=await store.intakeState(c,{draftId:job.target_id,actorId:job.actor_id}),d=initial.drafts.find(d=>d.id===job.target_id),u=initial.staff.find(u=>u.id===job.actor_id&&u.active);if(!d||!u||!role(u,'CASE_OFFICER',d.bureauId,new Date().toISOString()))throw new IntegrationError('SOURCE_OR_REVIEW_OWNER_UNAVAILABLE',false);
    if(!d.institutionId)throw new IntegrationError('HUMAN_INSTITUTION_VERIFICATION_REQUIRED',false);
    const normalized=normalizeText(d.subject,true)+'\n'+normalizeText(d.body),fingerprint=hash(d.institutionId+'\n'+normalized);
    await c.query("INSERT INTO workbench.draft_indexes(draft_id,environment_id,institution_id,fingerprint,lexemes) VALUES($1,$2,$3,$4,to_tsvector('simple',$5)) ON CONFLICT(draft_id) DO UPDATE SET institution_id=excluded.institution_id,fingerprint=excluded.fingerprint,lexemes=excluded.lexemes,updated_at=now()",[d.id,store.environmentId,d.institutionId,fingerprint,normalized]);
    const rows=(await c.query("SELECT i.draft_id,i.fingerprint FROM workbench.draft_indexes i WHERE i.environment_id=$1 AND i.institution_id=$2 AND i.draft_id<>$3 ORDER BY (i.fingerprint=$4) DESC,i.updated_at DESC LIMIT 49",[store.environmentId,d.institutionId,d.id,fingerprint])).rows;
    const s=await store.intakeState(c,{draftId:d.id,actorId:job.actor_id,candidateIds:rows.map(r=>r.draft_id)});
    const candidates=rows.flatMap(row=>{const draft=s.drafts.find(x=>x.id===row.draft_id),record=s.cases.find(x=>x.id===draft?.linkedCaseId);return draft&&record&&canRead(s,u,record,new Date().toISOString())?[{draftId:draft.id,caseId:record.id,text:normalizeText(draft.subject,true)+'\n'+normalizeText(draft.body),fingerprint:row.fingerprint,caseVersion:record.version,features:`Category ${d.categoryHint&&d.categoryHint===record.categoryId?'matches':'not verified'}; course ${d.course&&draft.course&&normalizeText(d.course)===normalizeText(draft.course)?'matches':'not verified'}; issue ${d.issue&&draft.issue&&normalizeText(d.issue)===normalizeText(draft.issue)?'matches':'not verified'}; received-date distance ${Math.floor(Math.abs(Date.parse(d.receivedAt)-Date.parse(draft.receivedAt))/86400000)} days`}]:[];});
    const categories=(await c.query('SELECT id,body->>\'name\' name FROM workbench.categories WHERE environment_id=$1 ORDER BY id LIMIT 49',[store.environmentId])).rows as {id:string;name:string}[];
    return {draftId:d.id,institutionId:d.institutionId,fingerprint,normalized,candidates,categories};
   });
   const exact=source.candidates.filter(c=>c.fingerprint===source.fingerprint),others=source.candidates.filter(c=>c.fingerprint!==source.fingerprint);
   let embeddings:number[][]|undefined;const semanticBlocked=(others.length>0||source.categories.length>0)&&(!settings.developmentProcessingApproved||!settings.gemini);
   if(others.length&&!semanticBlocked)embeddings=await settings.gemini!.embed([source.normalized,...others.map(c=>c.text)]);
   const categoryEmbeddings=source.categories.length&&!semanticBlocked?await settings.gemini!.embed([source.normalized,...source.categories.map(c=>c.name)]):null;
   await store.locked(async c=>{await lease(c);const before=await store.intakeState(c,{draftId:source.draftId,actorId:job.actor_id,candidateIds:source.candidates.map(d=>d.draftId)}),s=structuredClone(before),d=s.drafts.find(d=>d.id===source.draftId),u=s.staff.find(u=>u.id===job.actor_id&&u.active);
    if(!d||!u||hash(d.institutionId+'\n'+normalizeText(d.subject,true)+'\n'+normalizeText(d.body))!==source.fingerprint)throw new IntegrationError('SOURCE_CHANGED');
    if(categoryEmbeddings){d.categorySuggestions=source.categories.map((category,i)=>({categoryId:category.id,similarity:cosine(categoryEmbeddings[0],categoryEmbeddings[i+1]),providerVersion:settings.gemini!.version})).sort((a,b)=>b.similarity-a.similarity).slice(0,3);d.version=String(BigInt(d.version)+1n);}
    for(const candidate of source.candidates){const record=s.cases.find(x=>x.id===candidate.caseId);if(!record||record.version!==candidate.caseVersion||!canRead(s,u,record,new Date().toISOString()))continue;
     if(s.matches.some(m=>m.draftId===d.id&&m.caseId===record.id&&m.sourceFingerprint===source.fingerprint))continue;
     const identical=exact.some(e=>e.caseId===candidate.caseId);if(!identical&&!embeddings)continue;
     const index=others.findIndex(e=>e.caseId===candidate.caseId),score=identical?1:cosine(embeddings![0],embeddings![index+1]);
     const recommendation=identical||score>=.90?'DUPLICATE':score>=.75?'RELATED':'DISTINCT';
     s.matches.push({id:randomUUID(),draftId:d.id,caseId:record.id,algorithmVersion:identical?'exact-normalized-fingerprint/1':settings.gemini!.version,similarity:score,recommendation,sourceFingerprint:source.fingerprint,
      explanation:identical?'Same normalized institution/source content fingerprint. Human duplicate review required.':`Actual embedding cosine ${score.toFixed(4)}; institution matches; ${candidate.features}; supporting terms: ${lexicalSupport(source.normalized,candidate.text).join(', ')||'none'}. Development thresholds 0.90/0.75 are uncalibrated review aids, not confidence or an automatic decision.`,decision:'PENDING',reviewerId:null,reason:''});
    }
    advance(s);await store.save(c,before,s);
    if(embeddings)await c.query('UPDATE workbench.draft_indexes SET embedding=$2,model_version=$3 WHERE draft_id=$1',[d.id,embeddings[0],settings.gemini!.version]);
   });if(semanticBlocked)throw new IntegrationError('APPROVED_GEMINI_CONFIGURATION_REQUIRED',false);
   result={provider:embeddings||categoryEmbeddings?'Google Gemini':null,modelVersion:embeddings||categoryEmbeddings?settings.gemini!.version:null,shortlistCount:source.candidates.length,shortlistLimit:49,exactCandidates:exact.length,semanticExecuted:!!embeddings,categorySuggestionsExecuted:!!categoryEmbeddings,humanReviewRequired:true};
  }
  await store.locked(async c=>{await c.query("UPDATE workbench.jobs SET status='SUCCEEDED',lease_until=NULL,payload=payload||jsonb_build_object('result',$3::jsonb),error_code=NULL WHERE id=$1 AND lease_token=$2",[job.id,job.token,JSON.stringify(result)]);});
 }catch(error){const e=error instanceof IntegrationError?error:new IntegrationError('PROCESSING_REQUIRES_REVIEW',false),blocked=/CONFIGURATION|VERIFICATION|OWNER|SOURCE_OR/.test(e.code);
  await store.locked(async c=>{await c.query("UPDATE workbench.jobs SET status=$3,lease_until=NULL,error_code=$4,available_at=now()+$5*interval '1 second' WHERE id=$1 AND lease_token=$2",[job.id,job.token,blocked?'BLOCKED':e.retryable&&job.attempts<4?'PENDING':'FAILED',e.code,Math.max(e.retryAfter,Math.min(3600,30*2**job.attempts))]);});
 }return true;
}
/** Rescan bounded quarantined blobs only with an actual configured scanner.
 * Bytes, verdict, evidence revision and audit are committed atomically. */
export async function scanPendingEvidence(store:WorkbenchStore,command?:string){
 if(!command)return 0;
 const blobs=await store.locked(async c=>(await c.query("SELECT id,bytes,sha256,uploader_id,case_id FROM workbench.blobs WHERE environment_id=$1 AND scan='PENDING' ORDER BY created_at LIMIT 10",[store.environmentId])).rows);let count=0;
 for(const blob of blobs){if(hash(blob.bytes)!==blob.sha256)throw new IntegrationError('QUARANTINE_HASH_MISMATCH',false);const verdict=await scanWithClamAv(blob.bytes,command);
  await store.locked(async c=>{const updated=await c.query("UPDATE workbench.blobs SET scan=$3 WHERE environment_id=$1 AND id=$2 AND scan='PENDING' AND sha256=$4 RETURNING id",[store.environmentId,blob.id,verdict,blob.sha256]);if(!updated.rowCount)return;
   await c.query("UPDATE workbench.evidence SET body=jsonb_set(body,'{scan}',to_jsonb($3::text)) WHERE environment_id=$1 AND id=$2",[store.environmentId,blob.id,verdict]);
   await c.query("UPDATE workbench.cases SET body=body||jsonb_build_object('version',((body->>'version')::bigint+1)::text,'updatedAt',$3::text) WHERE environment_id=$1 AND id=$2",[store.environmentId,blob.case_id,new Date().toISOString()]);
   const audit={id:randomUUID(),caseId:blob.case_id,actorId:blob.uploader_id,type:'EVIDENCE_SCANNER_RESULT',reason:`Actual configured ClamAV verdict: ${verdict}. Uploader identifies source; verdict produced by scanner worker.`,at:new Date().toISOString()};
   await c.query('INSERT INTO workbench.activity(id,environment_id,body) VALUES($1,$2,$3)',[audit.id,store.environmentId,audit]);await c.query('UPDATE workbench.meta SET revision=revision+1 WHERE environment_id=$1',[store.environmentId]);count++;
  });
 }return count;
}
/** Actual persisted reminder/escalation delivery, with no status manipulation. */
export async function processDevelopmentSla(store:WorkbenchStore){return store.locked(async c=>{
 const before=await store.load(c),s=structuredClone(before),now=Date.now();const rules=(await c.query('SELECT policy_id,reminder_minutes FROM workbench.sla_rules WHERE environment_id=$1 AND enabled',[store.environmentId])).rows;let count=0;
 for(const sla of s.sla.filter(x=>['RUNNING','BREACHED'].includes(x.status))){const record=s.cases.find(x=>x.id===sla.caseId);if(!record||record.status==='DISPOSED')continue;const rule=rules.find(r=>r.policy_id===sla.policyVersionId);if(!rule||now<Date.parse(sla.dueAt)-rule.reminder_minutes*60000)continue;
  const overdue=now>=Date.parse(sla.dueAt),recipients=s.staff.filter(u=>u.active&&canRead(s,u,record,new Date(now).toISOString())&&(u.id===record.officerId||overdue&&role(u,'BUREAU_HEAD',record.bureauId,new Date(now).toISOString())));
  for(const user of recipients){const kind=overdue?'OVERDUE':'REMINDER',key=[sla.id,sla.dueAt,user.id,kind].join(':'),id=randomUUID();
   const receipt=await c.query('INSERT INTO workbench.deliveries(id,environment_id,sla_id,recipient_id,kind,due_at,notification_id) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING RETURNING id',[key,store.environmentId,sla.id,user.id,kind,sla.dueAt,id]);
   if(receipt.rowCount){s.notifications.push({id,userId:user.id,caseId:record.id,title:`${kind==='OVERDUE'?'Overdue':'Upcoming deadline'}: case #${record.caseNumber}`,at:new Date(now).toISOString(),readAt:null});count++;}
  }
 }
 if(count){advance(s);await store.save(c,before,s);}return count;
});}
/** Gmail OAuth/address approval is validated by the adapter before message reads. */
export async function pollApprovedGmail(store:WorkbenchStore,gmail:GmailReadOnly,config:{address:string;bureauId:string;reviewOwnerId:string;label:string}){
 const profile=await gmail.profile();let cursor=await store.locked(async c=>(await c.query('SELECT page_token,history_id FROM workbench.mail_cursors WHERE environment_id=$1 AND mailbox=$2',[store.environmentId,config.address])).rows[0]);
 if(!cursor){cursor={page_token:'INITIAL:',history_id:profile.historyId};await store.locked(async c=>{await c.query('INSERT INTO workbench.mail_cursors(environment_id,mailbox,page_token,history_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[store.environmentId,config.address,cursor.page_token,cursor.history_id]);});}
 const initial=cursor.page_token?.startsWith('INITIAL:');let ids:string[]=[],next:string|undefined,history=cursor.history_id;
 if(initial){const page=await gmail.list(cursor.page_token.slice(8));ids=(page.messages??[]).map(m=>m.id);next=page.nextPageToken?('INITIAL:'+page.nextPageToken):'HISTORY:';}
 else{try{const page=await gmail.history(history,cursor.page_token?.slice(8)??'');ids=[...new Set((page.history??[]).flatMap(h=>(h.messagesAdded??[]).filter(m=>!m.message.labelIds||m.message.labelIds.includes(config.label)).map(m=>m.message.id)))];next=page.nextPageToken?'HISTORY:'+page.nextPageToken:'HISTORY:';if(!page.nextPageToken)history=page.historyId;}
  catch(error){if(error instanceof IntegrationError&&error.code==='PROVIDER_HTTP_404'){await store.locked(async c=>{await c.query("UPDATE workbench.mail_cursors SET page_token='INITIAL:',history_id=$3 WHERE environment_id=$1 AND mailbox=$2",[store.environmentId,config.address,profile.historyId]);});return 0;}throw error;}}
 let count=0;for(const id of ids){const known=await store.locked(async c=>(await c.query('SELECT 1 FROM workbench.message_receipts WHERE environment_id=$1 AND mailbox=$2 AND message_id=$3',[store.environmentId,config.address,id])).rowCount);if(known)continue;
  const message=await gmail.message(id),content=hash(normalizeText(message.subject,true)+'\n'+normalizeText(message.body)+'\n'+message.attachments.map(a=>hash(a.bytes)).sort().join(':')),sender=hash(message.sender.toLowerCase()+content);
  await store.locked(async c=>{const job=(await c.query("INSERT INTO workbench.jobs(environment_id,kind,bureau_id,dedupe_key,payload) VALUES($1,'EMAIL',$2,$3,$4) ON CONFLICT(dedupe_key) DO UPDATE SET dedupe_key=excluded.dedupe_key RETURNING id",[store.environmentId,config.bureauId,'gmail:'+config.address+':'+id,{...message,messageId:id,reviewOwnerId:config.reviewOwnerId,attachments:message.attachments.map(a=>({name:a.name,mediaType:a.mediaType,sha256:hash(a.bytes),base64:a.bytes.toString('base64')}))}])).rows[0];await c.query('INSERT INTO workbench.message_receipts VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',[store.environmentId,config.address,id,content,sender,job.id]);});count++;
 }
 await store.locked(async c=>{await c.query('UPDATE workbench.mail_cursors SET page_token=$3,history_id=$4,updated_at=now() WHERE environment_id=$1 AND mailbox=$2 AND page_token IS NOT DISTINCT FROM $5',[store.environmentId,config.address,next,history,cursor.page_token]);});return count;
}
