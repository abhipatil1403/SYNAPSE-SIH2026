import { NextRequest } from 'next/server';
import { scanAuthorizedAttachment } from '@/lib/hosted/scanning';
import { platformFailure } from '@/lib/platform/server';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: NextRequest) {
    try {
        return await scanAuthorizedAttachment(request);
    }
    catch (error) {
        return platformFailure(error);
    }
}
