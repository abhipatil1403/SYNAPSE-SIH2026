import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PlatformEngine,MemoryTransactionStore} from '../lib/platform/engine';
import {platformFixture,principal,fixtureId as id,now} from './fixtures/platform';
import {platformCalendar,authorizedReport} from '../lib/platform/selectors';
import type {Command} from '../lib/platform/contracts';
test('event changes preserve prior schedule, enforce case version and scope, and cancellation removes both calendar projections',async()=>{
 const engine=new PlatformEngine(new MemoryTransactionStore(platformFixture()),()=>now),send=(command:Command,n=1)=>engine.execute(principal(n),{idempotencyKey:randomUUID(),command});
 const event=await send({type:'event.schedule',caseId:id(21),expectedVersion:'1',title:'Reviewed hearing',at:'2026-11-01T18:45:00Z',kind:'HEARING',reason:'Actual engineering event'});
 await assert.rejects(send({type:'event.cancel',caseId:id(21),expectedVersion:'2',eventId:event.entityId,reason:'Cross-Bureau attempt'},2),/unavailable/);
 await assert.rejects(send({type:'event.reschedule',caseId:id(21),expectedVersion:'1',eventId:event.entityId,title:'Stale change',at:'2026-11-03T00:00:00Z',reason:'Stale attempt'}),/changed/);
 await send({type:'event.reschedule',caseId:id(21),expectedVersion:'2',eventId:event.entityId,title:'Reviewed hearing revised',at:'2026-12-31T18:45:00Z',reason:'Reviewed new time'});
 const current=await engine.snapshot(principal());assert.equal(platformCalendar(current).find(e=>e.id===event.entityId)?.day,'2027-01-01');
 assert.ok(current.activity.some(a=>a.type==='event.previous_schedule'&&a.reason.includes('2026-11-01')));
 await send({type:'event.cancel',caseId:id(21),expectedVersion:'3',eventId:event.entityId,reason:'Hearing withdrawn after review'});
 const cancelled=await engine.snapshot(principal());assert.ok(cancelled.events.find(e=>e.id===event.entityId)?.cancelledAt);assert.ok(!platformCalendar(cancelled).some(e=>e.id===event.entityId));
 await assert.rejects(send({type:'event.reschedule',caseId:id(21),expectedVersion:'4',eventId:event.entityId,title:'Revive cancelled hearing',at:now,reason:'Must be rejected'}),/unavailable/);
});
test('report export is audited only for the current revision and report rows retain authorized projection',async()=>{
 const engine=new PlatformEngine(new MemoryTransactionStore(platformFixture()),()=>now),snapshot=await engine.snapshot(principal());
 assert.equal(authorizedReport(snapshot).total,2);assert.ok(!authorizedReport(snapshot).rows.some(c=>c.caseNumber==='9002'));
 const command:Command={type:'report.export',expectedRevision:snapshot.revision,expectedScope:snapshot.reportScope},key=randomUUID();
 const exported=await engine.execute(principal(),{command,idempotencyKey:key});assert.deepEqual(await engine.execute(principal(),{command,idempotencyKey:key}),exported);
 assert.equal((await engine.snapshot(principal())).activity.filter(a=>a.type==='report.export').length,1);
 await assert.rejects(engine.execute(principal(),{command,idempotencyKey:randomUUID()}),/report changed/);
});
test('intake association cannot mutate a disposed record or partially advance the draft',async()=>{
 const state=platformFixture();state.cases.find(c=>c.id===id(23))!.status='DISPOSED';
 const engine=new PlatformEngine(new MemoryTransactionStore(state),()=>now),send=(command:Command)=>engine.execute(principal(3),{idempotencyKey:randomUUID(),command});
 const draft=await send({type:'draft.create',sourceReference:'closed-case-association',source:'MANUAL',subject:'Authorized source',body:'Original source remains preserved',language:'en',bureauId:id(11),institutionId:null});
 await send({type:'draft.verify',draftId:draft.entityId,expectedVersion:'1',institutionId:id(13),reason:'Human source verification'});
 await assert.rejects(send({type:'draft.associate',draftId:draft.entityId,expectedVersion:'2',caseId:id(23),reason:'Must not change a disposed record'}),/read-only/);
 const snapshot=await engine.snapshot(principal(3));assert.equal(snapshot.cases.find(c=>c.id===id(23))!.version,'1');assert.equal(snapshot.drafts.find(d=>d.id===draft.entityId)!.version,'2');assert.equal(snapshot.drafts.find(d=>d.id===draft.entityId)!.state,'UNDER_REVIEW');
});
test('report export and event receipt replay reauthorize after a Bureau role expires without a business revision change',async()=>{
 const store=new MemoryTransactionStore(platformFixture()),engine=new PlatformEngine(store,()=>now),snapshot=await engine.snapshot(principal());
 const command:Command={type:'report.export',expectedRevision:snapshot.revision,expectedScope:snapshot.reportScope},key=randomUUID();
 await engine.execute(principal(),{command,idempotencyKey:key});
 const event:Command={type:'event.schedule',caseId:id(21),expectedVersion:'1',title:'Authorized event',at:now,kind:'REVIEW',reason:'Accountable scheduling'},eventKey=randomUUID();await engine.execute(principal(),{command:event,idempotencyKey:eventKey});
 await store.transaction(async s=>{s.staff[0].roles[0].until='2026-10-25T00:00:00Z';});
 await assert.rejects(engine.execute(principal(),{command,idempotencyKey:key}),/authorization changed/);
 await assert.rejects(engine.execute(principal(),{command:event,idempotencyKey:eventKey}),/unavailable/);
});
test('authorized disposal stops active SLA clocks and retains original approved deadlines',async()=>{
 const state=platformFixture();state.evidence.push({id:id(91),caseId:id(23),documentId:id(92),versionId:id(93),number:1,name:'Reviewed source',mediaType:'text/plain',byteSize:5,sha256:'a'.repeat(64),scan:'NOT_REQUIRED',status:'VERIFIED',source:'Controlled evidence',createdAt:now});
 state.sla.push({...state.sla[0],id:id(94),caseId:id(23),status:'PAUSED'});const original=state.sla[1].originalDueAt;
 const engine=new PlatformEngine(new MemoryTransactionStore(state),()=>now),send=(command:Command)=>engine.execute(principal(3),{idempotencyKey:randomUUID(),command});
 const evaluation=await send({type:'closure.evaluate',caseId:id(23),expectedVersion:'1',policyId:id(15)});await send({type:'closure.dispose',caseId:id(23),expectedVersion:'1',evaluationId:evaluation.entityId,reason:'Authorized completed review'});
 const clock=(await engine.snapshot(principal(3))).sla.find(s=>s.id===id(94))!;assert.equal(clock.status,'COMPLETED');assert.equal(clock.originalDueAt,original);assert.equal(clock.dueAt,state.sla[1].dueAt);
});
