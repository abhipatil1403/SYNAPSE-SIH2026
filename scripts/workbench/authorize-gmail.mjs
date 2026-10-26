import {createServer} from 'node:http';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {saveVault} from '../phase2/vault.mjs';
import {safeMain} from '../phase2/operator.mjs';
import {GmailReadOnly} from '../../lib/automation/google.ts';
safeMain(async()=>{
 const approval=JSON.parse(await readFile('.local/workbench/approved-mailbox.json','utf8'));
 if(approval.environment!=='DEVELOPMENT_ONLY'||!approval.address||!approval.approvedAt||!approval.label||!approval.bureauId||!approval.reviewOwnerId)throw Error('EXPLICIT_APPROVED_MAILBOX_PLAN_REQUIRED');
 const clientId=process.env.SYNAPSE_GMAIL_CLIENT_ID,clientSecret=process.env.SYNAPSE_GMAIL_CLIENT_SECRET;if(!clientId||!clientSecret)throw Error('GMAIL_OAUTH_CLIENT_CONFIGURATION_REQUIRED');
 const state=randomBytes(32).toString('base64url'),verifier=randomBytes(48).toString('base64url'),redirect='http://127.0.0.1:8765/oauth/callback';
 const authorize=new URL('https://accounts.google.com/o/oauth2/v2/auth');authorize.search=new URLSearchParams({client_id:clientId,redirect_uri:redirect,response_type:'code',scope:'https://www.googleapis.com/auth/gmail.readonly',access_type:'offline',prompt:'consent',include_granted_scopes:'false',state,login_hint:approval.address,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString();
 await writeFile('.local/workbench/gmail-consent-url.txt',authorize.href);
 console.log('Open the private .local/workbench/gmail-consent-url.txt URL in your browser only for the explicitly approved test mailbox. Waiting on loopback port 8765. No tokens or credentials will be printed.');
 await new Promise((resolve,reject)=>{let handled=false;const server=createServer(async(req,res)=>{res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');
   try{const url=new URL(req.url,'http://127.0.0.1:8765');if(url.pathname!=='/oauth/callback'){res.writeHead(404).end();return;}
    const returned=Buffer.from(url.searchParams.get('state')??''),expected=Buffer.from(state);if(handled||returned.length!==expected.length||!timingSafeEqual(returned,expected)||!url.searchParams.get('code')){res.writeHead(403).end('Authorization could not be validated.');return;}handled=true;
    const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,code:url.searchParams.get('code'),code_verifier:verifier,redirect_uri:redirect,grant_type:'authorization_code'}),redirect:'error',signal:AbortSignal.timeout(30000)}),body=await response.json();
    if(!response.ok||!body.refresh_token)throw Error('READONLY_OFFLINE_OAUTH_NOT_ISSUED');
    const gmail=new GmailReadOnly({enabled:true,approvedAddress:approval.address,clientId,clientSecret,refreshToken:body.refresh_token,label:approval.label});await gmail.profile();
    await saveVault('.local/workbench/gmail-oauth.vault',{address:approval.address,refreshToken:body.refresh_token,approvalDigest:createHash('sha256').update(JSON.stringify(approval)).digest('hex'),scope:'gmail.readonly',savedAt:new Date().toISOString()});
    res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'}).end('Approved read-only Gmail authorization saved encrypted. You may close this tab.');console.log('PASS: approved mailbox identity verified and read-only OAuth refresh token stored with CurrentUser DPAPI. No ingestion was performed by this authorization helper.');server.close(()=>resolve());
   }catch{res.writeHead(400,{'Content-Type':'text/plain'}).end('Authorization failed. No token was printed or saved without mailbox approval.');server.close(()=>reject(Error('GMAIL_AUTHORIZATION_FAILED')));}
  });server.listen(8765,'127.0.0.1');server.on('error',()=>reject(Error('LOOPBACK_OAUTH_PORT_UNAVAILABLE')));setTimeout(()=>server.close(()=>reject(Error('GMAIL_AUTHORIZATION_TIMEOUT'))),10*60000).unref();});
});
