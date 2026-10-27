import { NextResponse } from "next/server";
export async function GET() {
  // Public diagnostic metadata only. No keys, user records, documents or privileged queries.
  return NextResponse.json(
    { status: "authentication-required", readinessEndpoint:"/api/auth/readiness", processingEndpoint:"/api/workspace/processing/status" },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}
