import type {Metadata} from 'next';
import {Landing} from '@/components/landing';
export const metadata:Metadata={title:'SYNAPSE — A clearer way forward',description:'A considered workspace for AICTE complaint coordination. Shared context, scoped officer access and accountable human decisions.'};
export default function Home(){return <Landing/>;}
