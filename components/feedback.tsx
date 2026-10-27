"use client";
import {createContext,useCallback,useContext,useEffect,useRef,useState,type FormEvent,type FormHTMLAttributes,type ReactNode} from 'react';
export type ToastTone='success'|'error'|'info';
type Notice={id:number;message:string;tone:ToastTone};
type ToastApi={notify:(message:string,tone?:ToastTone)=>void};
const Context=createContext<ToastApi>({notify:()=>{}});
export function useToast(){return useContext(Context);}
export function ToastProvider({children}:{children:ReactNode}){
 const layer=useRef<HTMLElement|null>(null);
 const [notices,setNotices]=useState<Notice[]>([]),sequence=useRef(0),recent=useRef({message:'',at:0});
 const notify=useCallback((message:string,tone:ToastTone='info')=>{if(!message.trim())return;const now=Date.now();if(recent.current.message===message&&now-recent.current.at<1200)return;recent.current={message,at:now};const notice={id:++sequence.current,message,tone};setNotices(rows=>[...rows,notice].slice(-6));},[]);
 const dismiss=useCallback((id:number)=>setNotices(rows=>rows.filter(n=>n.id!==id)),[]);
 useEffect(()=>{const element=layer.current;if(!element?.showPopover)return;if(element.matches(':popover-open'))element.hidePopover();if(notices.length)element.showPopover();},[notices]);
 return <Context.Provider value={{notify}}>{children}<aside ref={layer} popover="manual" className="toast-stack" aria-label="System messages">{notices.map(n=><ToastItem key={n.id} notice={n} dismiss={dismiss}/>)}</aside></Context.Provider>;
}
function ToastItem({notice,dismiss}:{notice:Notice;dismiss:(id:number)=>void}){
 const [paused,setPaused]=useState(false);
 useEffect(()=>{if(paused)return;const timer=setTimeout(()=>dismiss(notice.id),notice.tone==='error'?12000:6500);return()=>clearTimeout(timer);},[notice.id,notice.tone,dismiss,paused]);
 return <div className={'toast toast-item '+notice.tone} role={notice.tone==='error'?'alert':'status'} onPointerEnter={()=>setPaused(true)} onPointerLeave={()=>setPaused(false)} onFocus={()=>setPaused(true)} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setPaused(false);}}><span className="toast-indicator" aria-hidden="true">{notice.tone==='success'?'✓':notice.tone==='error'?'!':'·'}</span><span>{notice.message}</span><button type="button" aria-label="Dismiss message" onClick={()=>dismiss(notice.id)}>×</button></div>;
}
/** Bridge existing local feedback state into the shared bottom message stack. */
export function Feedback({message,tone}:{message:string;tone?:ToastTone}){
 const {notify}=useToast();
 useEffect(()=>{if(message)notify(message,tone??(/could not|cannot|unable|unavailable|failed|error|denied|not saved|not committed|do not match|rejected|blocked/i.test(message)?'error':/saved|updated|accepted|queued|recorded|committed|approved/i.test(message)?'success':'info'));},[message,tone,notify]);
 return null;
}
export function Spinner({label='Please wait'}:{label?:string}){return <span className="wait-spinner" role="status" aria-label={label}/>;}

/** Await real submit handlers and lock a form synchronously against double submission. */
export function ActionForm({children,onSubmit,...props}:Omit<FormHTMLAttributes<HTMLFormElement>,'onSubmit'> & {onSubmit?:(event:FormEvent<HTMLFormElement>)=>unknown}){
 const [pending,setPending]=useState(false),lock=useRef(false),{notify}=useToast();
 return <form {...props} aria-busy={pending} onSubmit={async event=>{event.preventDefault();if(lock.current){event.preventDefault();return;}lock.current=true;setPending(true);try{await onSubmit?.(event);}catch{notify('The operation could not be completed. Review the fields and try again.','error');}finally{lock.current=false;setPending(false);}}}><fieldset className="action-form-fields" disabled={pending}>{children}</fieldset>{pending&&<div className="inline-loading form-pending"><Spinner/>Working on your request…</div>}</form>;
}

export function useFeedbackState(initial=''){
 const [message,setMessage]=useState(initial),{notify}=useToast();
 const update=useCallback((value:string)=>{setMessage(value);if(value)notify(value,/could not|cannot|unable|unavailable|failed|error|denied|not saved|not committed|rejected|blocked/i.test(value)?'error':/saved|updated|accepted|queued|recorded|committed|approved/i.test(value)?'success':'info');},[notify]);
 return [message,update] as const;
}
