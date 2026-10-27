import {NextRequest,NextResponse} from 'next/server';
import {cronAuthorized} from '@/lib/gmail/security';
import {runGmailSync} from '@/lib/gmail/sync';
import {gmailFailure} from '@/lib/gmail/server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(request:NextRequest){
 if(!cronAuthorized(request.headers.get('authorization'),process.env.CRON_SECRET))return NextResponse.json({error:{code:'UNAUTHORIZED'}},{status:401,headers:{'Cache-Control':'no-store'}});
 if(process.env.SYNAPSE_GMAIL_ENABLED!=='true')return NextResponse.json({enabled:false,ingested:0},{headers:{'Cache-Control':'no-store'}});
 try{return NextResponse.json(await runGmailSync(),{headers:{'Cache-Control':'no-store'}});}catch(error){return gmailFailure(error);}
}
