import {spawn} from 'node:child_process';
import {readFile,access} from 'node:fs/promises';
import {parseEnv} from 'node:util';
await access('.next/BUILD_ID');
const origin='http://localhost:3004';
try{await fetch(origin+'/login',{signal:AbortSignal.timeout(1000)});throw Error('PORT_OCCUPIED');}catch(e){if(e.message==='PORT_OCCUPIED')throw e;}
const env={...process.env};for(const key of Object.keys(env))if(/^SYNAPSE_|SUPABASE|SECRET|TOKEN|PASSWORD|DATABASE_URL|HF_TOKEN|NEXT_PUBLIC_/i.test(key))delete env[key];
const allowed=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','SYNAPSE_GATEWAY_DATABASE_URL','SYNAPSE_GATEWAY_CA_FILE','SYNAPSE_GATEWAY_CA_PEM','SYNAPSE_AUTH_RATE_SECRET'];
for(const file of ['.env.local','.env.gateway.local'])for(const [key,value]of Object.entries(parseEnv(await readFile(file,'utf8'))))if(allowed.includes(key))env[key]=value;
Object.assign(env,{SYNAPSE_APP_ORIGIN:origin,SYNAPSE_TEST_ORIGIN:origin,SYNAPSE_EXTERNAL_TEST_SERVER:'true',SYNAPSE_PHASE1_READ_ENABLED:'false',SYNAPSE_WORKBENCH_ENABLED:'false',SYNAPSE_SIGNUP_ENABLED:'false',SYNAPSE_HOSTED_BROWSER_APPROVED:'true',PLAYWRIGHT_NO_COPY_PROMPT:'1'});
const web=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3004'],{env,stdio:'ignore',windowsHide:true});
try{let ready=false;for(let n=0;n<90;n++){try{ready=(await fetch(origin+'/login',{signal:AbortSignal.timeout(1000)})).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,500));}if(!ready)throw Error('DEDICATED_ACCOUNT_RUNTIME_UNAVAILABLE');
 const test=spawn(process.execPath,['node_modules/@playwright/test/cli.js','test','tests/e2e/hosted-workspace.spec.ts','--workers=1'],{env,stdio:'inherit',windowsHide:true});process.exitCode=await new Promise(resolve=>test.on('exit',code=>resolve(code??1)));
}finally{web.kill();}
