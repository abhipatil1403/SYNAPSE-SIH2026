"use client";
import { useEffect, useRef, useId, type ReactNode } from "react";
import { ArrowUpRight, Check, CircleAlert, Search, X } from "./symbols";
import Link from "next/link";
const humanize=(value:string)=>value.replaceAll("_"," ").toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());

import { APP_TIME_ZONE, calendarDayKey } from "@/lib/calendar";
export function Button({
  children,
  onClick,
  kind = "",
  disabled,
  title,
  type = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: string;
  disabled?: boolean;
  title?: string;
  type?: "button" | "submit" | "reset";
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`btn ${kind} ${className}`}
    >
      {children}
    </button>
  );
}
export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {title && (
        <div className="card-head">
          <h2>{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: string;
}) {
  const value = typeof children === "string" ? children : "";
  const inferred =
    value.includes("DISPOSED") ||
    ["Done", "PASS", "Confirmed", "Registered", "Approved"].includes(value)
      ? "green"
      : ["High", "BLOCKED", "Overdue", "Rejected"].includes(value)
        ? "red"
        : [
              "RESOLUTION_REVIEW",
              "In Review",
              "Medium",
              "Pending review",
              "Requested",
            ].includes(value)
          ? "amber"
          : "neutral";
  return (
    <span className={`badge ${tone ?? inferred}`}>
      {value &&
      (value.includes("_") ||
        (/^[A-Z]{3,}$/.test(value) && !["PASS", "BLOCKED"].includes(value)))
        ? humanize(value)
        : children}
    </span>
  );
}
export function Avatar({
  id,
  name,
  small = false,
}: {
  id?: string;
  name?: string;
  small?: boolean;
}) {
  const label = name ?? (id ? "Assigned officer" : "Unassigned");
  return (
    <span
      title={label}
      className={`avatar ${"sage"} ${small ? "small" : ""}`}
    >
      {label
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")}
    </span>
  );
}
export function Empty({
  title = "Nothing here just yet",
  description = "Try another filter or come back after your next update.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="empty">
      <Search size={28} />
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
export function Forbidden({
  description = "Your current demo role does not have access to this workspace.",
}: {
  description?: string;
}) {
  return (
    <Card>
      <div className="empty">
        <CircleAlert size={32} />
        <h1>Access restricted</h1>
        <p>{description}</p>
        <p>
          Use the labeled demo role selector to explore an authorized
          perspective.
        </p>
        <Link className="btn" href="/dashboard">
          Back to overview
        </Link>
      </div>
    </Card>
  );
}
export function Tabs({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <div className="filter-tabs" role="group" aria-label="Filter">
      {options.map((o) => (
        <button
          key={o}
          className={value === o ? "active" : ""}
          aria-pressed={value === o}
          onClick={() => onChange(o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),titleId=useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if(previous?.isConnected)previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "wide" : ""}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if(e.target===ref.current){const box=e.currentTarget.getBoundingClientRect();if(e.clientX<box.left||e.clientX>box.right||e.clientY<box.top||e.clientY>box.bottom)onClose();}
      }}
    >
      <div className="dialog-head">
        <h2 id={titleId}>{title}</h2>
        <button
          className="icon-btn"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function PageHeader({
  title,
  subtitle,
  children,
  eyebrow,
}: {
  title: string;
  subtitle: string;
  children?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <header className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </header>
  );
}
export function Metric({
  title,
  value,
  caption,
  href,
  featured = false,
}: {
  title: string;
  value: string | number;
  caption: string;
  href?: string;
  featured?: boolean;
}) {
  const body = (
    <>
      <div className="metric-title">
        {title}
        <span className="metric-arrow">
          <ArrowUpRight size={18} />
        </span>
      </div>
      <strong>{value}</strong>
      <p>
        <span className="metric-dot" />
        {caption}
      </p>
    </>
  );
  return href ? (
    <Link href={href} className={`card metric ${featured ? "featured" : ""}`}>
      {body}
    </Link>
  ) : (
    <section className={`card metric ${featured ? "featured" : ""}`}>
      {body}
    </section>
  );
}
export function CheckItem({
  pass,
  title,
  detail,
}: {
  pass: boolean;
  title: string;
  detail: string;
}) {
  return (
    <div className="check-item">
      <span className={pass ? "check-icon pass" : "check-icon"}>
        {pass ? <Check size={15} /> : <CircleAlert size={15} />}
      </span>
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
      <Badge>{pass ? "PASS" : "BLOCKED"}</Badge>
    </div>
  );
}
export const date = (
  iso: string,
  opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" },
) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: APP_TIME_ZONE,
    ...opts,
  }).format(new Date(iso));
export const dayKey = calendarDayKey;
export function downloadText(name: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
export function csv(rows: (string | number)[][]) {
  return rows
    .map((row) =>
      row
        .map((value) => {
          let s = String(value);
          if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
          return `"${s.replaceAll('"', '""')}"`;
        })
        .join(","),
    )
    .join("\r\n");
}
