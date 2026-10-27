import {snapshotSchema,type Staff} from './contracts';

export function hostedReadPreviewAllowed(authId:string,enabled:string|undefined,allowedIds:readonly string[]){
 return enabled==='true'&&allowedIds.includes(authId);
}

/** Actual approved self profile, with unavailable business data explicitly labelled. */
export function accountWorkspaceSnapshot(profile:Staff){
 const me={id:profile.id,name:profile.name,bureauIds:[...new Set(profile.memberships.map(m=>m.bureauId))],roles:[...new Set(profile.roles.map(r=>r.code))]};
 return snapshotSchema.parse({revision:String(Date.now()),generatedAt:new Date().toISOString(),me,directory:[me],
  workspace:{mode:'ACCOUNT_ONLY',sources:[],reason:'Your approved account is connected. Complaint preview requires an explicitly allowed account and an approved, expiring read lease.'},
  cases:[],drafts:[],tasks:[],evidence:[],matches:[],relationships:[],findings:[],policies:[],bureaus:[],institutions:[],categories:[],comments:[],activity:[],sla:[],events:[],notifications:[],accessRequests:[],transfers:[]});
}
