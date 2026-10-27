"use client";
import {usePathname} from 'next/navigation';
import type {ReactNode} from 'react';
import {OperationalProvider} from './operational-provider';
import {Shell} from './shell';
export function AppFrame({children}:{children:ReactNode}){
 const path=usePathname();
 if(['/login','/signup','/forgot-password','/reset-password','/pending-approval'].includes(path)||path.startsWith('/auth/'))return children;
 return <OperationalProvider><Shell>{children}</Shell></OperationalProvider>;
}
