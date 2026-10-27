"use client";
import {OperationalPages} from './platform-workspace';
import {Suspense} from 'react';
export function Workspace({route,caseId}:{route:string;caseId?:string}){const section=route==='complaints'?'cases':route;return <Suspense fallback={<p role="status">Loading authorized view…</p>}><OperationalPages path={[section,...(caseId?[caseId]:[])]}/></Suspense>;}
