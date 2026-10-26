"use client";
import { useState } from "react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownToLine,
  ArrowUpRight,
  CheckCheck,
  Circle,
  FileCheck2,
  Network,
  Sparkles,
} from "lucide-react";
import { bureaus, officers } from "@/lib/seed";
import { metrics } from "@/lib/metrics";
import { dashboardBuckets, type DashboardPeriod } from "@/lib/dashboard";
import { formatCalendarDay, selectCalendarEvents } from "@/lib/calendar";
import { QuickCalendar, useTodayKey } from "./calendar-view";
import { useReducedMotion } from "./motion";
import { useDemo } from "./provider";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Empty,
  Metric,
  PageHeader,
  Tabs,
  csv,
  date,
  dayKey,
  downloadText,
} from "./ui";
import { CreateCaseButton } from "./forms";

const greens = ["#0d3a23", "#1d7347", "#5dbd8b", "#c0e2d0"];
export function Overview() {
  const { cases, tasks, state, actor, findings, audit } = useDemo();
  const m = metrics(cases);
  const reducedMotion = useReducedMotion(state.settings.reducedMotion);
  const [chartMode, setChartMode] = useState("Intake");
  const today = useTodayKey();
  const [period, setPeriod] = useState<DashboardPeriod>("30D");
  const weeks = dashboardBuckets(cases, today, period);
  const calendarEvents = selectCalendarEvents(cases, tasks);
  const chartMaximum = Math.max(
    1,
    ...weeks.map((w) => w[chartMode as "Intake" | "Resolved"]),
  );
  const upcoming = cases
    .filter((c) => c.status !== "DISPOSED" && dayKey(c.dueAt) >= today)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    .slice(0, 3);
  return (
    <div className="overview-dashboard">
      <PageHeader
        title="Overview"
        subtitle="A clear view of every case. A connected path to resolution."
      >
        <Link href="/analytics" className="btn">
          View Reports <ArrowUpRight size={16} />
        </Link>
        <CreateCaseButton />
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
          caption={`${m.overdue} beyond example SLA`}
          href="/complaints?status=active"
        />
        <Metric
          title="Pending Review"
          value={m.review}
          caption="Ready for a closer look"
          href="/complaints?status=RESOLUTION_REVIEW"
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
          <p className="card-subtitle">Example SLAs · next in your scope.</p>
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
                  <strong>{b} Bureau</strong>
                  <p>
                    {relevant.length - done} active cases · {done} resolved
                  </p>
                </div>
                <div className="avatar-stack">
                  {officers
                    .filter((o) => o.bureau === b)
                    .map((o) => (
                      <Avatar key={o.id} id={o.id} small />
                    ))}
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
                  {c.id} · {c.institution}
                </p>
              </div>
              <Badge>{c.status}</Badge>
              <Avatar id={c.officer} small />
            </Link>
          ))}
          {!cases.length && <Empty title="No cases in this perspective" />}
        </Card>
        <section className="intelligence-feature">
          <div className="feature-orbit" />
          <div className="feature-label">
            <Sparkles size={16} />
            AI FINDINGS <Badge tone="light">Simulated</Badge>
          </div>
          <h2>
            {findings.filter((f) => f.state === "Pending review").length}{" "}
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
          title={
            state.settings.digest ? "Recent Activity" : "Activity Digest Paused"
          }
          className="activity-card"
          action={
            <Link href="/admin" className="text-btn">
              Audit trail <ArrowUpRight size={13} />
            </Link>
          }
        >
          {(state.settings.digest ? audit : []).slice(0, 2).map((e) => (
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
          {(!audit.length || !state.settings.digest) && (
            <Empty
              title={
                state.settings.digest
                  ? "No authorized activity"
                  : "Activity digest is turned off"
              }
              description="Manage local activity summaries in Settings → Notifications."
            />
          )}
        </Card>
      </div>
      <div className="workspace-note">
        <ShieldNotice />
        You’re viewing {actor.role.toLowerCase()} access. Example SLAs and
        policies are simulated.
      </div>
    </div>
  );
}
function ShieldNotice() {
  return <Circle size={10} fill="currentColor" />;
}

export function Analytics() {
  const { cases, state, actor, run } = useDemo();
  const [period, setPeriod] = useState("30D");
  const days = Number(period.slice(0, -1));
  const now = new Date();
  const start = now.getTime() - days * 86400000;
  const scoped = cases.filter((c) => Date.parse(c.receivedAt) >= start);
  const m = metrics(scoped, now);
  const data = Array.from({ length: days }, (_, i) => {
    const d = new Date(now.getTime() - (days - 1 - i) * 86400000);
    const key = dayKey(d);
    return {
      name: date(d.toISOString()),
      Intake: cases.filter((c) => dayKey(c.receivedAt) === key).length,
      Resolved: cases.filter(
        (c) =>
          c.disposedAt &&
          dayKey(c.disposedAt) === key &&
          c.status === "DISPOSED",
      ).length,
    };
  });
  const distribution = bureaus
    .map((b) => ({
      name: b,
      value: scoped.filter((c) => c.bureau === b).length,
    }))
    .filter((d) => d.value);
  function exportData() {
    if (
      run(
        { type: "export", caseIds: scoped.map((c) => c.id) },
        "Authorized report exported and audited",
      )
    )
      downloadText(
        "synapse-authorized-report.csv",
        csv([
          [
            "Case ID",
            "Subject",
            "Institution",
            "Bureau",
            "Status",
            "Received",
            "Example SLA",
          ],
          ...scoped.map((c) => [
            c.id,
            c.subject,
            c.institution,
            c.bureau,
            c.status,
            c.receivedAt,
            c.dueAt,
          ]),
        ]),
        "text/csv",
      );
  }
  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="Understand the workload. Find the opportunities to move forward."
      >
        <Tabs
          options={["7D", "30D", "90D"]}
          value={period}
          onChange={setPeriod}
        />
        <Button onClick={exportData}>
          <ArrowDownToLine size={16} />
          Export Report
        </Button>
      </PageHeader>
      <div className="metrics-grid">
        <Metric
          title="Resolved Volume"
          value={m.resolved}
          caption={`Current disposed cases received in ${period}`}
          featured
        />
        <Metric
          title="Overdue Cases"
          value={m.overdue}
          caption="Active cases past their example deadline"
        />
        <Metric
          title="On-time Disposal"
          value={m.onTime === null ? "—" : `${m.onTime}%`}
          caption="On-time ÷ disposed cases in cohort"
        />
        <Metric
          title="Median Resolution"
          value={m.median === null ? "—" : `${m.median.toFixed(1)}d`}
          caption="Received-to-disposal, completed cohort"
        />
      </div>
      <div className="analytics-grid">
        <Card
          title="Intake & Resolution Trend"
          className="trend-card"
          action={<Badge tone="green">Last {days} days</Badge>}
        >
          <p className="card-subtitle">
            Actual fictional event dates. Zero means no recorded event.
          </p>
          <div
            className="trend-chart"
            role="img"
            aria-label={`${data.reduce((n, d) => n + d.Intake, 0)} intake events and ${data.reduce((n, d) => n + d.Resolved, 0)} current disposal events in the selected period`}
          >
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart
                data={data}
                margin={{ top: 15, right: 8, left: -24, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="areaGreen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5dbd8b" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#5dbd8b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#eef0ee" />
                <XAxis
                  dataKey="name"
                  minTickGap={35}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: "#646d67" }}
                />
                <YAxis
                  allowDecimals={false}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: "#646d67" }}
                />
                <Tooltip contentStyle={{ borderRadius: 14, fontSize: 12 }} />
                <Legend iconType="circle" iconSize={7} />
                <Area
                  isAnimationActive={false}
                  type="monotone"
                  dataKey="Intake"
                  stroke="#1d7347"
                  strokeWidth={2.5}
                  fill="url(#areaGreen)"
                />
                <Area
                  isAnimationActive={false}
                  type="monotone"
                  dataKey="Resolved"
                  stroke="#91a49a"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  fill="transparent"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Bureau Distribution">
          <p className="card-subtitle">
            Registered cases received in the selected period
          </p>
          {distribution.length ? (
            <>
              <div
                className="donut-chart"
                role="img"
                aria-label={distribution
                  .map((d) => `${d.name}: ${d.value}`)
                  .join(", ")}
              >
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      isAnimationActive={false}
                      data={distribution}
                      dataKey="value"
                      innerRadius={61}
                      outerRadius={83}
                      paddingAngle={5}
                      stroke="none"
                    >
                      {distribution.map((d, i) => (
                        <Cell key={d.name} fill={greens[i % 4]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div>
                  <strong>{scoped.length}</strong>
                  <span>Total cases</span>
                </div>
              </div>
              {distribution.map((d, i) => (
                <div className="legend-row" key={d.name}>
                  <i style={{ background: greens[i % 4] }} />
                  {d.name}
                  <strong>{d.value}</strong>
                </div>
              ))}
            </>
          ) : (
            <Empty title="No records in this period" />
          )}
        </Card>
        <Card
          title="Activity Overview"
          action={<span className="muted">{days} days</span>}
        >
          <p className="card-subtitle">
            Recorded, authorized audit events per day
          </p>
          <div className="heatmap">
            {Array.from({ length: days }, (_, i) => {
              const day = new Date(now.getTime() - (days - 1 - i) * 86400000);
              const count = state.audit.filter(
                (e) =>
                  cases.some((c) => c.id === e.target) &&
                  dayKey(e.at) === dayKey(day),
              ).length;
              return (
                <span
                  key={i}
                  title={`${date(day.toISOString())}: ${count} events`}
                  style={{
                    background:
                      count > 3 ? "#1d7347" : count ? "#5dbd8b" : "#edf1ee",
                  }}
                />
              );
            })}
          </div>
          <div className="chart-foot">
            <span>Less activity</span>
            <span>
              More activity <i className="legend-dot" />
            </span>
          </div>
        </Card>
        <Card
          title="Bureau Performance"
          action={<span className="muted">Authorized cohort</span>}
        >
          {bureaus.map((b, i) => {
            const bm = metrics(scoped.filter((c) => c.bureau === b));
            return (
              <div className="leader-row" key={b}>
                <span className="rank">0{i + 1}</span>
                <div>
                  <strong>{b}</strong>
                  <p>
                    {bm.resolved} resolved / {bm.total} registered
                  </p>
                </div>
                <div className="workload-track">
                  <span style={{ width: `${bm.rate}%` }} />
                </div>
                <strong>{bm.rate}%</strong>
              </div>
            );
          })}
        </Card>
      </div>
      <p className="fine-print">
        Cohort: cases received in the selected period, scoped to {actor.role}.
        Reopened cases are active; trend shows current disposal records, not a
        historical compliance report.
      </p>
    </>
  );
}
