import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {hostedOperationalServer} from '@/lib/hosted/server';
import {PlatformError} from '@/lib/platform/contracts';
import {platformFailure} from '@/lib/platform/server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest,{params}:{params:Promise<{draftId:string}>}){try{
 if(process.env.SYNAPSE_HOSTED_OPERATIONS_ENABLED!=='true')throw new PlatformError(503,'operations_release_required','The hosted operations release is not enabled.');const id=z.uuid().parse((await params).draftId),api=hostedOperationalServer(request),r=await api.resolve();const file=request.nextUrl.searchParams.get('id');
 if(!file)return api.respond(await r.store.locked(async c=>(await c.query('SELECT id,name,media_type "mediaType",octet_length(bytes) size,scan,sha256 FROM synapse_gateway.gmail_attachments WHERE submission_id=$1',[id])).rows));
 const result=await r.store.locked(async c=>(await c.query('SELECT name,media_type,scan,bytes FROM synapse_gateway.gmail_attachments WHERE submission_id=$1 AND id=$2',[id,z.uuid().parse(file)])).rows[0]);if(!result||!(result.scan==='CLEAN'||result.scan==='NOT_REQUIRED'&&result.media_type==='text/plain'))throw new PlatformError(404,'not_found','Attachment unavailable or quarantined.');return api.context.apply(new NextResponse(new Uint8Array(result.bytes),{headers:{'Content-Type':result.media_type,'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(result.name),'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}}));
 }catch(error){return platformFailure(error);}}
