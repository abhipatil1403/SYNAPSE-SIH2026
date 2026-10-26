import {NextRequest} from 'next/server';
import {workbenchServer} from '@/lib/workbench/server';
import {platformFailure} from '@/lib/platform/server';
import {requireSameOrigin,smallJson} from '@/lib/live/request';
import {z} from 'zod';
export async function POST(request:NextRequest){try{requireSameOrigin(request,process.env.SYNAPSE_APP_ORIGIN??'http://localhost:3000');z.object({}).strict().parse(await smallJson(request));const api=workbenchServer(request),r=await api.resolve();
 const count=await r.store.locked(async(c)=>(await c.query("UPDATE workbench.jobs SET status='PENDING',available_at=now(),error_code=NULL WHERE environment_id=$1 AND status IN('BLOCKED','FAILED') AND (actor_id=$2 OR $3) RETURNING id",[r.store.environmentId,r.principal.userId,r.identity.account.roles.includes('SYSTEM_ADMIN')])).rowCount);return api.respond({queued:count,providerSuccessNotAssumed:true});}catch(error){return platformFailure(error);}}
