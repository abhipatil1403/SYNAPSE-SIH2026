// ISOLATED TEST ADAPTER ONLY. This is never imported by app/lib runtime code.
// Mirrors core writes into the actual baseline tables; supplementary workflow
// state/receipts live only in a disposable test schema, not a proposed hosted table.
import type { Client } from "pg";
import type { State } from "../../lib/platform/contracts";
import type { TransactionStore } from "../../lib/platform/engine";
import { mapDatabaseCase } from "../../lib/platform/repository";

export class IsolatedPostgresStore implements TransactionStore {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private db: Client) {}
  async initialize(state: State) {
    const name = (await this.db.query("SELECT current_database() name")).rows[0].name;
    if (!/^synapse_test_[a-f0-9]{32}$/.test(name)) throw Error("This adapter accepts only the harness-created disposable database.");
    await this.db.query("CREATE SCHEMA platform_test; CREATE TABLE platform_test.state(singleton boolean PRIMARY KEY CHECK(singleton), body jsonb NOT NULL)");
    await this.db.query("INSERT INTO platform_test.state VALUES(true,$1)", [JSON.stringify(state)]);
  }
  async transaction<T>(work: (s: State) => Promise<T>): Promise<T> {
    const pending = this.tail.then(async () => {
      await this.db.query("BEGIN");
      try {
        // Durable row lock serializes transactions, including another store/client.
        const before = (await this.db.query("SELECT body FROM platform_test.state WHERE singleton FOR UPDATE")).rows[0].body as State;
        const dbCases = (await this.db.query("SELECT * FROM synapse.cases ORDER BY case_id FOR UPDATE")).rows.map(mapDatabaseCase);
        if (dbCases.length) before.cases = dbCases;
        const state = structuredClone(before);
        const result = await work(state);
        if (JSON.stringify(state) !== JSON.stringify(before)) {
          const actorId = state.activity.at(-1)?.actorId;
          if (actorId) await this.db.query("SELECT set_config('synapse.user_id',$1,true)", [actorId]);
          for (const row of state.drafts) {
            const old = before.drafts.find((r) => r.id === row.id);
            if (JSON.stringify(old) === JSON.stringify(row)) continue;
            if (old) {
              await this.db.query("UPDATE synapse.case_submissions SET institution_id=$2,submission_status=$3,reviewed_by_user_id=$4,reviewed_at=$5,review_reason=$6 WHERE submission_id=$1", [row.id,row.institutionId,row.state,row.reviewerId,["ACCEPTED","REJECTED","LINKED_TO_EXISTING"].includes(row.state)?state.generatedAt:null,"Isolated reviewed test operation"]);
              continue;
            }
            await this.db.query(`INSERT INTO synapse.case_submissions(submission_id,source_type,source_reference,institution_id,submitted_by_user_id,original_language_code,original_subject,original_body,submission_status,received_at,reviewed_by_user_id,reviewed_at,review_reason)
              VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
              ON CONFLICT(submission_id) DO UPDATE SET institution_id=excluded.institution_id,submission_status=excluded.submission_status,reviewed_by_user_id=excluded.reviewed_by_user_id,reviewed_at=excluded.reviewed_at,review_reason=excluded.review_reason`,
              [row.id,row.source,row.sourceReference,row.institutionId,row.creatorId,row.language,row.subject,row.body,row.state,row.receivedAt,
                row.reviewerId,["ACCEPTED","REJECTED","LINKED_TO_EXISTING"].includes(row.state)?state.generatedAt:null,"Isolated reviewed test operation"]);
          }
          for (const c of state.cases) {
            const old = before.cases.find((r) => r.id === c.id);
            if (!old) {
              await this.db.query(`INSERT INTO synapse.cases(case_id,case_number,institution_id,category_id,lead_bureau_id,accountable_officer_id,title,summary,current_status_code,priority_code,received_at,created_by_user_id)
                OVERRIDING SYSTEM VALUE VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
                [c.id,c.caseNumber,c.institutionId,c.categoryId,c.bureauId,c.officerId,c.subject,c.summary,c.status,c.priority,c.receivedAt,actorId]);
            } else if (JSON.stringify(c) !== JSON.stringify(old)) {
              const workflow = c.status === "DISPOSED" ? "DISPOSE" : c.officerId !== old.officerId || c.bureauId !== old.bureauId ? "TRANSFER" : "STATUS_TRANSITION";
              await this.db.query("SELECT set_config('synapse.workflow_action',$1,true)", [workflow]);
              const update = await this.db.query(`UPDATE synapse.cases SET lead_bureau_id=$2,accountable_officer_id=$3,title=$4,summary=$5,current_status_code=$6,priority_code=$7,disposed_at=$8 WHERE case_id=$1 AND row_version=$9 RETURNING row_version::text,updated_at`,
                [c.id,c.bureauId,c.officerId,c.subject,c.summary,c.status,c.priority,c.disposedAt,old.version]);
              if (update.rowCount !== 1) throw Error("Optimistic concurrency conflict in actual database row.");
              c.version = update.rows[0].row_version; c.updatedAt = update.rows[0].updated_at.toISOString();
            }
          }
          for (const row of state.comments.filter((r) => !before.comments.some((x) => x.id === r.id)))
            await this.db.query("INSERT INTO synapse.case_comments(case_comment_id,case_id,author_user_id,comment_body,created_at) VALUES($1,$2,$3,$4,$5)", [row.id,row.caseId,row.authorId,row.body,row.at]);
          for (const t of state.tasks) {
            if (JSON.stringify(t) === JSON.stringify(before.tasks.find((x) => x.id === t.id))) continue;
            await this.db.query(`INSERT INTO synapse.case_work_items(work_item_id,case_id,bureau_id,assigned_to_user_id,work_item_type,title,status_code,due_at,completed_at,created_by_user_id)
              VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(work_item_id) DO UPDATE SET status_code=excluded.status_code,completed_at=excluded.completed_at`,
              [t.id,t.caseId,t.bureauId,t.assigneeId,t.type,t.title,t.status,t.dueAt,t.status === "COMPLETED"?state.generatedAt:null,actorId]);
          }
          for (const d of state.drafts.filter((d) => d.linkedCaseId && !before.drafts.find((x) => x.id === d.id)?.linkedCaseId))
            await this.db.query("INSERT INTO synapse.submission_case_links(submission_id,case_id,link_type,confirmed_by_user_id,confirmed_at) VALUES($1,$2,$3,$4,$5)", [d.id,d.linkedCaseId,d.state === "ACCEPTED" ? "CREATED" : "RELATED_TO",d.reviewerId,state.generatedAt]);
          for (const a of state.activity.filter((r) => !before.activity.some((x) => x.id === r.id)))
            await this.db.query("INSERT INTO synapse.audit_events(audit_event_id,actor_user_id,event_type,entity_type,entity_id,occurred_at,reason,metadata) VALUES($1,$2,$3,'CASE',$4,$5,$6,$7)", [a.id,a.actorId,a.type,a.caseId,a.at,a.reason,JSON.stringify({ testEnvironment: "DISPOSABLE_ONLY" })]);
          for (const n of state.notifications) {
            if (JSON.stringify(n) === JSON.stringify(before.notifications.find((x) => x.id === n.id))) continue;
            await this.db.query("INSERT INTO synapse.notifications(notification_id,recipient_user_id,notification_type,subject,body,related_case_id,created_at,read_at) VALUES($1,$2,'CASE_UPDATED',$3,$3,$4,$5,$6) ON CONFLICT(notification_id) DO UPDATE SET read_at=excluded.read_at", [n.id,n.userId,n.title,n.caseId,n.at,n.readAt]);
          }
          await this.db.query("UPDATE platform_test.state SET body=$1 WHERE singleton", [JSON.stringify(state)]);
        }
        await this.db.query("COMMIT"); return result;
      } catch (error) { await this.db.query("ROLLBACK"); throw error; }
    });
    this.tail = pending.catch(() => {}); return pending;
  }
}
