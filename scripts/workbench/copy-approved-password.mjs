import {execFileSync} from 'node:child_process';
import {loadVault} from '../phase2/vault.mjs';
import {safeMain} from '../phase2/operator.mjs';
// Owner-invoked, CurrentUser DPAPI -> local clipboard. Never stdout or files.
safeMain(async()=>{const choice=process.argv[2];let password;
 if(choice==='admin')password=(await loadVault('.local/phase2/admin-onboarding.vault')).password;
 else if(['a','b'].includes(choice)){const officers=await loadVault('.local/phase2/phase2-approved-officers.vault');password=officers.accounts[choice==='a'?0:1].password;}
 else if(choice==='applicant')password=(await loadVault('.local/phase2/applicant-onboarding.vault')).password;
 if(!password)throw Error('CHOOSE_APPROVED_ACCOUNT_A_B_ADMIN_OR_APPLICANT');
 const invoke=script=>execFileSync('pwsh.exe',['-NoProfile','-NonInteractive','-Command',script],{input:password,stdio:['pipe','pipe','pipe'],windowsHide:true});
 invoke('$secret=[Console]::In.ReadToEnd();Set-Clipboard -Value $secret');console.log('Approved development password copied to your local clipboard, without printing it. Paste into the localhost login form. The clipboard will be cleared in 60 seconds if unchanged.');
 await new Promise(resolve=>setTimeout(resolve,60000));invoke('$secret=[Console]::In.ReadToEnd();if((Get-Clipboard -Raw).TrimEnd([char[]]"`r`n") -ceq $secret){Set-Clipboard -Value ""}');
});
