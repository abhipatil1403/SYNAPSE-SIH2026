import {createHash} from 'node:crypto';
import type {Snapshot} from './contracts';
/** Compare-and-check token for the currently authorized CSV rows, not a grant. */
export function reportScope(snapshot:Snapshot){
 return createHash('sha256').update(JSON.stringify(snapshot.cases.map(c=>[c.id,c.version,c.caseNumber,c.subject,c.status,c.priority,c.receivedAt]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))))).digest('hex');
}
