import {IndicTrans2} from '../lib/automation/indictrans';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GeminiEmbeddings,GmailReadOnly} from '../lib/automation/google';
import {inspectAttachment,scanWithClamAv} from '../lib/workbench/attachments';
import {workbenchConfig} from '../lib/workbench/config';
import {activation} from '../lib/platform/repository';
import {draftSchema} from '../lib/platform/contracts';

test('original complaint text retains whitespace/scripts; whitespace-only intake is rejected',()=>{
 const original='  मूळ तक्रार\nसंपूर्ण मजकूर  ';
 assert.equal(draftSchema.shape.body.parse(original),original);assert.equal(draftSchema.shape.body.safeParse(' \n ').success,false);
});
test('isolated database configuration cannot redirect the write adapter to hosted or arbitrary databases',()=>{
 const env={SYNAPSE_WORKBENCH_ENABLED:'true',SYNAPSE_WORKBENCH_DATABASE_URL:'postgresql://synapse_workbench_login:contract-only@127.0.0.1:55433/synapse_workbench_123456abcdef',SYNAPSE_WORKBENCH_ID:'30000000-0000-4000-8000-000000000001'};
 assert.ok(workbenchConfig(env));
 for(const url of [env.SYNAPSE_WORKBENCH_DATABASE_URL.replace('127.0.0.1','db.example.supabase.co'),env.SYNAPSE_WORKBENCH_DATABASE_URL.replace('synapse_workbench_123456abcdef','postgres'),env.SYNAPSE_WORKBENCH_DATABASE_URL.replace('synapse_workbench_login','postgres')])assert.throws(()=>workbenchConfig({...env,SYNAPSE_WORKBENCH_DATABASE_URL:url}));
 assert.equal(activation.businessWrites,false);assert.equal(activation.reads,false);assert.equal(workbenchConfig({}),null);
});
test('SIMULATED Gemini HTTP contract sends bounded real API shape and rejects malformed/zero embeddings',async()=>{
 const fetcher:typeof fetch=async(input,init)=>{assert.equal(new URL(String(input)).search,'');assert.equal(new Headers(init?.headers).get('x-goog-api-key'),'contract-key');const body=JSON.parse(String(init?.body));assert.equal(body.requests[0].taskType,'SEMANTIC_SIMILARITY');assert.equal(body.requests[0].outputDimensionality,768);return Response.json({embeddings:body.requests.map(()=>({values:Array(768).fill(1)}))});};
 const provider=new GeminiEmbeddings('contract-key','gemini-embedding-001',fetcher),vectors=await provider.embed(['Authorized contract fixture']);assert.equal(vectors[0].length,768);assert.ok(Math.abs(Math.hypot(...vectors[0])-1)<1e-10);
 await assert.rejects(new GeminiEmbeddings('contract-key','gemini-embedding-001',async()=>Response.json({embeddings:[{values:[1]}]})).embed(['Fixture']));
 await assert.rejects(new GeminiEmbeddings('contract-key','gemini-embedding-001',async()=>Response.json({embeddings:[{values:Array(768).fill(0)}]})).embed(['Fixture']));
});
test('SIMULATED IndicTrans2 validates authenticated local model provenance and no cloud fallback',async()=>{
 const provider=new IndicTrans2('http://127.0.0.1:8001','contract-only-key-with-at-least-32-characters',async(input,init)=>{assert.equal(String(input),'http://127.0.0.1:8001/v1/translate');assert.match(new Headers(init?.headers).get('Authorization')! ,/^Bearer /);return Response.json({subject:'Simulated subject',body:'Simulated body',sourceLanguage:'mr',targetLanguage:'en',provider:'AI4Bharat IndicTrans2',version:'SIMULATED',modelId:'ai4bharat/indictrans2-indic-en-dist-200M',modelRevision:'d66a2122ad6d28184f3dc3797b652bd80ae3f65f',detector:'manual',inferenceExecuted:true,reviewStatus:'NEEDS_REVIEW'});});
 const result=await provider.translate('मूळ विषय','मूळ तक्रार','mr');assert.equal(result.score,null);assert.equal(result.provider,'AI4Bharat IndicTrans2');assert.equal(result.required,true);assert.throws(()=>new IndicTrans2('http://untrusted.invalid','contract-only-key-with-at-least-32-characters'));
});

test('SIMULATED Gmail requires explicit activation and matching approved mailbox before any message read',async()=>{
 const config={enabled:true,approvedAddress:'approved@example.invalid',clientId:'contract-id',clientSecret:'contract-secret',refreshToken:'contract-refresh',label:'INBOX'};let calls=0;
 assert.throws(()=>new GmailReadOnly({...config,enabled:false}));
 const gmail=new GmailReadOnly(config,async(input)=>{calls++;if(String(input)==='https://oauth2.googleapis.com/token')return Response.json({access_token:'contract-access',expires_in:3600,scope:'https://www.googleapis.com/auth/gmail.readonly'});assert.match(String(input),/\/profile$/);return Response.json({emailAddress:'wrong@example.invalid',historyId:'1'});});
 await assert.rejects(gmail.list(),/OAUTH_MAILBOX_APPROVAL_MISMATCH/);assert.equal(calls,2);
});
test('SIMULATED Gmail rejects OAuth scope escalation before touching mailbox metadata',async()=>{
 let calls=0;const gmail=new GmailReadOnly({enabled:true,approvedAddress:'approved@example.invalid',clientId:'contract',clientSecret:'contract',refreshToken:'contract',label:'INBOX'},async()=>{calls++;return Response.json({access_token:'contract',expires_in:3600,scope:'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify'});});
 await assert.rejects(gmail.profile(),/GMAIL_READONLY_SCOPE_REQUIRED/);assert.equal(calls,1);
});
test('attachment admission distinguishes explicit UTF-8 text policy from actual binary malware scanning',async()=>{
 assert.equal(inspectAttachment(Buffer.from('Development evidence'),'notes.txt').scan,'NOT_REQUIRED');assert.equal(inspectAttachment(Buffer.from('%PDF-1.7\nFixture'),'file.pdf').scan,'PENDING');
 assert.throws(()=>inspectAttachment(Buffer.from('<html>not PDF</html>'),'file.pdf'));assert.throws(()=>inspectAttachment(Buffer.from([0,1,2]),'file.txt'));
 assert.equal(await scanWithClamAv(Buffer.from('%PDF-1.7'),undefined),'PENDING');
});
