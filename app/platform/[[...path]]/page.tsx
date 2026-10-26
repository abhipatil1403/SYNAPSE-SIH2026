import { notFound } from "next/navigation";
import { PlatformWorkspace } from "@/components/platform-workspace";
import { platformSections } from "@/lib/platform/navigation";
export default async function Page({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  if (path.length > 2 || path.length === 2 && path[0] !== "cases" || path[0] && !platformSections.some(([key]) => key === path[0])) notFound();
  return <PlatformWorkspace path={path} />;
}
