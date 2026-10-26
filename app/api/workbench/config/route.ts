import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { workbenchServer } from "@/lib/workbench/server";
import { platformFailure } from "@/lib/platform/server";
import { PlatformError } from "@/lib/platform/contracts";
import { smallJson, requireSameOrigin } from "@/lib/live/request";
import { configurationAdmin } from "@/lib/platform/operations";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request,process.env.SYNAPSE_APP_ORIGIN ?? "http://localhost:3000");
    const input = z.discriminatedUnion("type", [
      z.object({ type: z.literal("development.role"), userId: z.uuid(), bureauId: z.uuid(), role: z.enum(["BUREAU_HEAD","AUDITOR"]), until: z.iso.datetime({offset:true}), reason: z.string().min(5).max(1000) }).strict(),
      z.object({ type: z.literal("sla.rule"), policyId: z.uuid(), reminderMinutes: z.number().int().min(1).max(525600), reason: z.string().min(5).max(1000) }).strict(),
    ]).parse(await smallJson(request));
    const api=workbenchServer(request),r=await api.resolve();
    await r.store.locked(async(c)=>{
      const s=await r.store.load(c),actor=s.staff.find(u=>u.id===r.principal.userId)!;const now=new Date().toISOString();
      if(!configurationAdmin(actor,now))throw new PlatformError(403,"administrator_required","Current configuration administrator required.");
      if(input.type==='development.role'){
        const target=s.staff.find(u=>u.id===input.userId&&u.active),membership=target?.memberships.find(m=>m.bureauId===input.bureauId&&Date.parse(m.from)<=Date.now()&&(!m.until||Date.parse(m.until)>=Date.parse(input.until)));
        if(!target||target.id===actor.id||!membership||Date.parse(input.until)<=Date.now()||Date.parse(input.until)>Date.now()+86400000)throw new PlatformError(400,"invalid_development_scope","Choose another active imported officer, its approved Bureau, and an expiry within 24 hours and its membership window.");
        await c.query('INSERT INTO workbench.delegations(environment_id,user_id,bureau_id,role_code,actor_id,valid_until,reason) VALUES($1,$2,$3,$4,$5,$6,$7)',[r.store.environmentId,target.id,input.bureauId,input.role,actor.id,input.until,input.reason]);
      }else{
        if(!s.policies.some(p=>p.id===input.policyId&&p.approved))throw new PlatformError(400,"policy_required","Publish a reviewed development policy first.");
        await c.query('INSERT INTO workbench.sla_rules(environment_id,policy_id,reminder_minutes,enabled,actor_id,reason) VALUES($1,$2,$3,true,$4,$5)',[r.store.environmentId,input.policyId,input.reminderMinutes,actor.id,input.reason]);
      }
      const id=randomUUID();await c.query('INSERT INTO workbench.activity(id,environment_id,body) VALUES($1,$2,$3)',[id,r.store.environmentId,{id,caseId:null,actorId:actor.id,type:input.type,reason:input.reason+' (isolated database only; hosted roles unchanged)',at:now}]);
      await c.query('UPDATE workbench.meta SET revision=revision+1 WHERE environment_id=$1',[r.store.environmentId]);
    });return api.respond({saved:true,environment:'ISOLATED_DEVELOPMENT',hostedRolesChanged:false});
  }catch(error){return platformFailure(error);}
}
