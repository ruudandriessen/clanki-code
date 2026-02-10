import { useState, useEffect, useMemo } from "react";
import { Outlet, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "@tanstack/react-db";
import { LayoutDashboard, GitBranch, Loader2, ChevronDown } from "lucide-react";
import {
  projectsCollection,
  getSnapshotsCollection,
  getGraphCollections,
} from "../lib/collections";
import { ActiveProjectContext } from "../lib/project-context";
import { fetchLatestSnapshot } from "../lib/api";
import { groupColor } from "../lib/group-colors";
import { authClient } from "../lib/auth-client";

export function ProjectLayout() {
  const { projectId } = useParams({ strict: false });
  const snapshotIdFromUrl = (useParams({ strict: false }) as any).snapshotId as string | undefined;
  const navigate = useNavigate();

  const [resolvedSnapshotId, setResolvedSnapshotId] = useState<string | null>(
    snapshotIdFromUrl ?? null,
  );
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [loading, setLoading] = useState(!snapshotIdFromUrl);

  // Get org name for breadcrumb
  const activeOrg = authClient.useActiveOrganization();
  const orgName = activeOrg.data?.name;

  // Get all projects for repo dropdown
  const { data: projects } = useLiveQuery((q) => q.from({ p: projectsCollection }));
  const project = projects?.find((p) => p.id === projectId);

  // Get snapshots for branch picker
  const snapshotsCollection = projectId ? getSnapshotsCollection(projectId) : null;
  const { data: snapshots } = useLiveQuery(
    (q) => (snapshotsCollection ? q.from({ s: snapshotsCollection }) : null),
    [projectId],
  );

  // Derive unique branches from snapshots
  const branches = useMemo(() => {
    if (!snapshots) return [];
    const branchSet = new Set<string>();
    for (const s of snapshots) {
      branchSet.add(s.branch ?? "main");
    }
    const sorted = [...branchSet].toSorted((a, b) => {
      if (a === "main") return -1;
      if (b === "main") return 1;
      return a.localeCompare(b);
    });
    return sorted;
  }, [snapshots]);

  // Resolve latest snapshot: use URL snapshot, or find latest for selected branch
  useEffect(() => {
    if (snapshotIdFromUrl) {
      setResolvedSnapshotId(snapshotIdFromUrl);
      // Derive branch from the snapshot
      if (snapshots) {
        const s = snapshots.find((s) => s.id === snapshotIdFromUrl);
        if (s) setSelectedBranch(s.branch ?? "main");
      }
      setLoading(false);
      return;
    }
    if (!projectId) return;

    // If we have snapshots loaded and a branch selected, find latest for that branch
    if (snapshots && snapshots.length > 0 && selectedBranch) {
      const branchSnapshots = snapshots
        .filter((s) => (s.branch ?? "main") === selectedBranch)
        .toSorted((a, b) => b.createdAt - a.createdAt);
      if (branchSnapshots.length > 0) {
        setResolvedSnapshotId(branchSnapshots[0].id);
        setLoading(false);
        return;
      }
    }

    // Fallback: fetch latest from API
    setLoading(true);
    fetchLatestSnapshot(projectId)
      .then((s) => {
        setResolvedSnapshotId(s.id);
        setSelectedBranch(s.branch ?? "main");
      })
      .catch(() => setResolvedSnapshotId(null))
      .finally(() => setLoading(false));
  }, [projectId, snapshotIdFromUrl, snapshots, selectedBranch]);

  // Set default branch when branches first load
  useEffect(() => {
    if (branches.length > 0 && !selectedBranch) {
      setSelectedBranch(branches.includes("main") ? "main" : branches[0]);
    }
  }, [branches, selectedBranch]);

  // Handle branch change
  function handleBranchChange(branch: string) {
    setSelectedBranch(branch);
    // Find latest snapshot for the new branch
    if (snapshots) {
      const branchSnapshots = snapshots
        .filter((s) => (s.branch ?? "main") === branch)
        .toSorted((a, b) => b.createdAt - a.createdAt);
      if (branchSnapshots.length > 0) {
        setResolvedSnapshotId(branchSnapshots[0].id);
      }
    }
  }

  // Get graph collections once snapshot is resolved
  const graphCollections =
    projectId && resolvedSnapshotId ? getGraphCollections(projectId, resolvedSnapshotId) : null;

  const { data: groups } = useLiveQuery(
    (q) => (graphCollections ? q.from({ g: graphCollections.groups }) : null),
    [projectId, resolvedSnapshotId],
  );

  const { data: classifications } = useLiveQuery(
    (q) => (graphCollections ? q.from({ c: graphCollections.classifications }) : null),
    [projectId, resolvedSnapshotId],
  );

  const { data: groupEdgesData } = useLiveQuery(
    (q) => (graphCollections ? q.from({ ge: graphCollections.groupEdges }) : null),
    [projectId, resolvedSnapshotId],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!resolvedSnapshotId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
        <p>No snapshots available for this project yet.</p>
        <p className="text-xs">Snapshots are created when pull requests are merged.</p>
        <Link to="/settings" className="text-sm text-primary hover:underline mt-2">
          Back to settings
        </Link>
      </div>
    );
  }

  const ctx = { projectId: projectId!, snapshotId: resolvedSnapshotId };
  const hasMultipleProjects = projects && projects.length > 1;
  const hasMultipleBranches = branches.length > 1;

  return (
    <ActiveProjectContext.Provider value={ctx}>
      <div className="flex flex-col h-full">
        {/* Breadcrumb header */}
        <div className="px-4 py-2 border-b border-border flex items-center gap-1.5 shrink-0 min-h-[41px]">
          {/* Org name */}
          <span className="text-sm text-muted-foreground truncate">
            {orgName ?? "Organization"}
          </span>

          <span className="text-muted-foreground text-xs">/</span>

          {/* Repo selector */}
          {hasMultipleProjects ? (
            <div className="relative">
              <select
                value={projectId}
                onChange={(e) =>
                  navigate({
                    to: "/projects/$projectId",
                    params: { projectId: e.target.value },
                  })
                }
                className="text-sm font-medium bg-transparent border-none outline-none cursor-pointer appearance-none pr-5 text-foreground"
              >
                {projects!.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3 h-3 text-muted-foreground absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          ) : (
            <span className="text-sm font-medium text-foreground truncate">
              {project?.name ?? projectId}
            </span>
          )}

          <span className="text-muted-foreground text-xs">/</span>

          {/* Branch selector */}
          {hasMultipleBranches ? (
            <div className="relative">
              <select
                value={selectedBranch ?? "main"}
                onChange={(e) => handleBranchChange(e.target.value)}
                className="text-sm bg-transparent border-none outline-none cursor-pointer appearance-none pr-5 text-foreground"
              >
                {branches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3 h-3 text-muted-foreground absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          ) : (
            <span className="text-sm text-foreground truncate">{selectedBranch ?? "main"}</span>
          )}

          {/* Stats */}
          {classifications && groupEdgesData && (
            <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              <GitBranch className="w-3.5 h-3.5" />
              {classifications.length} files · {groupEdgesData.length} deps
            </div>
          )}
        </div>

        {/* Sub-navigation: groups sidebar + content */}
        <div className="flex flex-1 min-h-0">
          {/* Groups sidebar */}
          <nav className="w-48 border-r border-border p-3 space-y-0.5 overflow-y-auto shrink-0 hidden md:block">
            <Link
              to="/projects/$projectId"
              params={{ projectId: projectId! }}
              activeOptions={{ exact: true }}
              activeProps={{ className: "bg-accent text-accent-foreground" }}
              inactiveProps={{
                className: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              }}
              className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors"
            >
              <LayoutDashboard className="w-4 h-4" />
              Graph
            </Link>

            {groups && groups.length > 0 && (
              <div className="pt-4">
                <p className="px-3 pb-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  Groups
                </p>
                {groups.map((g) => (
                  <Link
                    key={g.name}
                    to="/projects/$projectId/groups/$name"
                    params={{ projectId: projectId!, name: g.name }}
                    activeProps={{ className: "bg-accent text-accent-foreground" }}
                    inactiveProps={{
                      className: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                    }}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{
                        backgroundColor: groupColor(g.color),
                      }}
                    />
                    {g.name}
                  </Link>
                ))}
              </div>
            )}
          </nav>

          {/* Page content */}
          <div className="flex-1 min-w-0 overflow-hidden">
            <Outlet />
          </div>
        </div>
      </div>
    </ActiveProjectContext.Provider>
  );
}
