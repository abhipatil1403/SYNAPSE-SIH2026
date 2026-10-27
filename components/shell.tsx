"use client";
import {Spinner,Feedback} from "./feedback";
import {
  useEffect,
  useRef,
  useTransition,
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
  type UiSymbol,
} from "./symbols";

import { useOperational } from "./operational-provider";
import { Avatar, Badge, Empty, Modal, date } from "./ui";

import {useDismissLayer} from "./use-dismiss-layer";

export const navigation: {
  group: string;
  items: [string, string, UiSymbol][];
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
  const {snapshot,status,message,command,load,busy,refreshing,source}=useOperational();
  const pathname = usePathname();
  const workspacePath=pathname.replace(/^\/platform(?=\/|$)/,'').replace(/^\/cases(?=\/|$)/,'/complaints')||'/dashboard';
  const router = useRouter();
  const [navigating,startNavigation]=useTransition();
  const notificationPanel=useRef<HTMLDivElement|null>(null),notificationTrigger=useRef<HTMLButtonElement|null>(null),profilePanel=useRef<HTMLDivElement|null>(null),profileTrigger=useRef<HTMLButtonElement|null>(null);
  const [signingOut,setSigningOut]=useState(false),signOutLock=useRef(false);
  const [search, setSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [sessionError,setSessionError]=useState('');
  useDismissLayer(notifications,notificationPanel,notificationTrigger,()=>setNotifications(false));
  useDismissLayer(userMenu,profilePanel,profileTrigger,()=>setUserMenu(false));
  useEffect(()=>{queueMicrotask(()=>{setUserMenu(false);setNotifications(false);setDrawer(false);});},[pathname]);
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
      .find((i) => workspacePath.startsWith(`/${i[0]}`))?.[1] ?? "Workspace";
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
  const signOut=async()=>{if(signOutLock.current)return;signOutLock.current=true;setSigningOut(true);setSessionError('');let leaving=false;try{const r=await fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!r.ok){setSessionError('Sign-out could not be confirmed. Retry while connected.');return;}const c=new BroadcastChannel('synapse-auth-session');c.postMessage('signed-out');c.close();leaving=true;window.location.replace('/login');}catch{setSessionError('Sign-out could not be confirmed. Check your connection and retry.');}finally{if(!leaving){signOutLock.current=false;setSigningOut(false);}}};
  if(!snapshot?.me)return <main className="boot"><div className="brand-mark"><Network/></div><h1>SYNAPSE</h1><p role="status">{status==='error'?'Your workspace could not be loaded.':'Loading your authorized workspace…'}</p>{status==='error'&&<><Feedback message={message} tone="error"/><button className="btn" disabled={refreshing} onClick={()=>void load()}>{refreshing&&<Spinner/>}{refreshing?"Connecting…":"Retry connection"}</button><Link prefetch={false} href="/login">Sign in</Link><button className="btn" disabled={signingOut} onClick={()=>void signOut()}>{signingOut?"Signing out…":"Sign out"}</button><Feedback message={sessionError}/></>}</main>;
  const {cases,tasks,findings}=snapshot,me=snapshot.me;
  const actor={name:me.name,role:me.roles.map(code=>liveRoleLabels[code as keyof typeof liveRoleLabels]??code).join(' · '),bureau:me.bureauIds.map(id=>snapshot.bureaus.find(b=>b.id===id)?.name??id).join(', ')};
  const isAdmin=me.roles.includes('SYSTEM_ADMIN');
  const pending=tasks.filter(t=>!['COMPLETED','CANCELLED'].includes(t.status)).length;
  const alerts=[...snapshot.notifications].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,8),unread=snapshot.notifications.filter(n=>!n.readAt).length;
  const results=cases.filter(c=>(c.subject+' '+c.caseNumber+' '+(snapshot.institutions.find(i=>i.id===c.institutionId)?.name??'')).toLowerCase().includes(query.toLowerCase())).slice(0,6);
  function navigate(href: string) {
    if(navigating)return;startNavigation(()=>router.push(href));
    setUserMenu(false);setNotifications(false);
    setSearch(false);
    setDrawer(false);
  }
  return (
    <div
      className={`app-shell ${workspacePath === "/dashboard" ? "overview-shell" : ""}`}
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
                    aria-disabled={navigating||undefined}
                    onNavigate={event=>{event.preventDefault();navigate(`/${route}`);}}
                    onClick={() => setDrawer(false)}
                    className={`nav-link ${workspacePath.startsWith(`/${route}`) ? "active" : ""}`}
                    aria-current={
                      workspacePath.startsWith(`/${route}`) ? "page" : undefined
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
            {snapshot.workspace?'Secure officer workspace':'Development workspace'}
          </div>
        </div>
      </aside>
      <div className="app-body">
        {(navigating||busy)&&<div className="navigation-progress" role="status" aria-label={navigating?"Opening page":"Saving changes"}><span/></div>}
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
            <span>Search pages and authorized cases…</span>
            <kbd>Ctrl K</kbd>
          </button>
          <div className="topbar-actions">
            <span className="demo-pill">
              <span />
              {snapshot.workspace?(snapshot.workspace.mode==='ACCOUNT_ONLY'?'Account preview':'Read-only'):source.includes('canonical')?'Connected':'Development'}
            </span>
            <button
              className="icon-btn notification-trigger"
              ref={notificationTrigger}
              aria-controls="notification-panel"
              aria-label={snapshot.workspace?"Notifications, not connected":`Notifications, ${unread} unread`}
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
              ref={profileTrigger}
              aria-controls="profile-panel"
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
            <div className="top-popover" ref={notificationPanel} id="notification-panel" role="region" aria-label="Notifications">
              <div className="card-head">
                <h2>Notifications</h2>
                <button
                  className="text-btn"
                  disabled={busy||!unread||!!snapshot.workspace}
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
              {!alerts.length && <Empty title={snapshot.workspace?"Notifications are not connected":"You’re all caught up"} description={snapshot.workspace?"Your case notifications will appear once this workflow is enabled.":"New updates will appear here."}/>}
            </div>
          )}
          {userMenu && (
            <div className="top-popover user-popover" ref={profilePanel} id="profile-panel" role="region" aria-label="Account menu">
              <strong>{actor.name}</strong>
              <p>
                {actor.role} · {actor.bureau}
              </p>
              <Badge tone="green">Verified account</Badge><button className="menu-link" disabled={signingOut} onClick={()=>void signOut()}>{signingOut&&<Spinner/>}{signingOut?"Signing out…":"Sign out"}</button>
              <Feedback message={sessionError}/>
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
        <main id="main" className="main-workspace" aria-busy={navigating}><div key={pathname} className="route-enter">
          {children}
        </div></main>
        <footer className="app-footer">
          <span>SYNAPSE · SIH 2026 prototype</span>
          <span>
            <Activity size={12} />
            {snapshot.workspace?(snapshot.workspace.mode==='ACCOUNT_ONLY'?'Account workspace · Complaint preview pending':'Authorized case preview · Read only'):source.includes('canonical')?'Connected workspace · Authorized Supabase records':'Isolated development workspace'}
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
                title={snapshot.workspace?.mode==='ACCOUNT_ONLY'?"Case search awaits complaint preview":"No matching cases"}
                description={snapshot.workspace?.mode==='ACCOUNT_ONLY'?"You can search and open workspace pages below. See the workspace guide for complaint access.":"Only cases authorized for your current perspective appear here."}
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
