"use client";
import Link from 'next/link';
import {useRef,useState} from 'react';
import {Feedback,Spinner,useToast} from './feedback';
type AuthKind='login'|'signup'|'forgot-password'|'reset-password';
const labels:Record<AuthKind,[string,string,string,string]>={
 login:['Welcome back','Your next step toward a coordinated resolution.','Sign In','Signing in…'],
 signup:['Make it official.','Register as an officer. Your administrator will review your Bureau and role before complaint access is available.','Create account','Creating your account…'],
 'forgot-password':['A fresh start.','Enter your registered email. We’ll send a secure password reset link to your inbox.','Send reset link','Requesting your link…'],
 'reset-password':['A stronger password.','Choose a new password with at least 12 characters. Your recovery session must still be active.','Update password','Updating your password…'],
};
export function AuthForm({kind,callbackError=false,callbackNotice,registrationEnabled=true}:{kind:AuthKind;callbackError?:boolean;callbackNotice?:string;registrationEnabled?:boolean}){
 const [busy,setBusy]=useState(false),[visible,setVisible]=useState(false),locked=useRef(false),{notify}=useToast();
 const [title,description,submit,pending]=labels[kind];
 return <main className="auth-surface"><Link href="/" prefetch={false} className="auth-brand"><strong>SYNAPSE<span>Coordinated resolution</span></strong></Link><section className="auth-card">
 <p className="eyebrow">AICTE / OFFICER WORKSPACE</p><h1>{title}</h1><p>{description}</p>
 <Feedback message={callbackNotice??(callbackError?'The verification or recovery link could not be accepted. Request a fresh link and try again.':'')} tone={callbackError?'error':'info'}/>
 {kind==='signup'&&!registrationEnabled?<div className="registration-closed"><h2>Registration is by invitation.</h2><p>Public signup is currently disabled for this deployment. Ask your authorized administrator for an invitation or use your existing officer account.</p><Link className="btn primary" prefetch={false} href="/login">Sign in to an existing account</Link></div>:<form className="form-stack" aria-busy={busy} onSubmit={async event=>{
  event.preventDefault();if(locked.current)return;const form=event.currentTarget,fields=new FormData(form);
  if(fields.has('confirm')&&fields.get('password')!==fields.get('confirm')){notify('The passwords do not match.','error');form.querySelector<HTMLInputElement>('[name=confirm]')?.focus();return;}
  locked.current=true;setBusy(true);let leaving=false;
  try{const payload=Object.fromEntries([...fields.entries()].filter(([name])=>name!=='confirm'));
   const response=await fetch('/api/auth/'+kind,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),cache:'no-store',signal:AbortSignal.timeout(45000)}),body=await response.json();
   if(!response.ok){notify(body.error?.message??'The secure service is unavailable. Please try again.','error');}
   else if(body.destination){const channel=new BroadcastChannel('synapse-auth-session');channel.postMessage('identity-changed');channel.close();leaving=true;window.location.assign(body.destination);}
   else{notify(body.message??'Request accepted.','success');form.reset();}
  }catch{notify('We could not confirm the result. Check your connection before trying again.','error');}
  finally{if(!leaving){locked.current=false;setBusy(false);}}
 }}>
 <fieldset disabled={busy}>
 {kind!=='reset-password'&&<label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@institution.edu" spellCheck={false}/></label>}
 {kind!=='forgot-password'&&<div className="auth-password"><label htmlFor={'auth-password-'+kind}>Password</label><span className="password-field"><input id={'auth-password-'+kind} name="password" type={visible?'text':'password'} autoComplete={kind==='login'?'current-password':'new-password'} required minLength={kind==='login'?1:12} maxLength={128}/><button type="button" className="password-toggle" aria-label={visible?'Hide password':'Show password'} aria-pressed={visible} onClick={()=>setVisible(v=>!v)}>{visible?'Hide':'Show'}</button></span></div>}
 {['signup','reset-password'].includes(kind)&&<><p className="field-help">Use at least 12 characters. A unique passphrase works well.</p><label>Confirm password<input name="confirm" type={visible?'text':'password'} autoComplete="new-password" required minLength={12} maxLength={128}/></label></>}
 <button className="btn primary auth-submit" disabled={busy}>{busy&&<Spinner label={pending}/>} {busy?pending:submit}</button>
 </fieldset></form>}
 <nav className="auth-links" aria-label="Account assistance">{kind==='login'?<><Link prefetch={false} href="/forgot-password">Forgot password?</Link><Link prefetch={false} href="/signup">Create an account</Link></>:<Link prefetch={false} href="/login">Back to sign in</Link>}</nav>
 <p className="auth-note">For authorized officers. Account registration and complaint access are reviewed separately.</p></section><Link className="auth-home-link" href="/" prefetch={false}>Back to SYNAPSE</Link></main>;
}
