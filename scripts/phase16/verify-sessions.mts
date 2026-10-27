import {createClient} from '@supabase/supabase-js';
import {loadVault} from '../phase2/vault.mjs';
import {verifyCurrentSession} from '../../lib/auth/live-session';
import {mkdir,writeFile} from 'node:fs/promises';
if(!process.argv.includes('--approved-current-account-vault'))throw Error('EXPLICIT_APPROVED_ACCOUNT_TEST_REQUIRED');
const project=process.env.NEXT_PUBLIC_SUPABASE_URL!,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
if(new URL(project).hostname!=='xjnukuerzlrxjjqwmgkn.supabase.co')throw Error('PROJECT_MISMATCH');
const vault=await loadVault('.local/acceptance/real-users.vault'),results=[];
const make=()=>createClient(project,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(15000)})}});
try{for(const [index,account]of vault.accounts.entries()){
 const client=make(),replay=make();try{const login=await client.auth.signInWithPassword({email:account.email,password:account.password});if(login.error||!login.data.session){results.push({account:index+1,login:false,errorCode:'APPROVED_VAULT_LOGIN_REJECTED'});continue;}
 const verified=await verifyCurrentSession(client.auth,project),session=(await client.auth.getSession()).data.session!;if(verified.claims.sub!==login.data.user?.id)throw Error('SUBJECT_MISMATCH');
 const access=session.access_token,refresh=session.refresh_token,before=await fetch(project+'/auth/v1/user',{headers:{apikey:key,Authorization:'Bearer '+access}});if(before.status!==200)throw Error('PROVIDER_CURRENT_USER_REJECTED');
 const rpcBefore=[];for(const name of ['synapse_phase1_me','synapse_phase1_cases']){const response=await fetch(project+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+access,'Content-Type':'application/json'},body:'{}'});if(response.status!==403)throw Error('DIRECT_RPC_NOT_CLOSED');rpcBefore.push(response.status);}
 const logout=await client.auth.signOut({scope:'local'});if(logout.error)throw Error('PROVIDER_LOGOUT_FAILED');
 const unchanged=await fetch(project+'/auth/v1/user',{headers:{apikey:key,Authorization:'Bearer '+access}});
 const refreshReplay=await fetch(project+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:refresh})});if(refreshReplay.ok)throw Error('REVOKED_PROVIDER_REFRESH_ACCEPTED');
 await replay.auth.setSession({access_token:access,refresh_token:refresh});let denied=false;try{await verifyCurrentSession(replay.auth,project);}catch(error){denied=(error as {status?:number}).status===401;}if(!denied)throw Error('STRICT_SESSION_REPLAY_NOT_REJECTED');
 const rpcAfter=[];for(const name of ['synapse_phase1_me','synapse_phase1_cases']){const response=await fetch(project+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+access,'Content-Type':'application/json'},body:'{}'});if(![401,403].includes(response.status))throw Error('REVOKED_DIRECT_RPC_NOT_REJECTED');rpcAfter.push(response.status);}
 results.push({account:index+1,login:true,directRpcBeforeLogoutHttp:rpcBefore,directRpcAfterLogoutHttp:rpcAfter,actualIssuedJwt:true,currentRefreshVerified:true,onlineSubjectVerified:true,providerLogout:true,unchangedJwtUserEndpointHttp:unchanged.status,revokedRefreshHttp:refreshReplay.status,strictApplicationSessionReplayDenied:true});
 }finally{await client.auth.signOut({scope:'local'}).catch(()=>{});await replay.auth.signOut({scope:'local'}).catch(()=>{});}
 }
 await mkdir('docs/phase16',{recursive:true});const report={checkedAt:new Date().toISOString(),environment:'Actual hosted Supabase Auth / approved current development account vault',browserAutomation:false,directRpcExplanation:'Both legacy case RPCs stay ACL-closed before and after logout. This is not proof of safe reopened public RPCs; none are reopened.',providerMocked:false,managedSchemaModified:false,businessGateChanged:false,businessRecordsWritten:false,onlyNewTestSessionsLoggedOut:true,results,allPassed:results.length===3&&results.every(r=>r.strictApplicationSessionReplayDenied===true)};await writeFile('docs/phase16/HOSTED_SESSION_RESULTS.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!report.allPassed)process.exitCode=1;
}catch(error){console.error('Sanitized real-session test failure: '+((error as {message?:string}).message?.match(/^[A-Z_]{3,80}$/)?.[0]??'AUTH_TEST_FAILED'));process.exitCode=1;}
