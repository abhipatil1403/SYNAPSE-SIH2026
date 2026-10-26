import pg from 'pg';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {WorkbenchStore,collections,makeWorkbenchPool} from '../../lib/workbench/store';
import {PlatformEngine} from '../../lib/platform/engine';
import {platformFixture,principal,fixtureId as id} from '../../tests/fixtures/platform';
import type {Command} from '../../lib/platform/contracts';
import {processDevelopmentSla,processOneJob} from '../../lib/workbench/worker';
import {platformDashboard} from '../../lib/platform/selectors';
import {inspectAttachment} from '../../lib/workbench/attachments';
import {GeminiEmbeddings,GoogleCloudTranslation} from '../../lib/automation/google';
async function run(){
const root=new URL(process.env.SYNAPSE_TEST_DATABASE_URL??'postgresql://postgres@127.0.0.1:55432/postgres');
if(!['localhost','127.0.0.1'].includes(root.hostname))throw Error('Disposable workbench tests require a loopback test cluster.');
const name='synapse_workbench_'+randomBytes(6).toString('hex'),env=randomUUID(),admin=new pg.Client({connectionString:root.href});await admin.connect();
const password=randomBytes(36).toString('base64url');let pool:ReturnType<typeof makeWorkbenchPool>|undefined,db:pg.Client|undefined,created=false;
try{
 assert.equal((await admin.query("SELECT count(*)::int n FROM pg_roles WHERE rolname IN('synapse_workbench_owner','synapse_workbench_runtime','synapse_workbench_login')")).rows[0].n,0,'Dedicated test cluster required; never modify the persistent manual environment.');
 await admin.query('CREATE DATABASE '+name);created=true;root.pathname='/'+name;db=new pg.Client({connectionString:root.href});await db.connect();
 const sql=await readFile('supabase/candidates/20261026200946_phase8_isolated_workbench.sql','utf8'),fix=await readFile('supabase/candidates/20261026202545_phase8_workbench_owner_schema_usage.sql','utf8');
 await db.query('BEGIN');await db.query("SELECT set_config('synapse.workbench.install','isolated-development-approved',true)");await db.query(sql);await db.query(fix);
 await db.query(await readFile('supabase/candidates/20261026210139_phase8_workbench_worker_indexes.sql','utf8'));
 await db.query('INSERT INTO workbench.meta(environment_id,revision,next_case_number,mode,schema_hash) VALUES($1,1,9004,\'ISOLATED_DEVELOPMENT\',$2)',[env,createHash('sha256').update(sql+fix).digest('hex')]);
 const fixture=platformFixture();fixture.staff.push({id:id(5),authId:id(105),name:'Synthetic independent destination head',active:true,memberships:[{bureauId:id(12),from:'2026-01-01T00:00:00Z',until:'2026-12-01T00:00:00Z'}],roles:[{code:'BUREAU_HEAD',bureauId:id(12),from:'2026-01-01T00:00:00Z',until:'2026-12-01T00:00:00Z'}]});
 for(const table of collections)for(const row of fixture[table]??[])await db.query(`INSERT INTO workbench."${table}"(id,environment_id,body) VALUES($1,$2,$3)`,[row.id,env,JSON.stringify(row)]);
 // Test-only random login; never printed or reused in manual/hosted data.
 await db.query(`CREATE ROLE synapse_workbench_login LOGIN NOINHERIT NOBYPASSRLS PASSWORD '${password}'`);await db.query('GRANT synapse_workbench_runtime TO synapse_workbench_login WITH INHERIT FALSE,SET TRUE');await db.query('COMMIT');
 root.username='synapse_workbench_login';root.password=password;pool=makeWorkbenchPool(root.href);const store=new WorkbenchStore(pool,env),engine=new PlatformEngine(store),send=(command:Command,n=1,key=randomUUID())=>engine.execute(principal(n),{idempotencyKey:key,command});
 assert.equal((await engine.snapshot(principal())).cases.length,2);assert.equal((await engine.snapshot(principal(2))).cases.length,1);
 const raw=await pool.connect();try{await raw.query('BEGIN; SET LOCAL ROLE synapse_workbench_runtime');assert.equal((await raw.query('SELECT count(*)::int n FROM workbench.cases')).rows[0].n,0);await assert.rejects(raw.query('SET ROLE synapse_workbench_owner'),{code:'42501'});await raw.query('ROLLBACK');}finally{raw.release();}
 console.log('PASS isolated SQL RLS environment fence; non-owning runtime; scoped domain projection (synthetic test identities).');
 const institution=await send({type:'institution.create',permanentId:'  dev-123  ',name:'Database engineering institution',state:'Development state',region:'Development region'});
 await assert.rejects(send({type:'institution.create',permanentId:'DEV-123',name:'Duplicate normalized ID',state:'',region:''}));
 const register=async(reference:string)=>{const draft=await send({type:'draft.create',sourceReference:reference,source:'MANUAL',subject:'Persisted database complaint '+reference,body:'Development test content retained.',language:'en',bureauId:id(11),institutionId:null});await send({type:'draft.verify',draftId:draft.entityId,expectedVersion:'1',institutionId:institution.entityId,reason:'Synthetic human verification for database engineering'});const key=randomUUID(),command:Command={type:'draft.register',draftId:draft.entityId,expectedVersion:'2',categoryId:id(14),officerId:id(1),priority:'NORMAL',discoveryAllowed:true};const result=await send(command,1,key);assert.deepEqual(await send(command,1,key),result);return result.entityId;};
 const first=await register('transaction-one'),second=await register('transaction-two');
 const a=await engine.snapshot(principal()),dashboard=platformDashboard(a,new Date().toISOString());assert.equal(a.cases.length,4);assert.equal(dashboard.total,4);assert.equal((await db.query('SELECT count(*)::int n FROM workbench.cases')).rows[0].n,5);
 console.log('PASS real PostgreSQL institution uniqueness, verified intake, registration, durable idempotency and dashboard reconciliation.');
 const competing=await Promise.allSettled([send({type:'case.priority',caseId:first,expectedVersion:'1',priority:'HIGH',reason:'Concurrent engineering update'}),send({type:'comment.add',caseId:first,expectedVersion:'1',body:'Concurrent engineering comment'})]);assert.equal(competing.filter(r=>r.status==='fulfilled').length,1);
 const version=async(caseId:string,n=3)=>(await engine.snapshot(principal(n))).cases.find(c=>c.id===caseId)!.version;
 const discovery=(await engine.snapshot(principal(2))).discovery!.find(c=>c.id===first)!;assert.ok(discovery);assert.ok(!('summary' in discovery)&&!('subject' in discovery));
 const request=await send({type:'access.request',caseId:first,scope:'DETAILS',until:new Date(Date.now()+3600000).toISOString(),reason:'Synthetic independent Bureau access request'},2);
 await send({type:'access.decide',caseId:first,expectedVersion:await version(first),requestId:request.entityId,decision:'APPROVED',reason:'Synthetic source Bureau approval'},3);
 assert.ok((await engine.snapshot(principal(2))).cases.some(c=>c.id===first));assert.equal((await engine.snapshot(principal(2))).evidence.length,0);
 await send({type:'access.revoke',caseId:first,expectedVersion:await version(first),userId:id(2),scope:'DETAILS',reason:'Synthetic scope revocation'},3);assert.ok(!(await engine.snapshot(principal(2))).cases.some(c=>c.id===first));
 console.log('PASS competing transaction/version handling, sanitized discovery, independent scoped grants and actual persisted revocation.');
 await send({type:'action.record',caseId:first,expectedVersion:await version(first),actionType:'INSPECTION',topic:'Development safety review',from:new Date().toISOString(),until:new Date(Date.now()+3600000).toISOString(),reason:'Recorded development action'},3);
 await send({type:'action.record',caseId:second,expectedVersion:await version(second),actionType:'INSPECTION',topic:'Development safety review',from:new Date().toISOString(),until:new Date(Date.now()+3600000).toISOString(),reason:'Recorded overlapping development action'},3);
 const conflict=(await engine.snapshot(principal(3))).conflicts![0];assert.ok(conflict);await send({type:'conflict.review',caseId:second,expectedVersion:await version(second),conflictId:conflict.id,decision:'DISMISSED',reason:'Synthetic independent recorded-action review'},3);
 const policy=id(15);await send({type:'sla.set',caseId:first,expectedVersion:await version(first),dueAt:new Date(Date.now()+10000).toISOString(),policyId:policy,reason:'Explicit development-only deadline'},3);
 const originalDue=(await engine.snapshot(principal(3))).sla.find(s=>s.caseId===first)!.originalDueAt;
 const transfer=await send({type:'transfer.request',caseId:first,expectedVersion:await version(first),bureauId:id(12),officerId:id(2),reason:'Synthetic ordinary source-head request'},3);
 const pending=(await engine.snapshot(principal(5))).transfers.find(t=>t.id===transfer.entityId); // transfer result identifies case, use stored request below
 void pending;
 const requestRow=(await engine.snapshot(principal(5))).transfers.find(t=>t.caseId===first)!;assert.ok(requestRow);assert.ok(!(await engine.snapshot(principal(5))).cases.some(c=>c.id===first));
 await send({type:'transfer.decide',caseId:first,expectedVersion:requestRow.expectedVersion,transferId:requestRow.id,decision:'COMPLETED',reason:'Synthetic independent destination approval'},5);
 const moved=await engine.snapshot(principal(2));assert.ok(moved.cases.some(c=>c.id===first));assert.equal(moved.sla.find(s=>s.caseId===first)!.originalDueAt,originalDue);
 console.log('PASS persisted action/conflict review and ordinary independent source/destination transfer; original SLA retained.');
 // A reviewed development deadline and rule produces durable deliveries exactly once.
 await db.query('INSERT INTO workbench.sla_rules(environment_id,policy_id,reminder_minutes,enabled,actor_id,reason) VALUES($1,$2,60,true,$3,\'Synthetic scheduler rule\')',[env,policy,id(3)]);
 const delivered=await processDevelopmentSla(store);assert.ok(delivered>=1);assert.equal(await processDevelopmentSla(store),0);
 const jobs=(await db.query('SELECT count(*)::int n FROM workbench.jobs')).rows[0].n;assert.ok(jobs>=2);
 for(let i=0;i<10;i++)if(!await processOneJob(store,{developmentProcessingApproved:false}))break;
 assert.ok((await db.query("SELECT count(*)::int n FROM workbench.jobs WHERE status IN('BLOCKED','SUCCEEDED')")).rows[0].n>=1);
 console.log('PASS durable jobs, indexed source shortlisting/provider-blocked states and persisted idempotent SLA notifications; no real provider inference claimed.');
 // Real bytea persistence and closure authorization; scanner/provider responses
 // are not mocked into a CLEAN result. UTF-8 text uses the explicit text policy.
 const evidenceId=randomUUID(),versionId=randomUUID(),bytes=Buffer.from('Synthetic database engineering evidence'),inspection=inspectAttachment(bytes,'engineering.txt');
 await store.locked(async c=>{const before=await store.load(c),next=structuredClone(before);await new PlatformEngine({transaction:async work=>work(next)}).execute(principal(3),{idempotencyKey:randomUUID(),command:{type:'evidence.attach',caseId:second,expectedVersion:next.cases.find(c=>c.id===second)!.version,evidence:{id:evidenceId,caseId:second,documentId:randomUUID(),versionId,number:1,name:inspection.name,mediaType:inspection.mediaType,byteSize:bytes.length,sha256:inspection.sha256,scan:inspection.scan,status:'SUBMITTED',source:'Explicit synthetic engineering text policy',createdAt:new Date().toISOString()}}});await c.query('INSERT INTO workbench.blobs(id,environment_id,case_id,version_id,name,media_type,sha256,bytes,scan,uploader_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[evidenceId,env,second,versionId,inspection.name,inspection.mediaType,inspection.sha256,bytes,inspection.scan,id(3)]);await store.save(c,before,next);});
 assert.deepEqual((await db.query('SELECT bytes FROM workbench.blobs WHERE id=$1',[evidenceId])).rows[0].bytes,bytes);
 await send({type:'evidence.review',caseId:second,expectedVersion:await version(second),evidenceId,status:'VERIFIED',reason:'Synthetic evidence review by source Bureau head'},3);
 for(const status of ['ASSIGNED','UNDER_REVIEW'] as const)await send({type:'case.transition',caseId:second,expectedVersion:await version(second),status,reason:'Synthetic reviewed lifecycle transition'},3);
 const evaluation=await send({type:'closure.evaluate',caseId:second,expectedVersion:await version(second),policyId:policy},3);
 await assert.rejects(send({type:'closure.dispose',caseId:second,expectedVersion:await version(second),evaluationId:evaluation.entityId,reason:'Unauthorized officer disposal attempt'},1));
 await send({type:'closure.dispose',caseId:second,expectedVersion:await version(second),evaluationId:evaluation.entityId,reason:'Synthetic authorized final disposal'},3);
 await assert.rejects(send({type:'comment.add',caseId:second,expectedVersion:await version(second),body:'Closed record must reject mutation'},3));
 console.log('PASS actual evidence bytes/hash persistence, independent verification, full lifecycle/Quality Gate disposal and closed-record write denial.');
 // Inject synthetic source jobs (not Gmail delivery) to exercise real SQL burst
 // handling, duplicate message receipts and repeated-submission identification.
 for(let n=0;n<40;n++){const messageId='synthetic-burst-'+n,job=randomUUID(),payload={messageId,reviewOwnerId:id(1),subject:'Synthetic burst '+n,body:'Synthetic retained source content',receivedAt:new Date().toISOString(),attachments:n===0?[{name:'source.txt',base64:bytes.toString('base64'),sha256:createHash('sha256').update(bytes).digest('hex')}]:[]};await db.query("INSERT INTO workbench.jobs(id,environment_id,kind,bureau_id,dedupe_key,payload) VALUES($1,$2,'EMAIL',$3,$4,$5)",[job,env,id(11),'synthetic:'+messageId,payload]);await db.query('INSERT INTO workbench.message_receipts VALUES($1,$2,$3,$4,$5,$6)',[env,'synthetic@example.invalid',messageId,'same-content','same-sender',job]);}
 for(let n=0;n<180;n++)if(!await processOneJob(store,{developmentProcessingApproved:false}))break;
 assert.equal((await db.query("SELECT count(*)::int n FROM workbench.drafts WHERE body->>'ingestedBy'='GMAIL_WORKER'")).rows[0].n,40);
 assert.equal((await db.query("SELECT count(*)::int n FROM workbench.drafts WHERE body->>'repeatedSubmission'='true'")).rows[0].n,40);
 assert.equal((await db.query("SELECT count(*)::int n FROM workbench.jobs WHERE kind='EMAIL' AND status='SUCCEEDED'")).rows[0].n,40);
 console.log('PASS 40 synthetic-source burst jobs persisted exactly once with repeated-content flags; no mailbox delivery or provider processing claimed.');
 const mailDraft=(await engine.snapshot(principal())).drafts.find(d=>d.ingestedBy==='GMAIL_WORKER'&&d.subject==='Synthetic burst 0')!;await send({type:'draft.verify',draftId:mailDraft.id,expectedVersion:mailDraft.version,institutionId:institution.entityId,reason:'Human verified synthetic email source'});
 const registeredMail=await send({type:'draft.register',draftId:mailDraft.id,expectedVersion:String(BigInt(mailDraft.version)+1n),categoryId:id(14),officerId:id(1),priority:'NORMAL'});
 const retained=(await db.query('SELECT bytes,scan FROM workbench.blobs WHERE case_id=$1',[registeredMail.entityId])).rows;assert.equal(retained.length,1);assert.deepEqual(retained[0].bytes,bytes);assert.equal(retained[0].scan,'NOT_REQUIRED');
 console.log('PASS verified synthetic email registration atomically promotes actual source attachment bytes/hash; no email delivery claim.');
 const multilingual=await send({type:'draft.create',sourceReference:'simulated-provider-pipeline',source:'MANUAL',subject:'मूळ विषय',body:'मूळ तक्रार',language:'mr',bureauId:id(11),institutionId:null});
 await send({type:'draft.verify',draftId:multilingual.entityId,expectedVersion:'1',institutionId:institution.entityId,reason:'Synthetic source institution verification'});
 const gemini=new GeminiEmbeddings('SIMULATED-CONTRACT-ONLY','gemini-embedding-001',async(_input,init)=>Response.json({embeddings:JSON.parse(String(init?.body)).requests.map(()=>({values:Array(768).fill(1)}))}));
 const translation=new GoogleCloudTranslation('SIMULATED-CONTRACT-ONLY',async()=>Response.json({data:{translations:[{translatedText:'Simulated subject',detectedSourceLanguage:'mr'},{translatedText:'Simulated body',detectedSourceLanguage:'mr'}]}}));
 for(let n=0;n<12;n++)if(!await processOneJob(store,{developmentProcessingApproved:true,gemini,translation}))break;
 const translatedState=await engine.snapshot(principal()),source=translatedState.drafts.find(d=>d.id===multilingual.entityId)!;
 assert.equal(source.body,'मूळ तक्रार');assert.ok(source.categorySuggestions?.length);const translated=translatedState.translations!.find(t=>t.draftId===source.id)!;assert.ok(translated);assert.equal(translated.correctedBy,null);
 await assert.rejects(send({type:'draft.register',draftId:source.id,expectedVersion:source.version,categoryId:id(14),officerId:id(1),priority:'NORMAL'}));
 await send({type:'translation.correct',draftId:source.id,translationId:translated.id,expectedVersion:source.version,subject:'Human-reviewed simulated subject',body:'Human-reviewed simulated body',reason:'Synthetic human correction contract'});
 assert.equal((await engine.snapshot(principal())).drafts.find(d=>d.id===source.id)!.body,'मूळ तक्रार');
 console.log('PASS SIMULATED provider responses through real SQL queue/category/translation persistence; original preserved and human-review gate enforced. No real provider claim.');
 const beforeRollback=(await db.query('SELECT revision FROM workbench.meta')).rows[0].revision;
 await assert.rejects(store.locked(async c=>{await c.query('UPDATE workbench.meta SET revision=revision+999');throw Error('SYNTHETIC_ROLLBACK');}));assert.equal((await db.query('SELECT revision FROM workbench.meta')).rows[0].revision,beforeRollback);
 console.log('PASS failed transaction rolls back persisted revision; no partial commit.');
 // Reload through another process-equivalent store to establish database persistence.
 assert.equal((await new PlatformEngine(new WorkbenchStore(pool,env)).snapshot(principal(2))).cases.some(c=>c.id===first),true);
 console.log('PASS PostgreSQL persistence after repository reconstruction. User manual acceptance remains pending.');
}finally{
 await pool?.end();await db?.end();if(created){assert.match(name,/^synapse_workbench_[a-f0-9]{12}$/);await admin.query('DROP DATABASE '+name+' WITH (FORCE)');for(const role of ['synapse_workbench_login','synapse_workbench_runtime','synapse_workbench_owner'])await admin.query('DROP ROLE '+role);}await admin.end();
}
}
run().catch(error=>{console.error(error instanceof Error?error.message:'Disposable database verification failed.');process.exitCode=1;});
