"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { DemoProvider } from "./provider";
import { Shell } from "./shell";

export function AppFrame({ children }: { children: ReactNode }) {
  const path = usePathname();
  // The isolated preview never hydrates DemoState or reads the browser role selector.
  if (path === "/live-preview" || path === "/platform" || path.startsWith("/platform/")) return children;
  return (
    <DemoProvider>
      <Shell>{children}</Shell>
    </DemoProvider>
  );
}
