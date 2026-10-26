import { notFound } from "next/navigation";
import { Workspace } from "@/components/workspace";
const routes = new Set([
  "dashboard",
  "intake",
  "complaints",
  "tasks",
  "calendar",
  "analytics",
  "intelligence",
  "coordination",
  "dependencies",
  "resolutions",
  "team",
  "settings",
  "help",
  "admin",
]);
export default async function Page({
  params,
}: {
  params: Promise<{ path: string[] }>;
}) {
  const { path } = await params;
  if (!routes.has(path[0]) || path.length > (path[0] === "complaints" ? 2 : 1))
    notFound();
  return <Workspace route={path[0]} caseId={path[1]} />;
}
