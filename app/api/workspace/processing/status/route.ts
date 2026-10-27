import { hostedProcessingStatus } from '@/lib/hosted/processing-server';
import { platformFailure } from '@/lib/platform/server';
import { NextRequest } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function GET(request: NextRequest) {
    try {
        return await hostedProcessingStatus(request);
    }
    catch (error) {
        return platformFailure(error);
    }
}
