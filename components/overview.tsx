"use client";
import { useState } from "react";
import Link from "next/link";
import {liveRoleLabels} from "@/lib/live/contracts";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ArrowUpRight,
  CheckCheck,
  Circle,
  FileCheck2,
  Network,
  Sparkles,
} from "lucide-react";


import type {DashboardPeriod} from "@/lib/dashboard";
import {platformDashboard,platformCalendar} from "@/lib/platform/selectors";
import {formatCalendarDay,addCalendarDays,type CalendarEvent} from "@/lib/calendar";
import { QuickCalendar, useTodayKey } from "./calendar-view";
import { useReducedMotion } from "./motion";
import {useOperational} from "./operational-provider";
import {
  Avatar,
  Badge,
  Card,
  Empty,
  Metric,
  PageHeader,
  date,
  dayKey,
} from "./ui";


const greens = ["#0d3a23", "#1d7347", "#5dbd8b", "#c0e2d0"];
export function Overview() {
  const {snapshot:s}=useOperational();
  const reducedMotion=useReducedMotion(false),[chartMode,setChartMode]=useState('Intake'),today=useTodayKey(),[period,setPeriod]=useState<DashboardPeriod>('30D');
  if(!s?.me)return null;
  const dash=platformDashboard(s,s.generatedAt,Number(period.slice(0,-1))),m={total:dash.total,resolved:dash.resolved,active:dash.active,overdue:dash.overdue,review:dash.pendingReview,rate:dash.resolutionPercent};
  const cases=[...s.cases].sort((a,b)=>Date.parse(b.receivedAt)-Date.parse(a.receivedAt)).map(c=>({...c,institution:s.institutions.find(i=>i.id===c.institutionId)?.name??c.institutionId,bureau:s.bureaus.find(b=>b.id===c.bureauId)?.name??c.bureauId,officerName:s.directory?.find(u=>u.id===c.officerId)?.name??'Assigned officer'}));
  const bureaus=s.bureaus.map(b=>b.name),actor={role:s.me.roles.map(code=>liveRoleLabels[code as keyof typeof liveRoleLabels]??code).join(' · ')};
  const findings=s.findings, audit=dash.activity.map(e=>({...e,action:e.type,actor:s.directory?.find(u=>u.id===e.actorId)?.name??e.actorId,target:e.caseId?('#'+s.cases.find(c=>c.id===e.caseId)?.caseNumber):'Workspace'}));
  const weeks=dash.analytics.map(b=>({...b,end:addCalendarDays(b.end,-1),name:formatCalendarDay(b.start,{day:'numeric',month:'short'}),Intake:b.received,Resolved:b.resolved}));
  const types:Record<string,CalendarEvent['type']>={SLA:'SLA deadlines',TASK:'Follow-ups',HEARING:'Hearings',REVIEW:'Bureau reviews',APPROVAL:'Approvals',BUREAU_ACTIVITY:'Bureau activities'};
  const calendarEvents:CalendarEvent[]=platformCalendar(s).map(e=>({...e,key:e.day,type:types[e.type],bureau:s.bureaus.find(b=>b.id===s.cases.find(c=>c.id===e.caseId)?.bureauId)?.name??'',source:e.type}));
  const chartMaximum=Math.max(1,...weeks.map(w=>w[chartMode as 'Intake'|'Resolved']));
  const upcoming=cases.filter(c=>c.status!=='DISPOSED').flatMap(c=>{const due=s.sla.filter(d=>d.caseId===c.id&&['RUNNING','PAUSED','BREACHED'].includes(d.status)).sort((a,b)=>Date.parse(a.dueAt)-Date.parse(b.dueAt))[0];return due?[{...c,dueAt:due.dueAt}]:[];}).filter(c=>dayKey(c.dueAt)>=today).sort((a,b)=>Date.parse(a.dueAt)-Date.parse(b.dueAt)).slice(0,3);
  return (
    <div className="overview-dashboard">
      <PageHeader
        title="Overview"
        subtitle="A clear view of every case. A connected path to resolution."
      >
        <Link href="/reports" className="btn">
          View Reports <ArrowUpRight size={16} />
        </Link>
        <Link href="/intake" className="btn primary">Create Complaint</Link>
      </PageHeader>
      <div className="metrics-grid">
        <Metric
          title="Total Complaints"
          value={m.total}
          caption="Across your authorized workspace"
          href="/complaints"
          featured
        />
        <Metric
          title="Resolved Cases"
          value={m.resolved}
          caption={`${m.rate}% of registered complaints`}
          href="/complaints?status=DISPOSED"
        />
        <Metric
          title="Active Cases"
          value={m.active}
          caption={`${m.overdue} beyond approved SLA`}
          href="/complaints?status=active"
        />
        <Metric
          title="Pending Review"
          value={m.review}
          caption="Ready for a closer look"
          href="/complaints?status=UNDER_REVIEW"
        />
      </div>
      <div className="dashboard-grid">
        <Card
          title="Complaint Analytics"
          className="analytics-card"
          action={
            <div className="dashboard-chart-controls">
              <select
                aria-label="Dashboard chart period"
                className="tiny-select"
                value={period}
                onChange={(e) => setPeriod(e.target.value as DashboardPeriod)}
              >
                {["7D", "30D", "90D"].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
              <select
                aria-label="Dashboard chart series"
                className="tiny-select"
                value={chartMode}
                onChange={(e) => setChartMode(e.target.value)}
              >
                <option value="Intake">Received</option>
                <option>Resolved</option>
              </select>
            </div>
          }
        >
          <div
            className="bar-chart"
            role="img"
            aria-label={`${chartMode} counts across seven intervals in ${period}: ${weeks.map((w) => `${w.name}: ${w[chartMode as "Intake" | "Resolved"]}`).join(", ")}`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={weeks}
                barCategoryGap="7%"
                margin={{ top: 8, right: 0, bottom: 0, left: 0 }}
              >
                <defs>
                  <pattern
                    id="hatch"
                    width="6"
                    height="6"
                    patternUnits="userSpaceOnUse"
                    patternTransform="rotate(45)"
                  >
                    <rect width="6" height="6" fill="#f0f3f0" />
                    <line
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="6"
                      stroke="#c0e2d0"
                      strokeWidth="2"
                    />
                  </pattern>
                </defs>
                <CartesianGrid vertical={false} stroke="#eef0ee" />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#646d67", fontSize: 12 }}
                  interval={0}
                  tickMargin={10}
                />
                <YAxis
                  allowDecimals={false}
                  axisLine={false}
                  tickLine={false}
                  width={24}
                  domain={[0, chartMaximum]}
                  tickCount={4}
                  tick={{ fill: "#646d67", fontSize: 11 }}
                />
                <Tooltip
                  cursor={{ fill: "#eef3ef", radius: 12 }}
                  labelFormatter={(label) => {
                    const bucket = weeks.find((w) => w.name === String(label));
                    return bucket
                      ? `${formatCalendarDay(bucket.start, { day: "numeric", month: "short" })} – ${formatCalendarDay(bucket.end, { day: "numeric", month: "short" })}`
                      : label;
                  }}
                  formatter={(value) => [
                    value,
                    chartMode === "Intake"
                      ? "Received cases"
                      : "Disposed cases",
                  ]}
                  contentStyle={{
                    borderRadius: 14,
                    border: "1px solid #e3e7e4",
                    fontSize: 12,
                  }}
                />
                <Bar
                  isAnimationActive={!reducedMotion}
                  animationDuration={240}
                  animationEasing="ease-out"
                  dataKey={chartMode}
                  maxBarSize={76}
                  radius={[38, 38, 38, 38]}
                >
                  {weeks.map((_, i) => (
                    <Cell
                      key={i}
                      fill={i === 3 ? "url(#hatch)" : greens[i % 4]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {weeks.every(
              (bucket) => bucket[chartMode as "Intake" | "Resolved"] === 0,
            ) && (
              <p className="dashboard-chart-empty" role="status">
                No {chartMode === "Intake" ? "received" : "disposed"} cases in
                this period.
              </p>
            )}
          </div>
          <div className="chart-foot">
            <span>
              <i className="legend-dot" />{" "}
              {chartMode === "Intake" ? "Received" : "Disposed"} cases
            </span>
            <span>{period} · 7 reporting intervals</span>
          </div>
        </Card>
        <Card
          title="Upcoming Deadlines"
          className="deadline-card"
          action={
            <Link
              href="/calendar"
              className="icon-link"
              aria-label="Open calendar"
            >
              <ArrowUpRight size={17} />
            </Link>
          }
        >
          <p className="card-subtitle">Approved deadlines · next in your scope.</p>
          {upcoming.length ? (
            upcoming.map((c, i) => (
              <Link
                href={`/complaints/${c.id}`}
                className="deadline-row"
                key={c.id}
              >
                <div className={`date-box ${i === 0 ? "green" : ""}`}>
                  <strong>{date(c.dueAt, { day: "numeric" })}</strong>
                  <span>{date(c.dueAt, { month: "short" })}</span>
                </div>
                <div>
                  <strong>{c.subject}</strong>
                  <p>
                    {c.bureau} · {c.id}
                  </p>
                </div>
                <span className="deadline-arrow">
                  <ArrowUpRight size={15} />
                </span>
              </Link>
            ))
          ) : (
            <Empty title="No upcoming deadlines" />
          )}
        </Card>
        <QuickCalendar events={calendarEvents} />
        <Card
          title="Bureau Coordination"
          className="coordination-card"
          action={
            <Link href="/coordination" className="text-btn">
              View all <ArrowUpRight size={13} />
            </Link>
          }
        >
          {bureaus.map((b, i) => {
            const relevant = cases.filter((c) => c.bureau === b);
            const done = relevant.filter((c) => c.status === "DISPOSED").length;
            return (
              <Link
                href={`/complaints?bureau=${encodeURIComponent(b)}`}
                className="bureau-row"
                key={b}
              >
                <span className={`bureau-symbol symbol-${i}`}>
                  <Network size={18} />
                </span>
                <div>
                  <strong>{b}</strong>
                  <p>
                    {relevant.length - done} active cases · {done} resolved
                  </p>
                </div>
                <div className="avatar-stack">
                  {s.directory?.filter(u=>u.bureauIds.includes(s.bureaus.find(v=>v.name===b)!.id)).slice(0,4).map(u=><Avatar key={u.id} name={u.name} small/>)}
                </div>
                <Badge tone="neutral">
                  {relevant.length
                    ? Math.round((done / relevant.length) * 100)
                    : 0}
                  %
                </Badge>
              </Link>
            );
          })}
        </Card>
        <Card
          title="Resolution Progress"
          className="progress-card"
          action={
            <Link
              href="/resolutions"
              className="icon-link"
              aria-label="Open resolution center"
            >
              <ArrowUpRight size={17} />
            </Link>
          }
        >
          <div
            className="progress-gauge"
            role="img"
            aria-label={`${m.rate}% of authorized complaints resolved`}
          >
            <svg viewBox="0 0 280 170" aria-hidden="true">
              <path
                d="M 24 145 A 116 116 0 0 1 256 145"
                pathLength="100"
                fill="none"
                stroke="#edf1ee"
                strokeWidth="30"
                strokeLinecap="round"
              />
              <path
                d="M 24 145 A 116 116 0 0 1 256 145"
                pathLength="100"
                fill="none"
                stroke="#1d7347"
                strokeWidth="30"
                strokeLinecap="round"
                className="gauge-value"
                opacity={m.rate > 0 ? 1 : 0}
                strokeDasharray={`${m.rate} 100`}
              />
            </svg>
            <div>
              <strong>
                {m.rate}
                <span>%</span>
              </strong>
              <p>Cases resolved</p>
            </div>
          </div>
          <div className="progress-legend">
            <span>
              <i className="legend-dot" />
              {m.resolved} Resolved
            </span>
            <span>
              <i className="legend-dot pale" />
              {m.active} Active
            </span>
          </div>
          <p className="fine-print">
            Based on {m.total} authorized registered cases.
          </p>
        </Card>
        <Card
          title="Recent Cases"
          className="recent-card"
          action={
            <Link href="/complaints" className="text-btn">
              View all <ArrowUpRight size={13} />
            </Link>
          }
        >
          {cases.slice(0, 3).map((c) => (
            <Link
              className="recent-row"
              key={c.id}
              href={`/complaints/${c.id}`}
            >
              <span className="case-icon">
                <FileCheck2 size={17} />
              </span>
              <div>
                <strong>{c.subject}</strong>
                <p>
                  #{c.caseNumber} · {c.institution}
                </p>
              </div>
              <Badge>{c.status}</Badge>
              <Avatar name={c.officerName} small />
            </Link>
          ))}
          {!cases.length && <Empty title="No authorized registered cases" />}
        </Card>
        <section className="intelligence-feature">
          <div className="feature-orbit" />
          <div className="feature-label">
            <Sparkles size={16} />
            AI FINDINGS <Badge tone="light">Human review</Badge>
          </div>
          <h2>
            {findings.filter((f) => f.status === "DETECTED").length}{" "}
            findings
            <br />
            to review.
          </h2>
          <p>
            Source-backed insights.
            <br />
            Human-reviewed decisions.
          </p>
          <Link href="/intelligence" className="btn light">
            Review Findings <ArrowUpRight size={16} />
          </Link>
        </section>
        <Card
          title="Recent Activity"
          className="activity-card"
          action={
            <Link href="/admin" className="text-btn">
              Audit trail <ArrowUpRight size={13} />
            </Link>
          }
        >
          {audit.slice(0, 2).map((e) => (
            <div className="activity-row" key={e.id}>
              <span className="activity-point">
                <CheckCheck size={14} />
              </span>
              <div>
                <strong>{e.action}</strong>
                <p>
                  {e.actor} · {e.target}
                </p>
              </div>
              <small>{date(e.at)}</small>
            </div>
          ))}
          {!audit.length&&<Empty title="No authorized activity" description="Committed workspace changes appear here."/>}
        </Card>
      </div>
      <div className="workspace-note">
        <ShieldNotice />
        {actor.role} · Authorized PostgreSQL development data · Hosted release disabled.
      </div>
    </div>
  );
}
function ShieldNotice() {
  return <Circle size={10} fill="currentColor" />;
}
