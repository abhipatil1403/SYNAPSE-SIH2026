import { notFound } from "next/navigation";
import { PlatformWorkspace } from "@/components/platform-workspace";
export default async function Page({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  if (path.length > 2 || path.length === 2 && path[0] !== "cases" || path[0] && !["dashboard", "cases", "intake", "tasks", "calendar", "coordination", "intelligence", "notifications", "reports"].includes(path[0])) notFound();
  return <PlatformWorkspace path={path} />;
}
