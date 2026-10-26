"use client";
import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { bureaus, officers } from "@/lib/seed";
import { canApprove, canEdit } from "@/lib/domain";
import { linkTypes, type Case } from "@/lib/types";
import { useDemo } from "./provider";
import { Button, Modal } from "./ui";

export function CreateCaseButton() {
  const { actor, run } = useDemo();
  const [open, setOpen] = useState(false);
  const allowed = ["Supervisor", "Bureau Head", "Intake Officer"].includes(
    actor.role,
  );
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (
      run(
        {
          type: "create-case",
          subject: String(f.get("subject")),
          institution: String(f.get("institution")),
          bureau: String(f.get("bureau")),
          priority: f.get("priority") as Case["priority"],
          category: String(f.get("category")),
        },
        "Complaint registered in the demo workspace",
      )
    )
      setOpen(false);
  }
  return (
    <>
      <Button
        kind="primary"
        disabled={!allowed}
        title={
          !allowed
            ? "Registration requires an Intake Officer, Bureau Head or Supervisor."
            : undefined
        }
        onClick={() => setOpen(true)}
      >
        <Plus size={17} />
        Register Complaint
      </Button>
      {open && (
        <Modal title="Register a complaint" onClose={() => setOpen(false)}>
          <p className="dialog-description">
            Create a fictional case with a human-confirmed lead Bureau. Example
            SLA: 14 calendar days.
          </p>
          <form onSubmit={submit} className="form-stack">
            <label>
              Subject
              <input
                name="subject"
                required
                minLength={3}
                maxLength={180}
                placeholder="A clear description of the complaint"
              />
            </label>
            <label>
              Institution
              <input
                name="institution"
                required
                minLength={3}
                placeholder="Fictional institution name"
              />
            </label>
            <div className="form-grid">
              <label>
                Lead Bureau
                <select name="bureau" defaultValue="Approval">
                  {bureaus
                    .filter(
                      (b) => actor.role !== "Bureau Head" || b === actor.bureau,
                    )
                    .map((b) => (
                      <option key={b}>{b}</option>
                    ))}
                </select>
              </label>
              <label>
                Priority
                <select name="priority">
                  <option>Medium</option>
                  <option>High</option>
                  <option>Low</option>
                </select>
              </label>
            </div>
            <label>
              Category
              <select name="category">
                <option>Approval compliance</option>
                <option>Student welfare</option>
                <option>Faculty welfare</option>
                <option>Infrastructure</option>
                <option>Academic standards</option>
              </select>
            </label>
            <div className="dialog-actions">
              <Button onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" kind="primary">
                Register complaint
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
export function NewTaskButton({ caseId }: { caseId?: string }) {
  const { cases, actor, run } = useDemo();
  const [open, setOpen] = useState(false);
  const editable = cases.filter(
    (c) => canEdit(actor, c) && c.status !== "DISPOSED",
  );
  const [selected, setSelected] = useState(caseId ?? editable[0]?.id ?? "");
  const c = cases.find((c) => c.id === selected);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (
      run(
        {
          type: "create-task",
          caseId: selected,
          title: String(f.get("title")),
          assignee: String(f.get("assignee")),
        },
        "Work item created",
      )
    )
      setOpen(false);
  }
  return (
    <>
      <Button
        kind="primary"
        disabled={!editable.length}
        title={
          !editable.length
            ? "No editable active cases for this role."
            : undefined
        }
        onClick={() => setOpen(true)}
      >
        <Plus size={17} />
        New Work Item
      </Button>
      {open && (
        <Modal title="New work item" onClose={() => setOpen(false)}>
          <form onSubmit={submit} className="form-stack">
            <label>
              Case
              <select
                aria-label="Work item case"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                {editable.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} · {c.subject}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Work item title
              <input
                name="title"
                minLength={3}
                required
                placeholder="What needs to be done?"
              />
            </label>
            <label>
              Assigned officer
              <select name="assignee">
                {officers
                  .filter(
                    (o) =>
                      c &&
                      (canApprove(actor, c)
                        ? o.bureau === c.bureau
                        : o.id === c.officer),
                  )
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
              </select>
            </label>
            <div className="dialog-actions">
              <Button onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" kind="primary">
                Create work item
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
export function LinkCaseButton() {
  const { cases, actor, run } = useDemo();
  const [open, setOpen] = useState(false);
  const editable = cases.filter((c) => canEdit(actor, c));
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (
      run(
        {
          type: "link",
          source: String(f.get("source")),
          target: String(f.get("target")),
          linkType: f.get("linkType") as (typeof linkTypes)[number],
          reason: String(f.get("reason")),
        },
        "Relationship confirmed; cases remain separate",
      )
    )
      setOpen(false);
  }
  return (
    <>
      <Button
        kind="primary"
        disabled={editable.length < 2}
        onClick={() => setOpen(true)}
      >
        <Plus size={17} />
        Confirm Relationship
      </Button>
      {open && (
        <Modal
          title="Confirm a case relationship"
          onClose={() => setOpen(false)}
        >
          <form onSubmit={submit} className="form-stack">
            <p className="muted">
              A relationship preserves both cases. Directed dependencies cannot
              form a cycle.
            </p>
            <label>
              Source case
              <select name="source">
                {editable.map((c) => (
                  <option key={c.id}>{c.id}</option>
                ))}
              </select>
            </label>
            <label>
              Relationship
              <select name="linkType">
                {linkTypes.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label>
              Target case
              <select name="target" defaultValue={editable[1]?.id}>
                {editable.map((c) => (
                  <option key={c.id}>{c.id}</option>
                ))}
              </select>
            </label>
            <label>
              Evidence and rationale
              <textarea name="reason" required minLength={3} />
            </label>
            <div className="dialog-actions">
              <Button onClick={() => setOpen(false)}>Cancel</Button>
              <Button kind="primary" type="submit">
                Confirm relationship
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
