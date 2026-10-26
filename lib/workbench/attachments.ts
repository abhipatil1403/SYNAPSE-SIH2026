import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { PlatformError } from "../platform/contracts";
export function inspectAttachment(bytes:Buffer,name:string){
 if(!bytes.length||bytes.length>10485760)throw new PlatformError(400,'invalid_attachment','Attachments must be between 1 byte and 10 MB.');
 const filename=name.replace(/[\r\n\\/\x00]/g,'_').slice(0,250);
 if(filename.toLowerCase().endsWith('.txt')){try{const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text))throw Error();return {name:filename,mediaType:'text/plain' as const,sha256:createHash('sha256').update(bytes).digest('hex'),scan:'NOT_REQUIRED' as const};}catch{throw new PlatformError(400,'invalid_text','Text evidence must contain valid UTF-8 without control bytes.');}}
 const mediaType=bytes.subarray(0,5).toString()==='%PDF-'?'application/pdf':bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':null;
 if(!mediaType)throw new PlatformError(400,'unsupported_attachment','Only validated UTF-8 .txt, PDF, PNG and JPEG evidence is accepted.');
 return {name:filename,mediaType:mediaType as 'application/pdf'|'image/png'|'image/jpeg',sha256:createHash('sha256').update(bytes).digest('hex'),scan:'PENDING' as const};
}
export async function scanWithClamAv(bytes:Buffer,command:string|undefined):Promise<'PENDING'|'CLEAN'|'INFECTED'>{
 if(!command)return 'PENDING';
 return new Promise((resolve,reject)=>{const child=spawn(command,['--no-summary','-'],{stdio:['pipe','ignore','ignore'],windowsHide:true});const timer=setTimeout(()=>{child.kill();reject(new PlatformError(503,'scanner_timeout','Attachment retained in quarantine; scanner timed out.'));},30000);
 child.on('error',()=>{clearTimeout(timer);reject(new PlatformError(503,'scanner_unavailable','Attachment scanner is unavailable.'));});child.on('exit',code=>{clearTimeout(timer);if(code===0)resolve('CLEAN');else if(code===1)resolve('INFECTED');else reject(new PlatformError(503,'scanner_failed','Attachment scanner did not complete.'));});child.stdin.on('error',()=>{});child.stdin.end(bytes);});
}
