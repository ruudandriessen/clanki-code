import { useState } from "react";
import { useLiveQuery } from "@tanstack/react-db";
import { BookMarked, Loader2, Plus } from "lucide-react";
import { projectsCollection, queryClient } from "../lib/collections";
import { AddProjectDialog } from "../components/add-project-dialog";

export function SettingsPage() {
  const { data: projects, isLoading } = useLiveQuery((q) => q.from({ p: projectsCollection }));
  const [dialogOpen, setDialogOpen] = useState(false);

  function handleCreated() {
    queryClient.invalidateQueries({ queryKey: ["projects"] });
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h2 className="text-lg font-semibold mb-6">Settings</h2>

      <div className="space-y-6">
        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Projects
            </h3>
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-primary text-white hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Project
            </button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : !projects || projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3 border border-dashed border-border rounded-lg">
              <BookMarked className="w-8 h-8" />
              <p className="text-sm">No projects yet. Add a repository to get started.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {projects.map((project) => (
                <div key={project.id} className="rounded-lg border border-border p-4">
                  <div className="flex items-center gap-3">
                    <BookMarked className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{project.name}</p>
                      {project.repoUrl && (
                        <p className="text-xs text-muted-foreground truncate">{project.repoUrl}</p>
                      )}
                    </div>
                    <span className="ml-auto text-xs text-muted-foreground shrink-0">
                      {new Date(project.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <AddProjectDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={handleCreated}
        existingProjects={projects ?? []}
      />
    </div>
  );
}
