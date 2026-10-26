"use client";
import { Overview, Analytics } from "./overview";
import { Calendar, Complaints, Intake, Tasks } from "./work-pages";
import { CaseDetail } from "./case-detail";
import {
  Coordination,
  Dependencies,
  Intelligence,
  Resolutions,
} from "./intelligence-pages";
import { Admin, Help, SettingsPage, Team } from "./general-pages";
export function Workspace({
  route,
  caseId,
}: {
  route: string;
  caseId?: string;
}) {
  if (route === "complaints" && caseId)
    return <CaseDetail key={caseId} id={caseId} />;
  switch (route) {
    case "dashboard":
      return <Overview />;
    case "complaints":
      return <Complaints />;
    case "intake":
      return <Intake />;
    case "tasks":
      return <Tasks />;
    case "calendar":
      return <Calendar />;
    case "analytics":
      return <Analytics />;
    case "team":
      return <Team />;
    case "intelligence":
      return <Intelligence />;
    case "coordination":
      return <Coordination />;
    case "dependencies":
      return <Dependencies />;
    case "resolutions":
      return <Resolutions />;
    case "settings":
      return <SettingsPage />;
    case "help":
      return <Help />;
    case "admin":
      return <Admin />;
    default:
      return null;
  }
}
