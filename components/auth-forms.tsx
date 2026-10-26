"use client";
import Link from "next/link";
import { useState } from "react";
import { ShieldCheck, Network, ArrowRight } from "lucide-react";
type AuthKind = "login" | "signup" | "forgot-password" | "reset-password";
const labels: Record<AuthKind, [string, string, string]> = {
  login: ["Welcome back", "Sign in with your verified officer account.", "Sign in"],
  signup: ["Officer registration", "Email verification and administrator approval protect every Bureau.", "Request account"],
  "forgot-password": ["Reset your password", "We’ll ask Supabase to send a secure link to your registered inbox.", "Request reset link"],
  "reset-password": ["Choose a new password", "Use at least 12 characters. The recovery session expires after 15 minutes.", "Update password"],
};
export function AuthForm({ kind, callbackError = false, callbackNotice }: { kind: AuthKind; callbackError?: boolean; callbackNotice?: string }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(callbackNotice ?? (callbackError ? "The verification or recovery link could not be accepted. Request a fresh link and try again." : "")), [error, setError] = useState(callbackError);
  const [title, description, submit] = labels[kind];
  return <main className="auth-surface"><div className="auth-brand"><Network size={30} /><strong>SYNAPSE<span>Coordinated resolution</span></strong></div><section className="auth-card">
    <div className="auth-emblem"><ShieldCheck size={27} /></div><p className="eyebrow">Secure officer access</p><h1>{title}</h1><p>{description}</p>
    <form className="form-stack" onSubmit={async (event) => {
      event.preventDefault(); const form = event.currentTarget, fields = new FormData(form);
      if (fields.has("confirm") && fields.get("password") !== fields.get("confirm")) { setError(true); setMessage("The passwords do not match."); return; }
      setBusy(true); setMessage("");
      try {
        const payload = Object.fromEntries([...fields.entries()].filter(([name]) => name !== "confirm"));
        const response = await fetch(`/api/auth/${kind}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), cache: "no-store" });
        const body = await response.json(); setError(!response.ok);
        if (!response.ok) setMessage(body.error?.message ?? "The secure service is unavailable. Try again.");
        else if (body.destination) window.location.assign(body.destination);
        else { setMessage(body.message ?? "Request accepted."); form.reset(); }
      } catch { setError(true); setMessage("Unable to reach the secure service. Try again."); }
      finally { setBusy(false); }
    }}>
      {kind === "signup" && <label>Full name<input name="name" autoComplete="name" required minLength={2} maxLength={150} /></label>}
      {kind !== "reset-password" && <label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>}
      {kind !== "forgot-password" && <label>Password<input name="password" type="password" autoComplete={kind === "login" ? "current-password" : "new-password"} required minLength={kind === "login" ? 1 : 12} maxLength={128} /></label>}
      {["signup", "reset-password"].includes(kind) && <label>Confirm password<input name="confirm" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /></label>}
      {message && <p className={error ? "auth-feedback error" : "auth-feedback"} role={error ? "alert" : "status"}>{message}</p>}
      <button className="btn primary" disabled={busy}>{busy ? "Contacting secure service…" : submit}<ArrowRight size={17} /></button>
    </form><nav className="auth-links" aria-label="Account assistance">{kind === "login" ? <><Link href="/forgot-password">Forgot password?</Link><Link href="/signup">Request officer account</Link></> : <Link href="/login">Back to sign in</Link>}</nav>
    <p className="auth-note">An email account does not grant complaint access. Bureau roles require independent approval.</p></section><Link className="auth-demo" href="/dashboard">Open labelled Demo Mode</Link></main>;
}
