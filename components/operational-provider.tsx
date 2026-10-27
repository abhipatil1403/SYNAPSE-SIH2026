"use client";
import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {snapshotSchema,resultSchema,type Snapshot,type Command,type CommandResult} from '@/lib/platform/contracts';

type Context={snapshot:Snapshot|null;status:'loading'|'ready'|'error';message:string;busy:boolean;source:string;load:()=>Promise<boolean>;command:(cmd:Command,key:string,onResult?:(r:CommandResult)=>void)=>Promise<boolean>};
const OperationalContext=createContext<Context|null>(null);
export function useOperational(){const c=useContext(OperationalContext);if(!c)throw Error('Authenticated workspace provider missing');return c;}
/** Only a transient authorized query cache. PostgreSQL is authoritative. */
export function OperationalProvider({children}:{children:ReactNode}){
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[status,setStatus]=useState<Context['status']>('loading'),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[source,setSource]=useState('');
 const generation=useRef(0),active=useRef<AbortController|null>(null),mounted=useRef(true),channel=useRef<BroadcastChannel|null>(null);
 const load=useCallback(async()=>{
  active.current?.abort();const controller=new AbortController(),version=++generation.current;active.current=controller;
  try{const response=await fetch('/api/workspace/snapshot',{cache:'no-store',signal:controller.signal}),body=await response.json();if(controller.signal.aborted||version!==generation.current||!mounted.current)return false;
   if(!response.ok){setSnapshot(null);setStatus('error');setMessage(body.error?.message??'Authorized data is unavailable.');if(response.status===401)window.location.replace('/login');else if(response.status===403)window.location.replace('/pending-approval');return false;}
   const verified=snapshotSchema.parse(body);if(!verified.me)throw Error('Authenticated identity missing from response');
   setSnapshot(verified);setStatus('ready');setSource(response.headers.get('X-Synapse-Data-Source')??'Authorized PostgreSQL');setMessage('');return true;
  }catch{if(!controller.signal.aborted&&version===generation.current&&mounted.current){setSnapshot(null);setStatus('error');setMessage('The current authorized data could not be loaded. Retry when the service is available.');}return false;}
 },[]);
 useEffect(()=>{mounted.current=true;let alive=true;queueMicrotask(()=>{if(alive)void load();});const refresh=()=>{if(document.visibilityState==='visible')void load();};window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);const timer=setInterval(refresh,30000);
  const channels=['synapse-workspace-data','synapse-auth-session','synapse-officer-session'].map(name=>new BroadcastChannel(name));channel.current=channels[0];
  for(const c of channels)c.onmessage=()=>{if(c.name!=='synapse-workspace-data'){active.current?.abort();++generation.current;setSnapshot(null);setStatus('loading');}void load();};
  return()=>{alive=false;mounted.current=false;active.current?.abort();clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);channels.forEach(c=>c.close());channel.current=null;};
 },[load]);
 const command=async(cmd:Command,key:string,onResult?:(r:CommandResult)=>void)=>{setBusy(true);setMessage('');try{const response=await fetch('/api/workspace/commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idempotencyKey:key,command:cmd})}),body=await response.json();
  if(!response.ok){const errorMessage=body.error?.message??'The operation was not committed.';setMessage(errorMessage);if([401,403].includes(response.status)){setSnapshot(null);setStatus('loading');await load();setMessage(errorMessage);}return false;}
  const result=resultSchema.parse(body);onResult?.(result);channel.current?.postMessage({revision:result.revision});const refreshed=await load();if(!refreshed)setMessage('The change was saved, but current data could not be refreshed. Reload before another change.');return true;
 }catch{setMessage('The result could not be verified. Retry with the same request key to avoid duplicate records.');return false;}finally{setBusy(false);}};
 return <OperationalContext.Provider value={{snapshot,status,message,busy,source,load,command}}>{children}</OperationalContext.Provider>;
}
