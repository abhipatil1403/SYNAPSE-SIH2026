import {test} from 'node:test';
import assert from 'node:assert/strict';
import {snapshotSchema} from '../lib/platform/contracts';
import {authorizedSnapshot,platformCalendar,platformDashboard} from '../lib/platform/selectors';
import {platformFixture,principal,now} from './fixtures/platform';
import {accountWorkspaceSnapshot,hostedReadPreviewAllowed} from '../lib/platform/account-workspace';

test('hosted case reads require both the existing server switch and exact verified-subject allowlist',()=>{
 const actor=principal().authId,other=principal(2).authId;
 assert.equal(hostedReadPreviewAllowed(actor,'false',[actor]),false);
 assert.equal(hostedReadPreviewAllowed(actor,undefined,[actor]),false);
 assert.equal(hostedReadPreviewAllowed(actor,'true',[]),false);
 assert.equal(hostedReadPreviewAllowed(actor,'true',[other]),false);
 assert.equal(hostedReadPreviewAllowed(actor,'true',[actor]),true);
});

test('account workspace projects only the actual self profile and labels business sources unavailable',()=>{
 const profile=platformFixture().staff[0],s=accountWorkspaceSnapshot(profile);
 assert.equal(s.me?.id,profile.id);assert.equal(s.me?.name,profile.name);assert.equal(s.workspace?.mode,'ACCOUNT_ONLY');
 assert.deepEqual(s.workspace?.sources,[]);assert.deepEqual(s.cases,[]);assert.equal(s.directory?.length,1);
 assert.ok(!JSON.stringify(s).includes(profile.authId));assert.equal(s.me?.roles[0],'CASE_OFFICER');
});

test('hosted availability distinguishes account-only access from an empty authorized case repository',()=>{
 const original=authorizedSnapshot(platformFixture(),principal(),now);
 assert.equal(original.workspace,undefined);
 const metadata=snapshotSchema.parse({...original,cases:[],workspace:{mode:'ACCOUNT_ONLY',sources:[],reason:'Complaint read lease is inactive'}});
 assert.equal(metadata.workspace?.mode,'ACCOUNT_ONLY');
 const empty=snapshotSchema.parse({...metadata,workspace:{mode:'READ_ONLY',sources:['cases','sla'],reason:'Authorized read-only case projection'}});
 assert.equal(empty.workspace?.mode,'READ_ONLY');
 assert.equal(platformDashboard(empty,now).total,0);
});
test('hosted workspace contract rejects fabricated capabilities and browser write flags',()=>{
 const s=authorizedSnapshot(platformFixture(),principal(),now);
 assert.throws(()=>snapshotSchema.parse({...s,workspace:{mode:'READ_ONLY',sources:['documents'],reason:'Invalid unsupported source'}}));
 assert.throws(()=>snapshotSchema.parse({...s,workspace:{mode:'READ_ONLY',sources:['cases'],reason:'Invalid extra grant',writesEnabled:true}}));
});
test('deployed MET and CANCELLED SLA values remain exact and do not create calendar deadlines',()=>{
 const s=authorizedSnapshot(platformFixture(),principal(),now);
 assert.equal(platformCalendar(s).filter(e=>e.type==='SLA').length,1);
 for(const status of ['MET','CANCELLED'] as const){
  const result=snapshotSchema.parse({...s,sla:s.sla.map(v=>({...v,status}))});
  assert.equal(result.sla[0].status,status);
  assert.equal(result.sla[0].originalDueAt,s.sla[0].originalDueAt);
  assert.equal(platformCalendar(result).filter(e=>e.type==='SLA').length,0);
 }
});
