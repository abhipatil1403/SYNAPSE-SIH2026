import { NextResponse } from "next/server";
import { currentReadiness } from "@/lib/live/readiness-server";
export const runtime = "nodejs";
export async function GET() {
  const report = await currentReadiness();
  // Sanitized checks only: no identities, case counts, credentials, session IDs or SQL bodies.
  return NextResponse.json(report, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
