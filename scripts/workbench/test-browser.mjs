import {spawn} from 'node:child_process';
// Regression-only runtime: no operator/gateway/worker credentials and no
// isolated writes. Fixture-backed browser checks are not owner acceptance.
const env={...process.env};for(const key of Object.keys(env))if(/^SYNAPSE_|SECRET|TOKEN|PASSWORD|DATABASE_URL/i.test(key))delete env[key];
Object.assign(env,{SYNAPSE_APP_ORIGIN:'http://localhost:3000',SYNAPSE_PHASE1_READ_ENABLED:'false',SYNAPSE_WORKBENCH_ENABLED:'false',SYNAPSE_SIGNUP_ENABLED:'false',NEXT_PUBLIC_APP_MODE:'demo'});
let occupied=false;try{await fetch('http://127.0.0.1:3000/dashboard',{signal:AbortSignal.timeout(1000)});occupied=true;}catch{}
if(occupied)throw Error('Stop your existing localhost server before running the dedicated regression runtime.');
const web=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3000'],{env,stdio:'ignore',windowsHide:true});
try{let ready=false;for(let n=0;n<60;n++){try{ready=(await fetch('http://127.0.0.1:3000/dashboard',{signal:AbortSignal.timeout(1000)})).ok;}catch{}if(ready)break;await new Promise(resolve=>setTimeout(resolve,500));}if(!ready)throw Error('Dedicated regression runtime did not start.');
 const test=spawn(process.execPath,['node_modules/@playwright/test/cli.js','test'],{env,stdio:'inherit',windowsHide:true});process.exitCode=await new Promise(resolve=>test.on('exit',code=>resolve(code??1)));
}finally{web.kill();}
