import { NextRequest, NextResponse } from "next/server";
import { authContext } from "@/lib/auth/server";
import { Phase1Error } from "@/lib/live/service";
export async function proxy(request: NextRequest) {
  let ctx: ReturnType<typeof authContext> | undefined;
  try {
    ctx = authContext(request);
    const resolved = await ctx.account(), path = request.nextUrl.pathname;
    if (resolved.account.status !== "APPROVED" && path !== "/pending-approval")
      return ctx.apply(NextResponse.redirect(new URL("/pending-approval", ctx.config.appOrigin)));
    if (resolved.account.status === "APPROVED" && path === "/pending-approval")
      return ctx.apply(NextResponse.redirect(new URL("/dashboard", ctx.config.appOrigin)));
    if (["/officer-admin", "/admin"].includes(path) && !resolved.account.roles.includes("SYSTEM_ADMIN"))
      return ctx.apply(NextResponse.redirect(new URL("/officer/dashboard", ctx.config.appOrigin)));
    return ctx.apply(NextResponse.next());
  } catch (error) {
    if (!ctx) return NextResponse.json({ error: { message: "Secure officer access is not configured." } }, { status: 503, headers: { "Cache-Control": "no-store" } });
    if (error instanceof Phase1Error && error.status === 401) return ctx.apply(NextResponse.redirect(new URL("/login", ctx.config.appOrigin)));
    return ctx.apply(NextResponse.json({ error: { message: "Secure officer access is temporarily unavailable. Please retry." } }, { status: 503 }));
  }
}
export const config = { matcher: ["/officer/:path*", "/pending-approval", "/officer-admin", "/platform/:path*", "/dashboard/:path*", "/complaints/:path*", "/intake/:path*", "/institutions/:path*", "/tasks/:path*", "/calendar/:path*", "/analytics/:path*", "/coordination/:path*", "/dependencies/:path*", "/intelligence/:path*", "/resolutions/:path*", "/team/:path*", "/settings/:path*", "/help/:path*", "/admin/:path*", "/kanban/:path*", "/graph/:path*", "/reports/:path*", "/notifications/:path*"] };
