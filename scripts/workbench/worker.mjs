import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {workbenchConfig} from '../../lib/workbench/config.ts';
import {WorkbenchStore,makeWorkbenchPool} from '../../lib/workbench/store.ts';
import {processOneJob,processDevelopmentSla,pollApprovedGmail,scanPendingEvidence} from '../../lib/workbench/worker.ts';
import {GeminiEmbeddings,GmailReadOnly} from '../../lib/automation/google.ts';
import {IndicTrans2} from '../../lib/automation/indictrans.ts';
import {loadVault} from '../phase2/vault.mjs';
import {safeMain} from '../phase2/operator.mjs';
safeMain(async()=>{
 if(process.env.DATABASE_URL||process.env.SUPABASE_SECRET_KEY||process.env.SYNAPSE_SLA_DATABASE_URL)throw Error('OPERATOR_ENV_FORBIDDEN_IN_WORKER');
 const config=workbenchConfig();if(!config)throw Error('ISOLATED_WORKBENCH_REQUIRED');
 const pool=makeWorkbenchPool(config.connectionString),store=new WorkbenchStore(pool,config.environmentId),settings={developmentProcessingApproved:process.env.SYNAPSE_DEV_EXTERNAL_PROCESSING_APPROVED==='true',
  gemini:process.env.SYNAPSE_GEMINI_API_KEY?new GeminiEmbeddings(process.env.SYNAPSE_GEMINI_API_KEY,process.env.SYNAPSE_GEMINI_EMBEDDING_MODEL||'gemini-embedding-001'):undefined,
  translation:process.env.SYNAPSE_INDIC_TRANSLATION_URL&&process.env.SYNAPSE_TRANSLATION_API_KEY?new IndicTrans2(process.env.SYNAPSE_INDIC_TRANSLATION_URL,process.env.SYNAPSE_TRANSLATION_API_KEY):undefined};
 let gmail,mailConfig;
 if(process.env.SYNAPSE_GMAIL_ENABLED==='true'){
  const approval=JSON.parse(await readFile('.local/workbench/approved-mailbox.json','utf8')),credentials=await loadVault('.local/workbench/gmail-oauth.vault');
  if(approval.environment!=='DEVELOPMENT_ONLY'||approval.address!==credentials.address||approval.address!==process.env.SYNAPSE_GMAIL_APPROVED_ADDRESS||!approval.approvedAt||credentials.approvalDigest!==createHash('sha256').update(JSON.stringify(approval)).digest('hex'))throw Error('EXPLICIT_MAILBOX_APPROVAL_REQUIRED');
  mailConfig={address:approval.address,bureauId:approval.bureauId,reviewOwnerId:approval.reviewOwnerId,label:approval.label};
  gmail=new GmailReadOnly({enabled:true,approvedAddress:approval.address,clientId:process.env.SYNAPSE_GMAIL_CLIENT_ID,clientSecret:process.env.SYNAPSE_GMAIL_CLIENT_SECRET,refreshToken:credentials.refreshToken,label:approval.label});
 }
 let stopped=false;process.on('SIGINT',()=>{stopped=true;});process.on('SIGTERM',()=>{stopped=true;});
 try{do{let processed=0;try{if(gmail)await pollApprovedGmail(store,gmail,mailConfig);for(let i=0;i<20&&!stopped;i++){if(!await processOneJob(store,settings))break;processed++;}const scanned=await scanPendingEvidence(store,process.env.SYNAPSE_CLAMAV_COMMAND);const delivered=await processDevelopmentSla(store);console.log(JSON.stringify({at:new Date().toISOString(),environment:'ISOLATED_DEVELOPMENT',jobsAttempted:processed,notificationsDelivered:delivered,attachmentsScanned:scanned}));}catch{console.error('Isolated worker tick failed; durable jobs/cursors retained, no provider response or credentials logged.');if(process.argv.includes('--once'))process.exitCode=1;}
   if(!process.argv.includes('--once')&&!stopped)await new Promise(resolve=>setTimeout(resolve,30000));
  }while(!process.argv.includes('--once')&&!stopped);
 }finally{await pool.end();}
});
