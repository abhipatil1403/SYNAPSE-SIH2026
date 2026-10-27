import {spawn} from 'node:child_process';
import {assertWebEnvironment} from '../../lib/web-environment.ts';
assertWebEnvironment(process.env);
process.loadEnvFile('.env.gateway.local');
if(process.argv.includes('--isolated'))process.loadEnvFile('.env.workbench.local');
if(process.argv.includes('--isolated'))Object.assign(process.env,{SYNAPSE_APP_ORIGIN:'http://localhost:3000',SYNAPSE_PHASE1_READ_ENABLED:'false'});
assertWebEnvironment(process.env);
// This installed Next dev launcher forwards execArgv into NODE_OPTIONS. Keep
// --env-file off its argv: Node rejects that option in the spawned dev server.
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3000'],{env:{...process.env},stdio:'inherit',windowsHide:true});
process.on('SIGINT',()=>child.kill());process.on('SIGTERM',()=>child.kill());child.on('exit',code=>{process.exitCode=code??1;});
