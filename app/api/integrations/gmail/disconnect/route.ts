import {NextRequest} from 'next/server';
import {gmailAction} from '@/lib/gmail/server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export function POST(request:NextRequest){return gmailAction(request,'disconnect');}
