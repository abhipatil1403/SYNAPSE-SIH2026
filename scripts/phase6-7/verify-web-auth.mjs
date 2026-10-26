import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
import { mkdir,writeFile } from "node:fs/promises";
import { operatorContext,safeMain } from "../phase2/operator.mjs";
import { loadVault } from "../phase2/vault.mjs";
import { withDevelopmentReadLease as withReadLease } from "./lease.mjs";
safeMain(async()=>{
  if(!process.argv.includes("--controlled-read")) throw Error("Select the bounded controlled test explicitly.");
  const {db}=await operatorContext(), vault=await loadVault(".local/phase2/phase2-approved-officers.vault"), origin="http://127.0.0.1:3001";
  const checks=[], pass=(id,detail)=>{checks.push({id,status:"PASS",detail});console.log("PASS "+id);};
  const env={...process.env,SYNAPSE_APP_ORIGIN:origin,SYNAPSE_PHASE1_READ_ENABLED:"true",SYNAPSE_SIGNUP_ENABLED:"false",NEXT_PUBLIC_APP_MODE:"demo"};
  for(const key of ["DATABASE_URL","SUPABASE_SECRET_KEY","SUPABASE_DB_CA_FILE"]) delete env[key];
  let child,browser;
  try{
    try {await fetch(origin,{signal:AbortSignal.timeout(1000)});throw Error("CONTROLLED_PORT_OCCUPIED");}catch(e){if(e.message==="CONTROLLED_PORT_OCCUPIED")throw e;}
    child=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port","3001"],{env,stdio:"ignore",windowsHide:true});
    let ready=false; for(let i=0;i<60;i++){try{ready=(await fetch(origin+"/login",{signal:AbortSignal.timeout(1000)})).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,250));}assert.ok(ready);
    const browserEnv={...process.env};for(const key of Object.keys(browserEnv))if(/SECRET|PASSWORD|TOKEN|DATABASE_URL|PRIVATE_KEY|^SYNAPSE_/i.test(key))delete browserEnv[key];
    browser=await chromium.launch({channel:"msedge",headless:true,env:browserEnv});
    const contexts=await Promise.all([browser.newContext(),browser.newContext()]);
    const anonymous=await contexts[0].request.get(origin+"/officer/dashboard",{maxRedirects:0});assert.equal(anonymous.status(),307);assert.ok(anonymous.headers().location.endsWith("/login"));
    assert.equal((await contexts[0].request.get(origin+"/api/auth/session")).status(),401);
    assert.equal((await contexts[0].request.post(origin+"/api/auth/login",{headers:{Origin:"https://attacker.invalid"},data:{}})).status(),403);
    assert.equal((await contexts[0].request.post(origin+"/api/auth/reset-password",{headers:{Origin:origin},data:{password:"local-unapplied-reset-password"}})).status(),401);
    assert.equal((await contexts[0].request.post(origin+"/api/auth/login",{headers:{Origin:origin},data:{email:vault.accounts[0].email,password:"deliberately-invalid-http-probe"}})).status(),401);
    pass("anonymous_origin_reset", "Protected pages redirect on the server; anonymous session/reset and cross-origin login are denied.");
    await withReadLease(db,vault.accounts.map(a=>a.authUserId),async()=>{
      for(let i=0;i<2;i++){
        const page=await contexts[i].newPage(); await page.goto(origin+"/login");
        await page.getByLabel("Email address",{exact:true}).fill(vault.accounts[i].email);await page.getByLabel("Password",{exact:true}).fill(vault.accounts[i].password);
        await Promise.all([page.waitForURL(origin+"/officer/dashboard",{timeout:45000}),page.getByRole("button",{name:"Sign In",exact:true}).click()]);
        const response=await contexts[i].request.get(origin+"/api/auth/cases"), body=await response.json();assert.equal(response.status(),200);
        const own=vault.fixtures.cases.find(c=>c.slot===(i===0?"A":"B")).id,other=vault.fixtures.cases.find(c=>c.slot===(i===0?"B":"A")).id;
        assert.ok(body.items.some(c=>c.id===own));assert.ok(!body.items.some(c=>c.id===other));
        const cookies=(await contexts[i].cookies()).filter(c=>c.name.startsWith("synapse-auth-session"));assert.ok(cookies.length);assert.ok(cookies.every(c=>c.httpOnly&&c.sameSite==="Lax"&&c.path==="/"));
        assert.equal((await contexts[i].request.get(origin+"/api/auth/approvals")).status(),403);
        assert.equal((await contexts[i].request.post(origin+"/api/auth/reset-password",{headers:{Origin:origin},data:{password:"local-unapplied-reset-password"}})).status(),403);
        assert.equal((await contexts[i].request.post(origin+"/api/auth/refresh",{headers:{Origin:origin},data:{}})).status(),200);
        const readiness=await contexts[i].request.get(origin+"/api/auth/readiness");assert.equal(readiness.status(),200);
        const readinessBody=await readiness.json();assert.equal(readinessBody.safeToActivateLive,false);assert.ok(readinessBody.checks.some(c=>c.id==='direct_rpc_closed'&&c.status==='PASS'));
        assert.ok(!/gmail|postgresql:\/\/|access_token|refresh_token/i.test(JSON.stringify(readinessBody)));
      }
      pass("real_form_two_bureaus", "Two actual browser login forms, distinct HttpOnly root-cookie jars and authorized case APIs render only their own Bureau cases.");
      pass("role_recovery_refresh", "Both officers are denied administrator decisions and password changes without recovery; actual HTTP session refresh succeeds.");
      try {
        await db.query("UPDATE synapse.auth_identity_links SET revoked_at=clock_timestamp() WHERE auth_user_id=$1 AND revoked_at IS NULL",[vault.accounts[0].authUserId]);
        const restricted=await contexts[0].request.get(origin+"/officer/dashboard",{maxRedirects:0});if(restricted.status()!==307)console.error("WEB_CHECK mapping_revocation_redirect_status="+restricted.status());assert.equal(restricted.status(),307);assert.ok(restricted.headers().location.endsWith("/pending-approval"));
        const denied=await contexts[0].request.get(origin+"/api/auth/cases");if(denied.status()!==403)console.error("WEB_CHECK mapping_revocation_api_status="+denied.status());assert.equal(denied.status(),403);
      } finally { await db.query("UPDATE synapse.auth_identity_links SET revoked_at=NULL WHERE auth_user_id=$1",[vault.accounts[0].authUserId]); }
      pass("pending_approval_restriction", "Temporarily revoked mapping routes an actual verified session to Pending Approval and denies case APIs; original mapping restored.");
      const first=contexts[0], saved=await first.cookies();assert.equal((await first.request.post(origin+"/api/auth/logout",{headers:{Origin:origin},data:{}})).status(),200);
      await first.addCookies(saved);assert.equal((await first.request.get(origin+"/api/auth/session")).status(),401);
      pass("logout_cookie_replay", "Actual HTTP application logout rejects replay of the previously valid session cookies.");
    });
  }catch(e){checks.push({id:"web_auth_run",status:"FAIL",detail:"A real HTTP/browser assertion failed; no later success inferred."});throw e;}
  finally{
    await browser?.close(); if(child){child.kill();await new Promise(resolve=>{if(child.exitCode!==null)resolve();else{child.once("exit",resolve);setTimeout(resolve,5000);}});}
    const gate=(await db.query("SELECT read_enabled,read_until FROM synapse.phase1_access_config")).rows[0];
    await mkdir("docs/phase6-7",{recursive:true});await writeFile("docs/phase6-7/web-auth-results.json",JSON.stringify({checkedAt:new Date().toISOString(),checks,finalGate:gate,httpsSecureCookie:"NOT RUN: loopback HTTP only"},null,2));await db.end();
  }
});
