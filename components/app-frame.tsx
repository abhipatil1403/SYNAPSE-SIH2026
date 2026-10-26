"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { DemoProvider } from "./provider";
import { Shell } from "./shell";

export function AppFrame({ children }: { children: ReactNode }) {
  const path = usePathname();
  // The isolated preview never hydrates DemoState or reads the browser role selector.
  if (["/live-preview", "/login", "/signup", "/forgot-password", "/reset-password", "/pending-approval", "/officer-admin"].includes(path) || path.startsWith("/auth/") || path.startsWith("/officer/") || path === "/platform" || path.startsWith("/platform/")) return children;
  return (
    <DemoProvider>
      <Shell>{children}</Shell>
    </DemoProvider>
  );
}
