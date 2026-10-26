import { NextRequest } from "next/server";
import { readIdentity } from "@/lib/live/service";
import { phase1Context, phase1Failure } from "@/lib/live/server";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  let context: ReturnType<typeof phase1Context> | undefined;
  try {
    context = phase1Context(request);
    return context.respond({
      identity: await readIdentity(context.transport),
      readOnly: true,
    });
  } catch (error) {
    return phase1Failure(error, context?.respond);
  }
}
