import {redirect} from 'next/navigation';
import {notFound} from 'next/navigation';
import {platformSections} from '@/lib/platform/navigation';
export default async function LegacyWorkspace({params}:{params:Promise<{path?:string[]}>}){const {path=[]}=await params;const section=path[0]??'dashboard';if(path.length>2||(path.length===2&&section!=='cases')||!platformSections.some(([id])=>id===section))notFound();redirect('/'+(section==='cases'?'complaints':section)+(path[1]?'/'+path[1]:''));}
