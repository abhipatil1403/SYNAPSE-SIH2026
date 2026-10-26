import assert from 'node:assert/strict';
import {createHash,createPublicKey,verify} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {loadVault} from '../phase2/vault.mjs';
import {safeMain} from '../phase2/operator.mjs';
safeMain(async()=>{
 const applicant=await loadVault('.local/phase2/applicant-onboarding.vault'),probe=applicant.expiryProbe;
 const result={checkedAt:new Date().toISOString(),checks:[]};
 try{
  assert.ok(probe?.token);assert.equal(createHash('sha256').update(probe.token).digest('hex'),probe.fingerprint);
  const parts=probe.token.split('.'),header=JSON.parse(Buffer.from(parts[0],'base64url')),claims=JSON.parse(Buffer.from(parts[1],'base64url'));
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  assert.equal(url,'https://xjnukuerzlrxjjqwmgkn.supabase.co');assert.equal(claims.sub,applicant.authId);assert.equal(claims.iss,url+'/auth/v1');assert.equal(claims.exp,probe.exp);
  const algorithms={ES256:['sha256','EC'],RS256:['RSA-SHA256','RSA'],EdDSA:[null,'OKP']},algorithm=algorithms[header.alg];assert.ok(algorithm);
  const response=await fetch(url+'/auth/v1/.well-known/jwks.json',{headers:{apikey:key},signal:AbortSignal.timeout(15000)});assert.ok(response.ok);
  const jwks=await response.json(),jwk=jwks.keys.find(k=>k.kid===header.kid&&k.kty===algorithm[1]&&(!k.alg||k.alg===header.alg));assert.ok(jwk);
  assert.ok(verify(algorithm[0],Buffer.from(parts[0]+'.'+parts[1]),{key:createPublicKey({key:jwk,format:'jwk'}),dsaEncoding:'ieee-p1363'},Buffer.from(parts[2],'base64url')));
  result.originalFingerprintMatched=true;result.signatureVerified=true;result.naturalExpiry=new Date(probe.exp*1000).toISOString();
  if(Date.now()<probe.exp*1000){result.checks.push({id:'actual_applicant_jwt_expiry',status:'BLOCKED',detail:'Original actual issued signature-valid applicant token has not naturally expired. No timestamp editing, substituted token, refresh or logout-only expiry claim.'});console.log('BLOCKED: actual applicant token has not naturally expired; encrypted original probe retained.');process.exitCode=2;}
  else{
   const expired=await fetch(url+'/rest/v1/rpc/synapse_phase1_cases',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+probe.token,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000)}),body=await expired.json();
   assert.equal(expired.status,401);assert.match(body.message??'',/expir/i);assert.notEqual(body.code,'28000');
   result.checks.push({id:'actual_applicant_jwt_expiry',status:'PASS',detail:'The exact original signature-valid applicant JWT naturally expired and the real hosted gateway explicitly rejected it for expiry (401). No token modification/substitution or refresh was used.'});console.log('PASS: original actual applicant JWT explicitly rejected for natural expiry.');
  }
 }finally{await mkdir('docs/phase6-7',{recursive:true});await writeFile('docs/phase6-7/applicant-expiry-results.json',JSON.stringify(result,null,2));}
});
