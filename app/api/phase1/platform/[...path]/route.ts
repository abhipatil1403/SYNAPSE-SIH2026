import { NextRequest } from "next/server";
import { platformServer, platformFailure } from "@/lib/platform/server";
import { PlatformError } from "@/lib/platform/contracts";
import { requireSameOrigin, smallJson } from "@/lib/live/request";
import { activation } from "@/lib/platform/repository";
import { workbenchConfig } from "@/lib/workbench/config";
export const runtime = "nodejs";
export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await params, api = platformServer(request);
    if (path.length === 1 && path[0] === "snapshot") return api.respond(await api.repository.snapshot());
    if (path.length === 1 && path[0] === "dashboard") return api.respond(await api.queries.dashboard(Number(request.nextUrl.searchParams.get("period") ?? 30)));
    if (path.length === 1 && path[0] === "calendar") return api.respond(await api.queries.calendar());
    if (path.length === 1 && path[0] === "reports") return api.respond(await api.queries.report());
    if (path[0] === "cases" && path.length === 2) return api.respond(await api.queries.detail(path[1]));
    if (path[0] === "cases" && path.length === 1) {
      const query: Record<string, string> = {};
      for (const [name, value] of request.nextUrl.searchParams) {
        if (name in query) throw new PlatformError(400, "invalid_query", "Repeated filters are not accepted.");
        query[name] = value;
      }
      return api.respond(await api.queries.registry(query));
    }
    throw new PlatformError(404, "not_found", "This platform route is unavailable.");
  } catch (error) { return platformFailure(error); }
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    // No request, environment or Demo actor can unlock live writes.
    if (!activation.businessWrites && !workbenchConfig()) throw new PlatformError(503, "business_writes_locked", "Hosted business writes remain disabled; only an explicitly configured isolated development database accepts these commands.");
    const { path } = await params;
    if (path.join("/") !== "commands") throw new PlatformError(404, "not_found", "Command route unavailable.");
    requireSameOrigin(request, process.env.SYNAPSE_APP_ORIGIN ?? "http://localhost:3000");
    const api = platformServer(request);
    return api.respond(await api.repository.command(await smallJson(request, 32768)));
  } catch (error) { return platformFailure(error); }
}
