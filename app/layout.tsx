import type { Metadata } from "next";
import "@fontsource-variable/plus-jakarta-sans";
import "@xyflow/react/dist/style.css";
import "./globals.css";
import "./overview.css";
import "./live-preview.css";
import { AppFrame } from "@/components/app-frame";
export const metadata: Metadata = {
  title: "SYNAPSE · Coordinated resolution",
  description:
    "A fictional SIH prototype for evidence-backed complaint coordination and human-reviewed resolution.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const unavailableLiveMode =
    process.env.NEXT_PUBLIC_APP_MODE &&
    process.env.NEXT_PUBLIC_APP_MODE !== "demo";
  return (
    <html lang="en">
      <body>
        {unavailableLiveMode ? (
          <main className="boot">
            <h1>Live integration is not enabled</h1>
            <p>
              The deployed identity, access, and workflow checks must pass
              before this application can serve live cases.
            </p>
            <p>
              See docs/SUPABASE_AUDIT.md. Set NEXT_PUBLIC_APP_MODE=demo to use
              the fictional local prototype.
            </p>
          </main>
        ) : (
          <AppFrame>{children}</AppFrame>
        )}
      </body>
    </html>
  );
}
