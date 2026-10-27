import type { Metadata } from "next";
import "@fontsource-variable/plus-jakarta-sans";
import "@xyflow/react/dist/style.css";
import "./globals.css";
import "./overview.css";
import "./live-preview.css";
import "./platform.css";
import "./auth.css";
import { AppFrame } from "@/components/app-frame";
export const metadata: Metadata = {
  title: "SYNAPSE · Coordinated resolution",
  description:
    "Authorized complaint coordination with persistent PostgreSQL records and human-reviewed resolution.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppFrame>{children}</AppFrame>
      </body>
    </html>
  );
}
