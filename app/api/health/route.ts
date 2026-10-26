import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json(
    {
      application: "SYNAPSE",
      prototype: "0.1.0",
      mode: "demo",
      persistence: "browser-local",
      liveWorkflowsEnabled: false,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
