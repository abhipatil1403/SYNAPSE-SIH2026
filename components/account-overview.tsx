"use client";
import Link from 'next/link';
import {ArrowUpRight,LockKeyhole,ShieldCheck,Sparkles} from './symbols';
import {Card,Empty,Metric,PageHeader} from './ui';
import {QuickCalendar} from './calendar-view';

/** Preserve the dashboard composition without presenting unavailable data as zero. */
export function AccountOverview(){
 return <div className="overview-dashboard account-overview" data-testid="account-overview">
  <PageHeader title="Overview" subtitle="Your account, calendar and authorized case overview.">
   <Link href="/settings" prefetch={false} className="btn">My account <ArrowUpRight size={16}/></Link>
   <button className="btn primary" disabled title="Complaint changes are not enabled">Create Complaint</button>
  </PageHeader>
  <div className="account-access-notice" role="status"><ShieldCheck size={20}/><div><h2>Complaint access awaiting review</h2><p>The account connection is ready. Complaint preview is a separate release; unavailable values stay marked with a dash.</p><Link href="/help#workspace-access" prefetch={false} className="text-btn">See what needs to happen next ↗</Link></div></div>
  <div className="metrics-grid">{['Total Complaints','Resolved Cases','Active Cases','Pending Review'].map((title,index)=><Metric key={title} title={title} value="—" caption="Awaiting complaint access" featured={index===0}/>)}</div>
  <div className="dashboard-grid">
   <Card title="Complaint Analytics" className="analytics-card"><div className="account-chart-unavailable" role="img" aria-label="Complaint analytics unavailable until access is approved"><LockKeyhole size={34}/><strong>Analytics awaiting access</strong><p>Your authorized case data will populate this chart.</p></div></Card>
   <Card title="Upcoming Deadlines" className="deadline-card"><p className="card-subtitle">Case deadlines require complaint access.</p><Empty title="Deadlines unavailable" description="Due dates will appear when their records are available."/></Card>
   <QuickCalendar events={[]} eventsUnavailable/>
   <Card title="Bureau Coordination" className="coordination-card"><Empty title="Bureau totals unavailable" description="Authorized Bureau workloads will appear here."/><Link className="text-btn" href="/settings" prefetch={false}>View my account <ArrowUpRight size={14}/></Link></Card>
   <Card title="Resolution Progress" className="progress-card"><div className="account-progress-unavailable"><svg viewBox="0 0 280 180" role="img" aria-label="Resolution percentage unavailable until complaint access is approved"><path d="M 28 148 A 112 112 0 0 1 252 148" fill="none" stroke="var(--border, #e3e7e4)" strokeWidth="28" strokeLinecap="round"/><text x="140" y="127" textAnchor="middle" fill="currentColor" fontSize="58">—</text></svg><p>Percentage unavailable</p></div><p className="fine-print">Calculated from authorized registered cases when available.</p></Card>
   <Card title="Recent Cases" className="recent-card"><Empty title="Case list unavailable" description="Your authorized complaints will appear after access is approved."/></Card>
   <section className="intelligence-feature"><div className="feature-orbit"/><div className="feature-label"><Sparkles size={16}/>AI FINDINGS</div><h2>Insights awaiting<br/>case access.</h2><p>Findings will appear once their authorized sources are connected.</p><Link href="/settings" prefetch={false} className="btn light">View my account <ArrowUpRight size={16}/></Link></section>
   <Card title="Recent Activity" className="activity-card"><Empty title="Activity unavailable" description="Case activity will appear when its records are accessible."/></Card>
  </div>
 </div>;
}
