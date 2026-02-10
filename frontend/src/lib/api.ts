const BASE = "/api";

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { credentials: "include" });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${path}`);
  }
  return res.json();
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${path}`);
  }
  return res.json();
}

// ---- Types matching API responses ----

export interface Project {
  id: string;
  name: string;
  repoUrl: string | null;
  installationId: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface Snapshot {
  id: string;
  projectId: string;
  pullRequestId: string | null;
  commitSha: string | null;
  branch: string | null;
  status: string;
  createdAt: number;
}

export interface GroupDefinition {
  name: string;
  description: string;
  color: string | null;
}

export interface FileClassification {
  file: string;
  group: string;
  strategy: string;
}

export interface FileEdge {
  from: string;
  to: string;
  symbols: string[];
}

export interface GroupEdge {
  from: string;
  to: string;
  weight: number;
  symbols: string[];
}

export interface GraphData {
  groups: GroupDefinition[];
  classifications: FileClassification[];
  fileEdges: FileEdge[];
  groupEdges: GroupEdge[];
}

export interface Installation {
  installationId: number;
  accountLogin: string;
  accountType: string;
  createdAt: number;
  deletedAt: number | null;
  updatedAt: number | null;
}

export interface GitHubRepo {
  id: number;
  fullName: string;
  name: string;
  htmlUrl: string;
  private: boolean;
}

// ---- Fetch functions ----

export function fetchProjects() {
  return fetchJson<Project[]>("/projects");
}

export function fetchSnapshots(projectId: string) {
  return fetchJson<Snapshot[]>(`/projects/${projectId}/snapshots`);
}

export function fetchLatestSnapshot(projectId: string) {
  return fetchJson<Snapshot>(`/projects/${projectId}/snapshots/latest`);
}

export function fetchGraphData(projectId: string, snapshotId: string) {
  return fetchJson<GraphData>(`/projects/${projectId}/snapshots/${snapshotId}/graph`);
}

export function fetchInstallations() {
  return fetchJson<Installation[]>("/installations");
}

export function fetchInstallationRepos(installationId: number) {
  return fetchJson<GitHubRepo[]>(`/installations/${installationId}/repos`);
}

export function createProjects(
  repos: Array<{ name: string; repoUrl: string; installationId: number }>,
) {
  return postJson<Project[]>("/projects", { repos });
}
