import {request} from '@playwright/test';
import {loadVault} from '../phase2/vault.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {safeMain} from '../phase2/operator.mjs';
import {randomBytes} from 'node:crypto';
safeMain(async()=>{
 const vault=await loadVault('.local/acceptance/real-users.vault');
 if(vault.environment!=='DEVELOPMENT_REAL_AUTH'||!vault.accounts?.length)throw Error('APPROVED_CURRENT_CREDENTIALS_REQUIRED');
 const origin=process.env.SYNAPSE_TEST_ORIGIN??'http://localhost:3000',results=[];
 for(const [slot,account] of vault.accounts.entries()){
  const ctx=await request.newContext({baseURL:origin});
  try{
   const login=await ctx.post('/api/auth/login',{headers:{Origin:origin},data:{email:account.email,password:account.password}}),body=await login.json();
   const result={slot,loginHttp:login.status(),status:body.account?.status??null,roles:body.account?.roles??[],snapshotHttp:null,logoutHttp:null};
   if(login.ok()){result.snapshotHttp=(await ctx.get('/api/workspace/snapshot')).status();result.logoutHttp=(await ctx.post('/api/auth/logout',{headers:{Origin:origin},data:{}})).status();}
   results.push(result);
  }finally{await ctx.dispose();}
 }
 const negative=await request.newContext({baseURL:origin});let invalidCredentialsHttp;
 try{invalidCredentialsHttp=(await negative.post('/api/auth/login',{headers:{Origin:origin},data:{email:vault.accounts[1].email,password:randomBytes(32).toString('base64url')}})).status();}finally{await negative.dispose();}
 await mkdir('docs/phase10',{recursive:true});await writeFile('docs/phase10/REAL_AUTH_CHECK.json',JSON.stringify({checkedAt:new Date().toISOString(),source:'Actual Supabase issued sessions, recreated owner-approved credentials; no mocked provider',results,invalidCredentialsHttp},null,2)+'\n');
 console.log(JSON.stringify({realAuthChecks:results,invalidCredentialsHttp}));if(results.some(r=>r.loginHttp!==200||r.snapshotHttp!==200||r.logoutHttp!==200)||invalidCredentialsHttp!==401)process.exitCode=1;
});
