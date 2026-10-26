import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {IndicTrans2} from '../../lib/automation/indictrans';
async function main(){
 const origin=process.env.SYNAPSE_INDIC_TRANSLATION_URL,key=process.env.SYNAPSE_TRANSLATION_API_KEY;if(!origin||!key)throw Error('LOCAL_TRANSLATION_CONFIGURATION_REQUIRED');
 let ready=false;for(let n=0;n<60;n++){try{ready=(await fetch(origin+'/health',{signal:AbortSignal.timeout(1000)})).status===401;}catch{}if(ready)break;await new Promise(resolve=>setTimeout(resolve,500));}assert.ok(ready,'LOCAL_SERVICE_NOT_READY');
 const provider=new IndicTrans2(origin,key),checks=[];
 await mkdir('.local/translation',{recursive:true});
 for(const [source,target,subject,body] of [
  ['mr','en','शैक्षणिक सुविधांबाबत तक्रार','आमच्या महाविद्यालयामध्ये विद्यार्थ्यांना आवश्यक शैक्षणिक सुविधा मिळत नाहीत. कृपया या तक्रारीची चौकशी करा.'],
  ['hi','en','शैक्षणिक सुविधाओं की शिकायत','हमारे महाविद्यालय में विद्यार्थियों को आवश्यक शैक्षणिक सुविधाएं नहीं मिल रही हैं। कृपया इस शिकायत की जांच करें।'],
  ['en','hi','College complaint','Please investigate this complaint about our college.'],
 ] as const){const result=await provider.translate(subject,body,source,target);assert.equal(result.required,true);assert.ok(result.body.trim());assert.notEqual(result.body,body);assert.match(result.body,target==='en'?/[a-zA-Z]/:/[\u0900-\u097f]/);assert.equal(result.language,source);
  checks.push({source,target,status:'PASS',modelId:result.modelId,modelRevision:result.modelRevision,translation:result.body,sourceText:body,outputSha256:createHash('sha256').update(result.body).digest('hex')});await writeFile('.local/translation/inference-results.json',JSON.stringify({checkedAt:new Date().toISOString(),checks,manualTranslationQuality:'AWAITING USER MANUAL TESTING'},null,2));console.log('PASS actual pinned IndicTrans2 inference: '+source+' → '+target);
 }
 await mkdir('.local/translation',{recursive:true});await writeFile('.local/translation/inference-results.json',JSON.stringify({checkedAt:new Date().toISOString(),environment:'Actual local WSL CPU service; authorized fictional development text; not a mock',checks,manualTranslationQuality:'AWAITING USER MANUAL TESTING'},null,2));
 console.log('PASS actual unauthorized API denial and three actual inference directions; private outputs retained for owner review.');
}
main().catch(error=>{console.error(/^[A-Z_0-9]+$/.test(error.message??'')?error.message:'TRANSLATION_SMOKE_FAILED');process.exitCode=1;});
