import {hostedAttachment} from '@/lib/hosted/attachments';
import {workbenchConfig} from '@/lib/workbench/config';
import {NextRequest,NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {workbenchServer} from '@/lib/workbench/server';
import {platformFailure} from '@/lib/platform/server';
import {canDocuments,requireCase} from '@/lib/platform/authorization';
import {PlatformEngine} from '@/lib/platform/engine';
import {PlatformError,type State} from '@/lib/platform/contracts';
import {requireSameOrigin} from '@/lib/live/request';
import {inspectAttachment,scanWithClamAv} from '@/lib/workbench/attachments';
export const runtime='nodejs';
export async function POST(request:NextRequest,{params}:{params:Promise<{caseId:string}>}){try{
 if(!workbenchConfig())return await hostedAttachment(request,(await params).caseId,true);
 requireSameOrigin(request,process.env.SYNAPSE_APP_ORIGIN??'http://localhost:3000');const caseId=z.uuid().parse((await params).caseId),api=workbenchServer(request),r=await api.resolve();
 await r.store.locked(async c=>{const s=await r.store.load(c),u=s.staff.find(u=>u.id===r.principal.userId)!,record=requireCase(s,u,caseId,new Date().toISOString(),true);if(!canDocuments(s,u,record,new Date().toISOString()))throw new PlatformError(404,'not_found','Document scope unavailable.');});
 if(Number(request.headers.get('content-length')??0)>11*1024*1024)throw new PlatformError(413,'attachment_too_large','Maximum attachment size is 10 MB.');
 const data=await request.formData(),file=data.get('file'),expectedVersion=z.string().regex(/^[1-9][0-9]*$/).parse(data.get('expectedVersion'));
 if(!(file instanceof File)||file.size>10485760)throw new PlatformError(400,'invalid_attachment','Choose a supported attachment up to 10 MB.');
 const bytes=Buffer.from(await file.arrayBuffer()),inspection=inspectAttachment(bytes,file.name),id=randomUUID(),versionId=randomUUID();let scan: 'PENDING'|'CLEAN'|'INFECTED'|'NOT_REQUIRED'=inspection.scan;
 if(scan==='PENDING')scan=await scanWithClamAv(bytes,process.env.SYNAPSE_CLAMAV_COMMAND);if(scan==='INFECTED')throw new PlatformError(400,'infected_attachment','Scanner rejected this attachment.');
 await r.store.locked(async(c)=>{const before=await r.store.load(c),s=structuredClone(before),u=s.staff.find(u=>u.id===r.principal.userId)!,record=requireCase(s,u,caseId,new Date().toISOString(),true);if(!canDocuments(s,u,record,new Date().toISOString()))throw new PlatformError(404,'not_found','Document scope unavailable.');
  const requested=data.get('documentId'),documentId=requested?z.uuid().parse(requested):randomUUID(),prior=s.evidence.filter(e=>e.caseId===caseId&&e.documentId===documentId);if(requested&&!prior.length)throw new PlatformError(404,'not_found','Prior document unavailable.');
  const evidence={id,caseId,documentId,versionId,number:Math.max(0,...prior.map(e=>e.number))+1,name:inspection.name,mediaType:inspection.mediaType,byteSize:bytes.length,sha256:inspection.sha256,scan,status:'SUBMITTED' as const,source:scan==='NOT_REQUIRED'?'Validated UTF-8 text policy / no binary malware verdict claimed':'ClamAV or pending binary quarantine',createdAt:new Date().toISOString()};
  const engine=new PlatformEngine({transaction:async<T>(work:(state:State)=>Promise<T>)=>work(s)});await engine.execute(r.principal,{idempotencyKey:randomUUID(),command:{type:'evidence.attach',caseId,expectedVersion,evidence}});
  await c.query('INSERT INTO workbench.blobs(id,environment_id,case_id,version_id,name,media_type,sha256,bytes,scan,uploader_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id,r.store.environmentId,caseId,versionId,inspection.name,inspection.mediaType,inspection.sha256,bytes,scan,r.principal.userId]);await r.store.save(c,before,s);
 });return api.respond({saved:true,id,scan,message:scan==='PENDING'?'Evidence retained in quarantine; download/verification blocked until a trusted scanner completes.':'Evidence bytes/hash and metadata committed.'},scan==='PENDING'?202:201);
 }catch(error){return platformFailure(error);}}
export async function GET(request:NextRequest,{params}:{params:Promise<{caseId:string}>}){try{if(!workbenchConfig())return await hostedAttachment(request,(await params).caseId);const caseId=z.uuid().parse((await params).caseId),id=z.uuid().parse(request.nextUrl.searchParams.get('id')),api=workbenchServer(request),r=await api.resolve();
 const blob=await r.store.locked(async(c)=>{const s=await r.store.load(c),u=s.staff.find(u=>u.id===r.principal.userId)!,record=requireCase(s,u,caseId,new Date().toISOString());if(!canDocuments(s,u,record,new Date().toISOString()))throw new PlatformError(404,'not_found','Document unavailable.');const row=(await c.query('SELECT bytes,name,media_type,scan FROM workbench.blobs WHERE environment_id=$1 AND id=$2 AND case_id=$3',[r.store.environmentId,id,caseId])).rows[0];if(!row||!(row.scan==='CLEAN'||row.scan==='NOT_REQUIRED'&&row.media_type==='text/plain'))throw new PlatformError(404,'not_found','Document unavailable or quarantined.');return row;});
 return api.context.apply(new NextResponse(new Uint8Array(blob.bytes),{headers:{'Content-Type':blob.media_type,'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(blob.name),'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}}));
 }catch(error){return platformFailure(error);}}
