import { NextResponse } from "next/server";
import { integrationSnapshot } from "@/lib/integration-status";
export async function GET() {
  // Public diagnostic metadata only. No keys, user records, documents or privileged queries.
  return NextResponse.json(
    { status: "blocked", snapshot: integrationSnapshot },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
