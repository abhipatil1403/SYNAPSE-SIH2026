import {z} from 'zod';
import {IntegrationError,type Fetcher,type TranslationProvider} from './providers';
import models from '../../services/translation/manifest.json';

/** Backend-only local service. Google translation is never a fallback. */
export class IndicTrans2 implements TranslationProvider{
 constructor(private origin:string,private key:string,private fetcher:Fetcher=fetch){
  const u=new URL(origin);if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||!(u.protocol==='https:'||u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname))||key.length<32)throw new IntegrationError('INDICTRANS_CONFIGURATION_REQUIRED',false);
  this.origin=u.origin;
 }
 async translate(subject:string,body:string,sourceLanguage='auto',targetLanguage='en'){
  let response:Response;try{response=await this.fetcher(this.origin+'/v1/translate',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+this.key},body:JSON.stringify({subject,body,sourceLanguage,targetLanguage}),redirect:'error',signal:AbortSignal.timeout(180000)});}catch{throw new IntegrationError('INDICTRANS_SERVICE_UNAVAILABLE');}
  if(!response.ok){let code='INDICTRANS_HTTP_'+response.status;try{const error=await response.json();if(/^[A-Z_]{3,80}$/.test(error.error?.code??''))code='INDICTRANS_'+error.error.code;}catch{}throw new IntegrationError(code,response.status===429||response.status>=500);}
  const data=z.object({subject:z.string().max(100000),body:z.string().max(200000),sourceLanguage:z.string(),targetLanguage:z.string(),provider:z.string(),version:z.string(),inferenceExecuted:z.boolean(),reviewStatus:z.enum(['NEEDS_REVIEW','NOT_REQUIRED']),modelId:z.string().optional(),modelRevision:z.string().regex(/^[a-f0-9]{40}$/).optional(),detector:z.string()}).parse(await response.json());
  if(data.targetLanguage!==targetLanguage||data.inferenceExecuted&&(!data.modelId?.startsWith('ai4bharat/indictrans2-')||!data.modelRevision||data.provider!=='AI4Bharat IndicTrans2'||data.reviewStatus!=='NEEDS_REVIEW'))throw new IntegrationError('INDICTRANS_PROVENANCE_INVALID',false);
  const expected=targetLanguage==='en'?models.indic_en:models.en_indic;
  if(data.inferenceExecuted&&(data.modelId!==expected.id||data.modelRevision!==expected.revision))throw new IntegrationError('INDICTRANS_MODEL_REVISION_MISMATCH',false);
  if(!['auto','und'].includes(sourceLanguage)&&data.sourceLanguage!==sourceLanguage)throw new IntegrationError('INDICTRANS_SOURCE_LANGUAGE_MISMATCH',false);
  if(!data.inferenceExecuted&&(data.sourceLanguage!=='en'||targetLanguage!=='en'||data.subject!==subject||data.body!==body))throw new IntegrationError('INDICTRANS_IDENTITY_RESULT_INVALID',false);
  return {language:data.sourceLanguage,score:null,subject:data.subject,body:data.body,provider:data.provider,version:data.version,required:data.inferenceExecuted,modelId:data.modelId,modelRevision:data.modelRevision,targetLanguage:data.targetLanguage,detector:data.detector};
 }
}
