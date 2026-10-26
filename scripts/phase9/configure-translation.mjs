import {randomBytes} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {saveVault,loadVault} from '../phase2/vault.mjs';
import {safeMain} from '../phase2/operator.mjs';
safeMain(async()=>{
 if(!process.argv.includes('--local-service'))throw Error('EXPLICIT_LOCAL_SERVICE_CONFIGURATION_REQUIRED');
 const vaultPath='.local/translation/service.vault';let config;try{config=await loadVault(vaultPath);}catch{config={key:randomBytes(48).toString('base64url')};await saveVault(vaultPath,config);}
 for(const path of ['.env.translation.local','.env.integrations.local']){
  let content='';try{content=await readFile(path,'utf8');}catch{}
  const existing=content.match(/^SYNAPSE_TRANSLATION_API_KEY=(.+)$/m)?.[1];if(existing&&existing!==config.key)throw Error('EXISTING_SERVICE_KEY_REQUIRES_OWNER_RECONCILIATION');
  if(!existing)content+='\nSYNAPSE_TRANSLATION_API_KEY='+config.key+'\n';
  if(path.includes('integrations')&&!/^SYNAPSE_INDIC_TRANSLATION_URL=/m.test(content))content+='SYNAPSE_INDIC_TRANSLATION_URL=http://127.0.0.1:8001\n';
  await writeFile(path,content,{mode:0o600});
  const sid=execFileSync('pwsh.exe',['-NoProfile','-NonInteractive','-Command','[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value'],{encoding:'utf8',stdio:'pipe',windowsHide:true}).trim();if(!/^S-1-5-21-[0-9-]+$/.test(sid))throw Error('CURRENT_USER_ACL_REQUIRED');
  execFileSync('icacls.exe',[path,'/inheritance:r','/grant:r','*'+sid+':F'],{stdio:'pipe',windowsHide:true});
 }
 await mkdir('.local/translation',{recursive:true});console.log('PASS private local translation service/worker key configured without printing it. HF token remains only in the service environment; no hosted setting changed.');
});
