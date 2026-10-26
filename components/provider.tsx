"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { ZodError } from "zod";
import { demoRepository } from "@/lib/repository";
import { actorFor } from "@/lib/seed";
import {
  actorWithGrants,
  visibleAudit,
  visibleCases,
  visibleFindings,
  visibleTasks,
  type Command,
} from "@/lib/domain";
import type { Actor, Case, DemoState, Finding, Role, Task } from "@/lib/types";
interface Context {
  state: DemoState;
  actor: Actor;
  cases: Case[];
  tasks: Task[];
  findings: Finding[];
  audit: DemoState["audit"];
  run: (c: Command, success?: string) => boolean;
  notify: (text: string, error?: boolean) => void;
  setRole: (r: Role) => void;
  reset: () => void;
}
const DemoContext = createContext<Context | null>(null);
export function useDemo() {
  const context = useContext(DemoContext);
  if (!context) throw new Error("Demo provider missing");
  return context;
}
export function DemoProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(
    demoRepository.subscribe,
    demoRepository.getSnapshot,
    demoRepository.getServerSnapshot,
  );
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(
    null,
  );
  useEffect(() => {
    demoRepository.hydrate();
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5500);
    return () => clearTimeout(t);
  }, [toast]);
  if (!snapshot.state)
    return (
      <div className="boot" role="status">
        <div className="brand-mark">S</div>
        <h1>SYNAPSE</h1>
        <p>Preparing your workspace…</p>
        <div className="skeleton" />
      </div>
    );
  const state = snapshot.state;
  const actor = actorWithGrants(actorFor(snapshot.role), state);
  const notify = (text: string, error = false) => setToast({ text, error });
  const run = (command: Command, success = "Workspace updated") => {
    try {
      demoRepository.dispatch(command);
      notify(success);
      return true;
    } catch (e) {
      notify(
        e instanceof ZodError
          ? (e.issues[0]?.message ?? "Check your input.")
          : e instanceof Error
            ? e.message
            : "The action could not be completed.",
        true,
      );
      return false;
    }
  };
  return (
    <DemoContext.Provider
      value={{
        state,
        actor,
        cases: visibleCases(state, actor),
        tasks: visibleTasks(state, actor),
        findings: visibleFindings(state, actor),
        audit: visibleAudit(state, actor),
        run,
        notify,
        setRole: (r) => demoRepository.setRole(r),
        reset: () => {
          demoRepository.reset();
          notify("Demo data reset");
        },
      }}
    >
      <div
        data-compact={state.settings.compact}
        data-reduced-motion={state.settings.reducedMotion}
      >
        {snapshot.persistenceError && (
          <div className="storage-warning" role="alert">
            {snapshot.persistenceError}
          </div>
        )}
        {children}
      </div>
      {toast && (
        <div
          className={`toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.text}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            ×
          </button>
        </div>
      )}
    </DemoContext.Provider>
  );
}
