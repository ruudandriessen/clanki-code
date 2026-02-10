import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, Search, Lock, X, Check } from "lucide-react";
import { cn } from "../lib/utils";
import {
  fetchInstallations,
  fetchInstallationRepos,
  createProjects,
  type Installation,
  type GitHubRepo,
  type Project,
} from "../lib/api";

interface RepoWithInstallation extends GitHubRepo {
  installationId: number;
}

export function AddProjectDialog({
  open,
  onClose,
  onCreated,
  existingProjects,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  existingProjects: Project[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [repos, setRepos] = useState<RepoWithInstallation[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existingRepoUrls = new Set(existingProjects.map((p) => p.repoUrl).filter(Boolean));

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelected(new Set());
    setFilter("");
    try {
      const installs = await fetchInstallations();
      setInstallations(installs);

      const allRepos: RepoWithInstallation[] = [];
      await Promise.all(
        installs.map(async (inst) => {
          const installRepos = await fetchInstallationRepos(inst.installationId);
          for (const repo of installRepos) {
            allRepos.push({ ...repo, installationId: inst.installationId });
          }
        }),
      );
      setRepos(allRepos);
    } catch {
      setError("Failed to load repositories from GitHub.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      dialog.showModal();
      loadData();
    } else {
      dialog.close();
    }
  }, [open, loadData]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [onClose]);

  function toggleRepo(htmlUrl: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(htmlUrl)) next.delete(htmlUrl);
      else next.add(htmlUrl);
      return next;
    });
  }

  async function handleAdd() {
    setCreating(true);
    setError(null);
    try {
      const reposList = repos
        .filter((r) => selected.has(r.htmlUrl))
        .map((r) => ({
          name: r.fullName,
          repoUrl: r.htmlUrl,
          installationId: r.installationId,
        }));

      await createProjects(reposList);
      onCreated();
      onClose();
    } catch {
      setError("Failed to create projects.");
    } finally {
      setCreating(false);
    }
  }

  const lowerFilter = filter.toLowerCase();
  const filteredRepos = repos.filter((r) => r.fullName.toLowerCase().includes(lowerFilter));
  const availableRepos = filteredRepos.filter((r) => !existingRepoUrls.has(r.htmlUrl));
  const alreadyAdded = filteredRepos.filter((r) => existingRepoUrls.has(r.htmlUrl));

  return (
    <dialog ref={dialogRef} className="bg-transparent p-0 m-auto backdrop:bg-black/60">
      <div className="bg-card border border-border rounded-xl w-[32rem] max-h-[80vh] flex flex-col text-foreground shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="text-base font-semibold">Add Project</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : installations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center text-muted-foreground gap-2">
              <p className="text-sm font-medium">No GitHub App installations found</p>
              <p className="text-xs">
                Install the Clanki GitHub App on your repositories to get started.
              </p>
            </div>
          ) : (
            <>
              {/* Search */}
              <div className="px-5 pt-4 pb-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Filter repositories..."
                    className="w-full pl-9 pr-3 py-2 rounded-md text-sm bg-background border border-border text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Repo list */}
              <div className="px-3 pb-3">
                {availableRepos.length === 0 && alreadyAdded.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No repositories found.
                  </p>
                ) : (
                  <>
                    {availableRepos.map((repo) => (
                      <button
                        key={repo.htmlUrl}
                        type="button"
                        onClick={() => toggleRepo(repo.htmlUrl)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors",
                          selected.has(repo.htmlUrl) ? "bg-primary/10" : "hover:bg-accent/50",
                        )}
                      >
                        <div
                          className={cn(
                            "w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors",
                            selected.has(repo.htmlUrl)
                              ? "bg-primary border-primary"
                              : "border-border",
                          )}
                        >
                          {selected.has(repo.htmlUrl) && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <span className="text-sm truncate flex-1">{repo.fullName}</span>
                        {repo.private && (
                          <Lock className="w-3 h-3 text-muted-foreground shrink-0" />
                        )}
                      </button>
                    ))}

                    {alreadyAdded.length > 0 && (
                      <>
                        {availableRepos.length > 0 && (
                          <div className="border-t border-border mt-2 pt-2" />
                        )}
                        <p className="text-xs text-muted-foreground px-3 py-1.5">Already added</p>
                        {alreadyAdded.map((repo) => (
                          <div
                            key={repo.htmlUrl}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-md opacity-40"
                          >
                            <div className="w-4 h-4 rounded border border-border bg-accent shrink-0 flex items-center justify-center">
                              <Check className="w-3 h-3 text-muted-foreground" />
                            </div>
                            <span className="text-sm truncate flex-1">{repo.fullName}</span>
                            {repo.private && (
                              <Lock className="w-3 h-3 text-muted-foreground shrink-0" />
                            )}
                          </div>
                        ))}
                      </>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {error && <div className="px-5 py-2 text-xs text-red-400">{error}</div>}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAdd}
            disabled={selected.size === 0 || creating}
            className="px-3 py-1.5 rounded-md text-sm font-medium bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1.5"
          >
            {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {selected.size === 0
              ? "Add projects"
              : `Add ${selected.size} project${selected.size === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </dialog>
  );
}
