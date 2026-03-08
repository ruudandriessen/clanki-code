import { createFileRoute } from "@tanstack/react-router";
import { projectsCollection } from "@/lib/collections";
import { SettingsPage } from "@/pages/settings-page";

export const Route = createFileRoute("/_layout/settings")({
  validateSearch: (search: Record<string, unknown>): { addProject?: boolean } => {
    const addProject = search.addProject === "1" || search.addProject === true;

    return addProject ? { addProject: true } : {};
  },
  loader: () => {
    if (typeof window === "undefined") {
      return;
    }

    return projectsCollection.preload();
  },
  component: SettingsPage,
});
