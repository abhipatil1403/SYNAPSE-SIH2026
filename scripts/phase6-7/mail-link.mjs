import {readFile,stat} from 'node:fs/promises';
export const applicantOrigin='http://localhost:3000';
export const providerOrigin='https://xjnukuerzlrxjjqwmgkn.supabase.co';
export async function savedMailLink(file,createdAt,types){
 if((await stat(file)).mtimeMs+1000<Date.parse(createdAt))throw Error('SAVED_LINK_PREDATES_CURRENT_REQUEST');
 const link=new URL((await readFile(file,'utf8')).trim().replaceAll('&amp;','&'));
 if(link.username||link.password||link.hash||!types.includes(link.searchParams.get('type')))throw Error('UNAPPROVED_MAIL_LINK');
 if(link.origin===providerOrigin&&link.pathname==='/auth/v1/verify'){
  const destination=new URL(link.searchParams.get('redirect_to')??'');
  if(destination.origin!==applicantOrigin||destination.pathname!=='/auth/callback')throw Error('UNAPPROVED_MAIL_REDIRECT');
 }else if(link.origin!==applicantOrigin||link.pathname!=='/auth/callback'||!link.searchParams.get('token_hash'))throw Error('UNAPPROVED_MAIL_LINK');
 return link;
}
export async function followMailLink(context,link,expectedPath,persist){
 let destination=link;
 for(let index=0;index<6;index++){
  if(![providerOrigin,applicantOrigin].includes(destination.origin))throw Error('UNAPPROVED_CALLBACK_DESTINATION');
  const response=await context.request.get(destination.href,{maxRedirects:0});
  const next=response.headers().location?new URL(response.headers().location,destination):null;
  await persist((await context.storageState()).cookies,next?.href);
  if(response.headers()['x-synapse-auth-error']){const error=Error('MAIL_CALLBACK_REJECTED');error.callbackStage=/^[a-z_]+$/.test(response.headers()['x-synapse-auth-stage']??'')?response.headers()['x-synapse-auth-stage']:'unavailable';error.callbackCode=/^[a-z_]+$/.test(response.headers()['x-synapse-auth-error'])?response.headers()['x-synapse-auth-error']:'unavailable';throw error;}
  if(![301,302,303,307,308].includes(response.status())||!next)throw Error('MAIL_REDIRECT_REJECTED');
  destination=next;if(next.origin===applicantOrigin&&next.pathname===expectedPath)return destination;
 }
 throw Error('MAIL_REDIRECT_LIMIT');
}
export function privateBrowserEnv(){const env={...process.env};for(const key of Object.keys(env))if(/SECRET|PASSWORD|TOKEN|DATABASE_URL|PRIVATE_KEY|^SYNAPSE_/i.test(key))delete env[key];return env;}
