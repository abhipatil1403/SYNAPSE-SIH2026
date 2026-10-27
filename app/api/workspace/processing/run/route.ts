import { hostedProcessingRun } from '@/lib/hosted/processing-server';
import { platformFailure } from '@/lib/platform/server';
import { NextRequest } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function POST(request: NextRequest) {
    try {
        return await hostedProcessingRun(request);
    }
    catch (error) {
        return platformFailure(error);
    }
}
