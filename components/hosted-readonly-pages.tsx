"use client";
import Link from "next/link";
import {useState} from "react";
import {useOperational} from "./operational-provider";
import {Overview} from "./overview";
import {AccountOverview} from './account-overview';
import {OfficerAdministration} from "./officer-workspace";
import {AccountProfile,AccountReadiness} from "./account-profile";
import {OperationalCalendar,OperationalAnalytics} from "./operational-panels";
import {liveStatusLabels,livePriorityLabels} from "@/lib/live/contracts";
import {registry} from "@/lib/platform/selectors";
import {PageHeader} from "./ui";

export function HostedReadonlyPages({section,caseId,initialStatus}:{section:string;caseId?:string;initialStatus:string}){
 const {snapshot:s,load}=useOperational(),[q,setQ]=useState(''),[status,setStatus]=useState(initialStatus),[page,setPage]=useState(1);
 if(!s?.workspace)return null;
 const dataAvailable=s.workspace.mode==='READ_ONLY',rows=registry(s,{q,status,page,pageSize:20}),selected=s.cases.find(c=>c.id===caseId);
 if(section==='dashboard')return dataAvailable?<><p className="platform-notice" role="status">{s.workspace.reason}</p><Overview/></>:<AccountOverview/>;
 const unavailable=<section className="card"><h2>{dataAvailable?'Hosted feature awaiting integration':'Complaint access awaiting review'}</h2><p>{dataAvailable?'This feature is not connected in the read-only preview. Its records and business operations are not represented by empty counts.':s.workspace.reason}</p><p>Your verified account remains available through Settings. Account administrators can use Audit & Administration.</p><div className="button-row"><Link prefetch={false} className="btn" href="/settings">My account</Link>{s.me?.roles.includes('SYSTEM_ADMIN')&&<Link prefetch={false} className="btn primary" href="/admin">User approvals</Link>}</div></section>;
 const table=<div className="platform-table-wrap"><table className="platform-table"><thead><tr><th>Case</th><th>Subject</th><th>Status</th><th>Priority</th></tr></thead><tbody>{rows.items.map(c=><tr key={c.id}><td><Link prefetch={false} href={'/complaints/'+c.id}>#{c.caseNumber}</Link></td><td><Link prefetch={false} href={'/complaints/'+c.id}>{c.subject}</Link></td><td>{liveStatusLabels[c.status]}</td><td>{livePriorityLabels[c.priority]}</td></tr>)}</tbody></table>{!rows.total&&<p>No cases are authorized for this account.</p>}<div className="button-row"><button className="btn" disabled={page===1} onClick={()=>setPage(page-1)}>Previous</button><span>{rows.total} authorized cases · Page {page}</span><button className="btn" disabled={page*20>=rows.total} onClick={()=>setPage(page+1)}>Next</button></div></div>;
 let content=unavailable;
 if(section==='admin')content=<OfficerAdministration/>;
 else if(section==='calendar')content=<><p className="muted">{dataAvailable?'Authorized case-level SLA dates.':'Dates are available; case events are awaiting complaint access.'}</p><OperationalCalendar/></>;
 else if(section==='settings')content=<><AccountProfile/><AccountReadiness/></>;
 else if(section==='help')content=<section className="card"><h2>Supabase workspace</h2><p>Your account is resolved through real Supabase Auth and the private authorization gateway. Case access requires a reviewed, expiring read lease; administration does not automatically grant complaint privileges.</p><p>The current case preview includes authorized registered cases, their institution/Bureau/category labels and case-level SLA dates. Tasks, documents, AI findings, scheduled activities and business writes are not connected here.</p></section>;
 else if(dataAvailable){
  if(section==='dashboard')content=<Overview/>;
  else if(section==='calendar')content=<><p className="platform-notice">Case-level SLA dates only. Task deadlines and scheduled activities await hosted integration.</p><OperationalCalendar/></>;
  else if(section==='analytics')content=<OperationalAnalytics/>;
  else if(section==='cases'&&caseId)content=selected?<section className="card"><p className="eyebrow">#{selected.caseNumber} · {liveStatusLabels[selected.status]}</p><h2>{selected.subject}</h2><p style={{whiteSpace:'pre-wrap'}}>{selected.summary}</p><p>Priority: {livePriorityLabels[selected.priority]} · Version {selected.version}</p><p>Received: {selected.receivedAt}</p><h3>Case-level SLA</h3>{s.sla.filter(v=>v.caseId===selected.id).map(v=><p key={v.id}>{v.status} · Due {v.dueAt} · Original due {v.originalDueAt}</p>)}<p>Documents, comments and case changes are unavailable in this read-only preview.</p></section>:<section className="card"><h2>Case unavailable</h2><p>No authorized case matches this link.</p></section>;
  else if(section==='cases'||section==='reports')content=<section className="card"><h2>{section==='reports'?'Authorized case report':'Complaints'}</h2><div className="platform-filters"><label>Search<input value={q} onChange={e=>{setQ(e.target.value);setPage(1);}}/></label><label>Status<select value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="">All states</option><option value="active">Active cases</option>{Object.entries(liveStatusLabels).map(([code,label])=><option key={code} value={code}>{label}</option>)}</select></label></div>{table}{section==='reports'&&<p>Audited downloads await hosted export integration.</p>}</section>;
  else if(section==='institutions')content=<section className="card"><h2>Institutions in your authorized cases</h2>{s.institutions.map(i=><article key={i.id}><h3>{i.name}</h3><p>{i.state}</p><p>{s.cases.filter(c=>c.institutionId===i.id).length} authorized complaints</p></article>)}{!s.institutions.length&&<p>No institutions are visible through authorized cases.</p>}</section>;
 }
 return <div className="operational-page">{(section!=="dashboard"||!dataAvailable)&&<PageHeader title={section==='dashboard'?'Overview':section==='admin'?'Audit & Administration':section==='settings'?'My account':section==='cases'?'Complaints':section.charAt(0).toUpperCase()+section.slice(1)} subtitle="Verified Supabase account · business writes disabled"><button className="btn" onClick={()=>void load()}>Refresh</button></PageHeader>}<p className="platform-notice" role="status">{s.workspace.reason}</p>{content}</div>;
}
