import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useLiveQuery } from "@tanstack/react-db";
import { BookMarked, Loader2, Plus } from "lucide-react";
import { projectsCollection, queryClient } from "../lib/collections";
import { AddProjectDialog } from "../components/add-project-dialog";

export function ProjectsPage() {
  const { data: projects, isLoading } = useLiveQuery((q) => q.from({ p: projectsCollection }));
  const [dialogOpen, setDialogOpen] = useState(false);

  function handleCreated() {
    queryClient.invalidateQueries({ queryKey: ["projects"] });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!projects || projects.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
          <BookMarked className="w-8 h-8" />
          <p className="text-lg font-medium">No projects yet</p>
          <p className="text-sm">Add a repository to start exploring its architecture.</p>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="mt-2 flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium bg-primary text-white hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Project
          </button>
        </div>
        <AddProjectDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onCreated={handleCreated}
          existingProjects={[]}
        />
      </>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Projects</h2>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-primary text-white hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Project
        </button>
      </div>
      <div className="space-y-2">
        {projects.map((project) => (
          <Link
            key={project.id}
            to="/projects/$projectId"
            params={{ projectId: project.id }}
            className="block rounded-lg border border-border p-4 hover:bg-accent/50 transition-colors"
          >
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
          </Link>
        ))}
      </div>
      <AddProjectDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={handleCreated}
        existingProjects={projects}
      />
    </div>
  );
}
