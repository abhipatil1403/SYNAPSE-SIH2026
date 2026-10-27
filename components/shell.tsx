"use client";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import Link from "next/link";
import {liveRoleLabels} from "@/lib/live/contracts";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  ArrowUpRight,
  Bell,
  BookOpen,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronDown,
  CircleHelp,
  Command,
  FileCheck2,
  FolderKanban,
  GitBranch,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Menu,
  Network,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";

import { useOperational } from "./operational-provider";
import { Avatar, Badge, Empty, Modal, date } from "./ui";

export const navigation: {
  group: string;
  items: [string, string, LucideIcon][];
}[] = [
  {
    group: "WORKSPACE",
    items: [
      ["dashboard", "Overview", LayoutDashboard],
      ["intake", "Intake Queue", Inbox],
      ["complaints", "Complaints", FolderKanban],
      ["institutions", "Institutions", BookOpen],
      ["tasks", "My Work", ListChecks],
      ["calendar", "Calendar", CalendarDays],
      ["analytics", "Analytics", ChartNoAxesCombined],
      ["reports", "Reports", ChartNoAxesCombined],
      ["notifications", "Notifications", Bell],
    ],
  },
  {
    group: "INTELLIGENCE & COORDINATION",
    items: [
      ["intelligence", "AI Intelligence", Sparkles],
      ["coordination", "Cross-Bureau", Network],
      ["dependencies", "Dependency Explorer", GitBranch],
      ["resolutions", "Resolution Center", FileCheck2],
    ],
  },
  {
    group: "GENERAL",
    items: [
      ["team", "Bureau Directory", Users],
      ["settings", "Settings", Settings2],
      ["help", "Help & Resources", CircleHelp],
      ["admin", "Audit & Administration", ShieldCheck],
    ],
  },
];
const subscribeMobile = (listener: () => void) => {
  const media = window.matchMedia("(max-width:1024px)");
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
};
const mobileSnapshot = () => window.matchMedia("(max-width:1024px)").matches;
export function Shell({ children }: { children: ReactNode }) {
  const {snapshot,status,message,command,load,busy}=useOperational();
  const pathname = usePathname();
  const router = useRouter();
  const [search, setSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [sessionError,setSessionError]=useState('');
  const mobile = useSyncExternalStore(
    subscribeMobile,
    mobileSnapshot,
    () => false,
  );
  useEffect(() => {
    if (!mobile || !drawer) return;
    const previous = document.activeElement as HTMLElement | null;
    const sidebar = document.querySelector<HTMLElement>(".sidebar");
    const controls = sidebar?.querySelectorAll<HTMLElement>(
      "a,button:not(:disabled),select",
    );
    controls?.[0]?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !controls?.length) return;
      const first = controls[0],
        last = controls[controls.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [mobile, drawer]);
  const title =
    navigation
      .flatMap((g) => g.items)
      .find((i) => pathname.startsWith(`/${i[0]}`))?.[1] ?? "Workspace";
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch((v) => !v);
      }
      if (e.key === "Escape") {
        setDrawer(false);
        setNotifications(false);
        setUserMenu(false);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const signOut=async()=>{setSessionError('');try{const r=await fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!r.ok){setSessionError('Sign-out could not be confirmed. Retry while connected.');return;}const c=new BroadcastChannel('synapse-auth-session');c.postMessage('signed-out');c.close();window.location.replace('/login');}catch{setSessionError('Sign-out could not be confirmed. Check your connection and retry.');}};
  if(!snapshot?.me)return <main className="boot"><div className="brand-mark"><Network/></div><h1>SYNAPSE</h1><p role="status">{status==='error'?message:'Loading your authorized workspace…'}</p>{status==='error'&&<><button className="btn" onClick={()=>void load()}>Retry connection</button><Link prefetch={false} href="/login">Sign in</Link><button className="btn" onClick={()=>void signOut()}>Sign out</button>{sessionError&&<p role="alert">{sessionError}</p>}</>}</main>;
  const {cases,tasks,findings}=snapshot,me=snapshot.me;
  const actor={name:me.name,role:me.roles.map(code=>liveRoleLabels[code as keyof typeof liveRoleLabels]??code).join(' · '),bureau:me.bureauIds.map(id=>snapshot.bureaus.find(b=>b.id===id)?.name??id).join(', ')};
  const isAdmin=me.roles.includes('SYSTEM_ADMIN');
  const pending=tasks.filter(t=>!['COMPLETED','CANCELLED'].includes(t.status)).length;
  const alerts=[...snapshot.notifications].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,8),unread=snapshot.notifications.filter(n=>!n.readAt).length;
  const results=cases.filter(c=>(c.subject+' '+c.caseNumber+' '+(snapshot.institutions.find(i=>i.id===c.institutionId)?.name??'')).toLowerCase().includes(query.toLowerCase())).slice(0,6);
  function navigate(href: string) {
    router.push(href);
    setSearch(false);
    setDrawer(false);
  }
  return (
    <div
      className={`app-shell ${pathname === "/dashboard" ? "overview-shell" : ""}`}
    >
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {drawer && (
        <button
          className="drawer-backdrop"
          aria-label="Close navigation"
          onClick={() => setDrawer(false)}
        />
      )}
      <aside
        className={`sidebar ${drawer ? "open" : ""}`}
        aria-label="Main navigation"
        role={mobile ? "dialog" : undefined}
        aria-modal={mobile && drawer ? true : undefined}
        aria-hidden={mobile && !drawer ? true : undefined}
        inert={mobile && !drawer}
      >
        <Link prefetch={false}
          href="/dashboard"
          className="brand"
          onClick={() => setDrawer(false)}
        >
          <span className="brand-mark">
            <Network size={23} />
          </span>
          <span>
            SYNAPSE
            <span className="brand-caption">CONNECTED. COORDINATED.</span>
          </span>
        </Link>
        <div className="workspace-switch">
          <span className="workspace-icon">
            <ShieldCheck size={19} />
          </span>
          <div>
            <strong>AICTE Workspace</strong>
            <small>SIH 2026 · PS 26264</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <nav>
          {navigation.map((group) => (
            <div className="nav-group" key={group.group}>
              <div className="nav-label">{group.group}</div>
              {group.items
                .filter(
                  (item) =>
                    item[0] !== "admin" ||
                    isAdmin,
                )
                .map(([route, label, Icon]) => (
                  <Link prefetch={false}
                    key={route}
                    href={`/${route}`}
                    onClick={() => setDrawer(false)}
                    className={`nav-link ${pathname.startsWith(`/${route}`) ? "active" : ""}`}
                    aria-current={
                      pathname.startsWith(`/${route}`) ? "page" : undefined
                    }
                  >
                    <Icon size={18} strokeWidth={1.7} />
                    <span>{label}</span>
                    {route === "tasks" && pending > 0 && (
                      <span className="nav-count">{pending}</span>
                    )}
                    {route === "intelligence" &&
                      findings.filter((f) => f.status === "DETECTED")
                        .length > 0 && <span className="nav-dot" />}
                  </Link>
                ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-feature">
            <span className="feature-orbit" />
            <Sparkles size={20} />
            <h3>
              Better connected.
              <br />
              Better resolved.
            </h3>
            <p>
              Turn shared context into
              <br />
              meaningful resolution.
            </p>
            <Link prefetch={false} href="/help" className="btn light">
              Workspace guide <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="sidebar-foot">
            <span className="status-dot" />
            {snapshot.workspace?'Authenticated Supabase workspace':'Authenticated development workspace'}
          </div>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <button
            className="icon-btn mobile-menu"
            aria-label="Open navigation"
            aria-expanded={drawer}
            onClick={() => setDrawer((v) => !v)}
          >
            <Menu size={21} />
          </button>
          <button
            aria-label="Search workspace"
            className="global-search"
            onClick={() => setSearch(true)}
          >
            <Search size={17} />
            <span>Search cases, institutions and more…</span>
            <kbd>Ctrl K</kbd>
          </button>
          <div className="topbar-actions">
            <span className="demo-pill">
              <span />
              {snapshot.workspace?'Read-only':'Development'}
            </span>
            <button
              className="icon-btn notification-trigger"
              aria-label={`Notifications, ${unread} unread`}
              aria-expanded={notifications}
              onClick={() => {
                setNotifications((v) => !v);
                setUserMenu(false);
              }}
            >
              <Bell size={19} />
              {unread > 0 && <i />}
            </button>
            <div className="topbar-divider" />
            <button
              className="user-trigger"
              aria-label="User menu"
              aria-expanded={userMenu}
              onClick={() => {
                setUserMenu((v) => !v);
                setNotifications(false);
              }}
            >
              <Avatar name={actor.name} />
              <span>
                <strong>{actor.name}</strong>
                <small>{actor.role}</small>
              </span>
              <ChevronDown size={14} />
            </button>
          </div>
          {notifications && (
            <div className="top-popover">
              <div className="card-head">
                <h2>Notifications</h2>
                <button
                  className="text-btn"
                  disabled={busy||!unread}
                  onClick={async()=>{for(const item of snapshot.notifications.filter(n=>!n.readAt)){if(!await command({type:'notification.read',notificationId:item.id},crypto.randomUUID()))break;}}}
                >
                  Mark all read
                </button>
              </div>
              {alerts.map((c) => (
                <Link prefetch={false}
                  key={c.id}
                  href={c.caseId?`/complaints/${c.caseId}`:"/notifications"}
                  onClick={() => setNotifications(false)}
                  className="notification-row"
                >
                  <span className="soft-icon">
                    <CalendarDays size={17} />
                  </span>
                  <div>
                    <strong>{c.title}</strong>
                    <p>{date(c.at)}</p>
                  </div>
                  {!c.readAt && (
                    <span className="nav-dot" />
                  )}
                </Link>
              ))}
              {!alerts.length && <Empty title="You’re all caught up" />}
            </div>
          )}
          {userMenu && (
            <div className="top-popover user-popover">
              <strong>{actor.name}</strong>
              <p>
                {actor.role} · {actor.bureau}
              </p>
              <Badge tone="green">Verified account</Badge><button className="menu-link" onClick={()=>void signOut()}>Sign out</button>
              {sessionError&&<p role="alert">{sessionError}</p>}
              <Link prefetch={false}
                className="menu-link"
                href="/settings"
                onClick={() => setUserMenu(false)}
              >
                <Settings2 size={16} />
                Profile & preferences
              </Link>
              <Link prefetch={false}
                className="menu-link"
                href="/help"
                onClick={() => setUserMenu(false)}
              >
                <BookOpen size={16} />
                Workspace guide
              </Link>
            </div>
          )}
        </header>
        <div className="workspace-meta">
          <span>
            Workspace <span className="breadcrumb-slash">/</span>{" "}
            <strong>{title}</strong>
          </span>
          <span className="role-switch">{actor.role}</span>

        </div>
        <main id="main" className="main-workspace">
          {children}
        </main>
        <footer className="app-footer">
          <span>SYNAPSE · SIH 2026 prototype</span>
          <span>
            <Activity size={12} />
            Persistent PostgreSQL · Hosted release disabled
          </span>
        </footer>
      </div>
      {search && (
        <Modal
          title="Search your workspace"
          onClose={() => setSearch(false)}
          wide
        >
          <div className="command-input">
            <Search size={20} />
            <input
              aria-label="Global search"
              autoFocus
              placeholder="Search cases, institutions, or navigation…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <kbd>Esc</kbd>
          </div>
          <div className="command-results">
            <div className="eyebrow">CASES YOU CAN ACCESS</div>
            {results.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(`/complaints/${c.id}`)}
              >
                <FolderKanban size={18} />
                <span>
                  <strong>{c.subject}</strong>
                  <small>
                    #{c.caseNumber} · {snapshot.institutions.find(i=>i.id===c.institutionId)?.name??c.institutionId}
                  </small>
                </span>
                <ArrowUpRight size={16} />
              </button>
            ))}
            {!results.length && (
              <Empty
                title="No matching cases"
                description="Only cases authorized for your current perspective appear here."
              />
            )}
            <div className="eyebrow">GO TO WORKSPACE</div>
            {navigation
              .flatMap((g) => g.items)
              .filter(
                ([route, label]) =>
                  label.toLowerCase().includes(query.toLowerCase()) &&
                  (route !== "admin" ||
                    isAdmin),
              )
              .slice(0, 5)
              .map(([route, label, Icon]) => (
                <button key={route} onClick={() => navigate(`/${route}`)}>
                  <Icon size={18} />
                  <span>{label}</span>
                  <Command size={14} />
                </button>
              ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
