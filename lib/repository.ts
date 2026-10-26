"use client";
import {
  deserialize,
  execute,
  freshState,
  serialize,
  STORAGE_KEY,
  safeActor,
  visibleCases,
  visibleTasks,
  visibleFindings,
  type Command,
} from "./domain";
import type { Actor, DemoState, Role } from "./types";

export interface CaseRepository {
  listCases(actor: Actor): DemoState["cases"];
}
export interface TaskRepository {
  listTasks(actor: Actor): DemoState["tasks"];
}
export interface FindingRepository {
  listFindings(actor: Actor): DemoState["findings"];
}
type Snapshot = {
  state: DemoState | null;
  role: Role;
  persistenceError: string;
};
const serverSnapshot: Snapshot = {
  state: null,
  role: "Supervisor",
  persistenceError: "",
};
class DemoRepository
  implements CaseRepository, TaskRepository, FindingRepository
{
  private snapshot: Snapshot = serverSnapshot;
  private listeners = new Set<() => void>();
  private hydrated = false;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => serverSnapshot;
  listCases(actor: Actor) {
    return this.snapshot.state ? visibleCases(this.snapshot.state, actor) : [];
  }
  listTasks(actor: Actor) {
    return this.snapshot.state ? visibleTasks(this.snapshot.state, actor) : [];
  }
  listFindings(actor: Actor) {
    return this.snapshot.state
      ? visibleFindings(this.snapshot.state, actor)
      : [];
  }
  private notify() {
    this.listeners.forEach((f) => f());
  }
  hydrate() {
    if (this.hydrated) return;
    this.hydrated = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = deserialize(raw);
      this.snapshot = {
        state: parsed ?? freshState(),
        role: safeActor(localStorage.getItem("synapse.demo.role") ?? "").role,
        persistenceError:
          raw && !parsed
            ? "Stored demo data was invalid. A fresh fictional dataset was loaded."
            : "",
      };
    } catch {
      this.snapshot = {
        state: freshState(),
        role: "Supervisor",
        persistenceError:
          "Browser storage is unavailable. Changes will last for this session only.",
      };
    }
    window.addEventListener("storage", (e) => {
      if (e.key === STORAGE_KEY) {
        const incoming = deserialize(e.newValue);
        if (incoming) {
          this.snapshot = { ...this.snapshot, state: incoming };
          this.notify();
        }
      }
    });
    this.notify();
  }
  dispatch(command: Command) {
    if (!this.snapshot.state) throw new Error("The demo is still loading.");
    try {
      const latest = deserialize(localStorage.getItem(STORAGE_KEY));
      if (latest && latest.revision !== this.snapshot.state.revision) {
        this.snapshot = { ...this.snapshot, state: latest };
        this.notify();
        throw new Error(
          "Another tab changed the workspace. Review the refreshed data and retry.",
        );
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Another tab")) throw e;
    }
    const next = execute(
      this.snapshot.state!,
      safeActor(this.snapshot.role),
      command,
    );
    let persistenceError = this.snapshot.persistenceError;
    try {
      localStorage.setItem(STORAGE_KEY, serialize(next));
    } catch {
      persistenceError =
        "Browser storage is full or unavailable. Changes will last for this session only.";
    }
    this.snapshot = { ...this.snapshot, state: next, persistenceError };
    this.notify();
  }
  setRole(role: Role) {
    this.snapshot = { ...this.snapshot, role };
    try {
      localStorage.setItem("synapse.demo.role", role);
    } catch {}
    this.notify();
  }
  reset() {
    this.snapshot = {
      state: freshState(),
      role: "Supervisor",
      persistenceError: "",
    };
    try {
      localStorage.setItem(STORAGE_KEY, serialize(this.snapshot.state!));
      localStorage.setItem("synapse.demo.role", "Supervisor");
    } catch {
      this.snapshot.persistenceError = "Storage unavailable.";
    }
    this.notify();
  }
}
export const demoRepository = new DemoRepository();
