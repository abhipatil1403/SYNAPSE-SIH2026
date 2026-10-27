import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {GeminiEmbeddings} from '../../lib/automation/google';
import {cosine} from '../../lib/automation/normalization';
async function main(){
 if(!process.env.SYNAPSE_GEMINI_EMBEDDINGS_API_KEY)throw Error('GEMINI_CONFIGURATION_REQUIRED');
 const provider=new GeminiEmbeddings(process.env.SYNAPSE_GEMINI_EMBEDDINGS_API_KEY),vectors=await provider.embed([
  'Fictional development complaint: a college classroom has insufficient seating capacity.',
  'Fictional development complaint: students report too few classroom seats at their college.',
  'Fictional development activity: review the gardening schedule for a test campus.',
 ]);
 assert.equal(vectors.length,3);for(const vector of vectors){assert.equal(vector.length,768);assert.ok(Math.abs(Math.hypot(...vector)-1)<1e-6);}assert.notDeepEqual(vectors[0],vectors[2]);
 const report={checkedAt:new Date().toISOString(),source:'Actual Google Gemini API; explicitly fictional approved development text only',providerVersion:provider.version,actualProvider:true,dimensions:768,vectorsReturned:3,selfCosine:cosine(vectors[0],vectors[0]),relatedCosine:cosine(vectors[0],vectors[1]),unrelatedCosine:cosine(vectors[0],vectors[2]),qualityCalibration:'AWAITING USER MANUAL TESTING'};
 await mkdir('docs/phase10',{recursive:true});await writeFile('docs/phase10/GEMINI_PROVIDER_EVIDENCE.json',JSON.stringify(report,null,2)+'\n');console.log('PASS actual Gemini API returned distinct normalized 768-dimensional embeddings; actual cosine values recorded. No quality or production-processing approval inferred.');
}
main().catch(error=>{console.error(/^[A-Z0-9_]{3,80}$/.test(error.code??error.message)?error.code??error.message:'ACTUAL_GEMINI_TEST_FAILED');process.exitCode=1;});
