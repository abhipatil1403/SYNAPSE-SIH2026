import { NextRequest } from "next/server";
import { parseCaseQuery } from "@/lib/live/contracts";
import { readCaseList, Phase1Error } from "@/lib/live/service";
import { phase1Context, phase1Failure } from "@/lib/live/server";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  let context: ReturnType<typeof phase1Context> | undefined;
  try {
    context = phase1Context(request);
    let query;
    try {
      query = parseCaseQuery(request.nextUrl.searchParams);
    } catch {
      throw new Phase1Error(
        400,
        "invalid_query",
        "Check the case filters and try again.",
      );
    }
    return context.respond(await readCaseList(context.transport, query));
  } catch (error) {
    return phase1Failure(error, context?.respond);
  }
}
