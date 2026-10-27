"use client";
import {useEffect,type RefObject} from 'react';
export function useDismissLayer(open:boolean,layer:RefObject<HTMLElement|null>,trigger:RefObject<HTMLElement|null>,close:()=>void){
 useEffect(()=>{if(!open)return;const outside=(event:PointerEvent|FocusEvent)=>{const target=event.target;if(target instanceof Node&&!layer.current?.contains(target)&&!trigger.current?.contains(target))close();};const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();close();trigger.current?.focus();}};
 document.addEventListener('pointerdown',outside);document.addEventListener('focusin',outside);document.addEventListener('keydown',escape);
 return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('focusin',outside);document.removeEventListener('keydown',escape);};
 },[open,layer,trigger,close]);
}
