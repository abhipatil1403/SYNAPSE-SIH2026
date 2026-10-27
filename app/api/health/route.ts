import { NextResponse } from "next/server";
import {workbenchConfig} from '@/lib/workbench/config';
export async function GET() {
  return NextResponse.json(
    {
      application: "SYNAPSE",
      prototype: "0.1.0",
      mode: "authenticated-development",
      persistence: workbenchConfig()?"isolated-postgresql-configured":"unconfigured",
      databaseHealth: "Not checked by this public liveness endpoint; authenticated readiness checks are required.",
      liveWorkflowsEnabled: false,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
