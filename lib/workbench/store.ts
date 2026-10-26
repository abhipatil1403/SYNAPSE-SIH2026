import { Pool, type PoolClient } from "pg";
import type { State, Principal, Staff } from "../platform/contracts";
import type { TransactionStore } from "../platform/engine";
import type { OfficerAccount } from "../auth/policy";
import { snapshotSchema, staffSchema, scopeSchema } from "../platform/contracts";
import { z } from "zod";
import {randomUUID} from 'node:crypto';
import {inspectAttachment} from './attachments';
export const collections = ["staff","bureaus","institutions","categories","cases","drafts","tasks","evidence","matches","relationships","findings","policies","comments","activity","sla","events","notifications","accessRequests","transfers","actions","conflicts","translations"] as const;
type Collection = typeof collections[number];
export class WorkbenchStore implements TransactionStore {
  constructor(public pool: Pool, public environmentId: string, private identity?: { principal: Principal; account: OfficerAccount; profile?:Staff }) {}
  async connection() {
    const c = await this.pool.connect();
    try {
      const fact = (await c.query("SELECT current_database() db,r.rolsuper,r.rolbypassrls,pg_has_role(current_user,'synapse_workbench_owner','MEMBER') owner_access FROM pg_roles r WHERE rolname=current_user")).rows[0];
      if (!/^synapse_workbench_[a-f0-9]{12}$/.test(fact.db) || fact.rolsuper || fact.rolbypassrls || fact.owner_access) throw Error("ISOLATED_RUNTIME_ROLE_UNSAFE");
      await c.query("BEGIN; SET LOCAL ROLE synapse_workbench_runtime");
      await c.query("SELECT set_config('synapse.workbench_id',$1,true)", [this.environmentId]); return c;
    } catch (error) { await c.query("ROLLBACK").catch(() => {}); c.release(); throw error; }
  }
  async locked<T>(work: (c: PoolClient) => Promise<T>) {
    const c = await this.connection();
    try { const exists = await c.query("SELECT environment_id FROM workbench.meta WHERE environment_id=$1 AND mode='ISOLATED_DEVELOPMENT' FOR UPDATE", [this.environmentId]); if (exists.rowCount !== 1) throw Error("ISOLATED_DATABASE_NOT_PINNED");
      const result = await work(c); await c.query("COMMIT"); return result;
    } catch (error) { await c.query("ROLLBACK"); throw error; } finally { c.release(); }
  }
  async load(c: PoolClient): Promise<State> {
    if(this.identity){const {principal,account,profile}=this.identity;
      if(account.status!=='APPROVED'||!profile||profile.id!==principal.userId||profile.authId!==principal.authId||!profile.active)throw Error('CURRENT_TRUSTED_PROFILE_REQUIRED');
      // Exact scoped tuples come from the private gateway after online Auth.
      // Recreated/approved users never inherit a Demo or email-selected identity.
      await c.query('INSERT INTO workbench.staff(id,environment_id,body) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET body=excluded.body WHERE workbench.staff.environment_id=excluded.environment_id',[profile.id,this.environmentId,profile]);
    }
    const meta = (await c.query("SELECT revision::text,next_case_number::text FROM workbench.meta WHERE environment_id=$1", [this.environmentId])).rows[0];
    const entries: Record<string, unknown> = {};
    for (const table of collections) entries[table] = (await c.query(`SELECT body FROM workbench."${table}" WHERE environment_id=$1 ORDER BY id`, [this.environmentId])).rows.map((r) => r.body);
    const grants = (await c.query("SELECT case_id,user_id,scope,valid_until,revoked FROM workbench.grants WHERE environment_id=$1", [this.environmentId])).rows.map((r) => ({ caseId: r.case_id, userId: r.user_id, scope: scopeSchema.parse(r.scope), until: r.valid_until.toISOString(), revoked: r.revoked }));
    const evaluations = (await c.query("SELECT body FROM workbench.evaluations WHERE environment_id=$1", [this.environmentId])).rows.map((r) => r.body);
    const receipts = Object.fromEntries((await c.query("SELECT id,input,result FROM workbench.receipts WHERE environment_id=$1", [this.environmentId])).rows.map((r) => [r.id, { input: r.input, result: r.result }]));
    const { staff: staffRows, ...snapshotRows } = entries;
    const state: State = { ...snapshotSchema.parse({ ...snapshotRows, revision: meta.revision, generatedAt: new Date().toISOString() }), staff: z.array(staffSchema).parse(staffRows), nextCaseNumber: meta.next_case_number, grants, evaluations, receipts, revokedSessions: [] };
    const delegated = (await c.query("SELECT user_id,bureau_id,role_code,valid_until FROM workbench.delegations WHERE environment_id=$1 AND valid_until>now()", [this.environmentId])).rows;
    for (const row of delegated) {
      const staff = state.staff.find((u) => u.id === row.user_id); if (staff) staff.roles.push({ code: row.role_code, bureauId: row.bureau_id, from: "2026-01-01T00:00:00Z", until: row.valid_until.toISOString() });
    }
    if (this.identity) {
      const { principal, account } = this.identity, actor = state.staff.find((u) => u.id === principal.userId && u.authId === principal.authId);
      if (!actor || account.status !== "APPROVED") throw Error("CURRENT_HOSTED_APPROVAL_REQUIRED");
      actor.active = true; actor.memberships = actor.memberships.filter((m) => account.memberships.includes(m.bureauId));
      actor.roles = actor.roles.filter((r) => r.code === "SYSTEM_ADMIN" ? account.roles.includes("SYSTEM_ADMIN") : r.bureauId && account.memberships.includes(r.bureauId) && (account.roles.includes(r.code) || delegated.some((d) => d.user_id === actor.id && d.bureau_id === r.bureauId && d.role_code === r.code)));
    }
    return state;
  }
  /** Bounded worker view: a source draft, at most 49 indexed candidates and
   * their current grants. Never scan the whole complaint repository per mail. */
  async intakeState(c: PoolClient, options: {draftId?:string; sourceReference?:string; actorId?:string; candidateIds?:string[]}): Promise<State> {
    const meta=(await c.query('SELECT revision::text,next_case_number::text FROM workbench.meta WHERE environment_id=$1',[this.environmentId])).rows[0];
    const candidateIds=options.candidateIds??[];
    if(candidateIds.length>49)throw Error('WORKER_SHORTLIST_LIMIT');
    const rows:Record<string,unknown>=Object.fromEntries(collections.filter(t=>t!=='staff').map(t=>[t,[]]));
    rows.drafts=(await c.query('SELECT body FROM workbench.drafts WHERE environment_id=$1 AND (id=$2 OR id=ANY($3::uuid[]) OR (body->>\'source\'=\'EMAIL\' AND body->>\'sourceReference\'=$4))',[this.environmentId,options.draftId??null,candidateIds,options.sourceReference??null])).rows.map(r=>r.body);
    const drafts=snapshotSchema.shape.drafts.parse(rows.drafts),caseIds=drafts.flatMap(d=>d.linkedCaseId?[d.linkedCaseId]:[]);
    rows.cases=(await c.query('SELECT body FROM workbench.cases WHERE environment_id=$1 AND id=ANY($2::uuid[])',[this.environmentId,caseIds])).rows.map(r=>r.body);
    const staff=(await c.query('SELECT body FROM workbench.staff WHERE environment_id=$1 AND id=$2',[this.environmentId,options.actorId??null])).rows.map(r=>staffSchema.parse(r.body));
    const grants=(await c.query('SELECT case_id,user_id,scope,valid_until,revoked FROM workbench.grants WHERE environment_id=$1 AND user_id=$2 AND case_id=ANY($3::uuid[]) AND NOT revoked AND valid_until>now()',[this.environmentId,options.actorId??null,caseIds])).rows.map(r=>({caseId:r.case_id,userId:r.user_id,scope:scopeSchema.parse(r.scope),until:r.valid_until.toISOString(),revoked:r.revoked}));
    rows.matches=(await c.query('SELECT body FROM workbench.matches WHERE environment_id=$1 AND body->>\'draftId\'=$2',[this.environmentId,options.draftId??null])).rows.map(r=>r.body);
    rows.translations=(await c.query('SELECT body FROM workbench.translations WHERE environment_id=$1 AND body->>\'draftId\'=$2',[this.environmentId,options.draftId??null])).rows.map(r=>r.body);
    return {...snapshotSchema.parse({...rows,revision:meta.revision,generatedAt:new Date().toISOString()}),staff,nextCaseNumber:meta.next_case_number,grants,evaluations:[],receipts:{},revokedSessions:[]};
  }
  async save(c: PoolClient, before: State, state: State) {
    const sourceBlobs:unknown[][]=[];
    // Registration promotes supported source attachments atomically. Original
    // MIME and unsupported files remain retained in the immutable source job.
    for(const record of state.cases.filter(row=>!before.cases.some(old=>old.id===row.id))){
      const draft=state.drafts.find(d=>d.linkedCaseId===record.id&&d.ingestedBy==='GMAIL_WORKER');if(!draft)continue;
      const source=(await c.query("SELECT payload FROM workbench.jobs WHERE environment_id=$1 AND kind='EMAIL' AND id=$2 AND bureau_id=$3",[this.environmentId,draft.sourceReference.slice(6),draft.bureauId])).rows[0];
      let total=0;for(const file of source?.payload.attachments??[]){const bytes=Buffer.from(file.base64,'base64');total+=bytes.length;if(total>20*1024*1024)throw Error('SOURCE_ATTACHMENT_LIMIT');let inspected;try{inspected=inspectAttachment(bytes,file.name);}catch{continue;}
        if(inspected.sha256!==file.sha256)throw Error('SOURCE_ATTACHMENT_HASH_MISMATCH');const id=randomUUID(),versionId=randomUUID();
        state.evidence.push({id,caseId:record.id,documentId:randomUUID(),versionId,number:1,name:inspected.name,mediaType:inspected.mediaType,byteSize:bytes.length,sha256:inspected.sha256,scan:inspected.scan,status:'SUBMITTED',source:'Verified Gmail source attachment; binary files quarantined pending actual scanner',createdAt:new Date().toISOString()});
        sourceBlobs.push([id,this.environmentId,record.id,versionId,inspected.name,inspected.mediaType,inspected.sha256,bytes,inspected.scan,draft.creatorId]);
      }
    }
    for (const table of collections) {
      // Local delegated roles are not copied into the imported identity records.
      if (table === "staff") continue;
      const rows = state[table] as { id: string }[] | undefined, old = before[table] as { id: string }[] | undefined;
      for (const row of rows ?? []) if (JSON.stringify(row) !== JSON.stringify(old?.find((x) => x.id === row.id)))
        await c.query(`INSERT INTO workbench."${table}"(id,environment_id,body) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET body=excluded.body WHERE workbench."${table}".environment_id=excluded.environment_id`, [row.id, this.environmentId, JSON.stringify(row)]);
    }
    for(const values of sourceBlobs)await c.query('INSERT INTO workbench.blobs(id,environment_id,case_id,version_id,name,media_type,sha256,bytes,scan,uploader_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',values);
    for (const g of state.grants) if (JSON.stringify(g) !== JSON.stringify(before.grants.find((x) => x.caseId === g.caseId && x.userId === g.userId && x.scope === g.scope && x.until === g.until)))
      await c.query("INSERT INTO workbench.grants(environment_id,case_id,user_id,scope,valid_until,revoked) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(environment_id,case_id,user_id,scope,valid_until) DO UPDATE SET revoked=excluded.revoked", [this.environmentId,g.caseId,g.userId,g.scope,g.until,g.revoked]);
    for (const e of state.evaluations) if (!before.evaluations.some((x) => x.id === e.id)) await c.query("INSERT INTO workbench.evaluations VALUES($1,$2,$3,$4)", [e.id,this.environmentId,e.caseId,JSON.stringify(e)]);
    for (const [id,r] of Object.entries(state.receipts)) if (!before.receipts[id]) await c.query("INSERT INTO workbench.receipts VALUES($1,$2,$3,$4)", [id,this.environmentId,r.input,JSON.stringify(r.result)]);
    await c.query("UPDATE workbench.meta SET revision=$2,next_case_number=$3 WHERE environment_id=$1", [this.environmentId,state.revision,state.nextCaseNumber]);
    // Durable jobs are created atomically with the source drafts. Provider calls
    // occur outside this transaction, never while holding business-record locks.
    for (const d of state.drafts) if (!before.drafts.some((x) => x.id === d.id) || before.drafts.find((x) => x.id === d.id)?.institutionId !== d.institutionId || before.drafts.find(x=>x.id===d.id)?.language!==d.language) {
      const previous=before.drafts.find(x=>x.id===d.id),kinds:string[]=[];
      if(!previous||previous.institutionId!==d.institutionId)kinds.push('MATCH');
      if(d.language!=='en'&&(!previous||previous.language!==d.language))kinds.push('TRANSLATE');
      for (const kind of kinds)
        await c.query("INSERT INTO workbench.jobs(environment_id,kind,target_id,actor_id,bureau_id,dedupe_key) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(dedupe_key) DO NOTHING", [this.environmentId,kind,d.id,d.creatorId,d.bureauId,`${kind}:${d.id}:${d.version}`]);
    }
  }
  async transaction<T>(work: (state: State) => Promise<T>) {
    return this.locked(async (c) => { const before = await this.load(c), next = structuredClone(before), result = await work(next);
      if (JSON.stringify(before) !== JSON.stringify(next)) await this.save(c,before,next); return result; });
  }
}
export function makeWorkbenchPool(connectionString: string) { return new Pool({ connectionString, max: 4, connectionTimeoutMillis: 5000, statement_timeout: 10000, idleTimeoutMillis: 10000 }); }
export const collectionNames: readonly Collection[] = collections;
