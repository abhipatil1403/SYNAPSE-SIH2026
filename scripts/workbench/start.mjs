import {spawn} from 'node:child_process';
import {access} from 'node:fs/promises';
import {assertWebEnvironment} from '../../lib/web-environment.ts';
assertWebEnvironment(process.env);
const flags=['--env-file=.env.gateway.local','--env-file=.env.workbench.local'];
const web=spawn(process.execPath,[...flags,'node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3000'],{env:{...process.env,SYNAPSE_APP_ORIGIN:'http://localhost:3000',SYNAPSE_PHASE1_READ_ENABLED:'false',NEXT_PUBLIC_APP_MODE:'demo'},stdio:'inherit',windowsHide:true});
let integrations=false;try{await access('.env.integrations.local');integrations=true;}catch{}
const worker=spawn(process.execPath,['--env-file=.env.workbench.local',...(integrations?['--env-file=.env.integrations.local']:[]),'--import','tsx','scripts/workbench/worker.mjs'],{stdio:'inherit',windowsHide:true});
const stop=()=>{web.kill();worker.kill();};process.on('SIGINT',stop);process.on('SIGTERM',stop);web.on('exit',code=>{worker.kill();process.exitCode=code??1;});worker.on('exit',code=>{if(code)console.error('Development worker stopped; queued jobs remain durable. See the manual guide before restarting.');});
