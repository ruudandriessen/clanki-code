import { Hono } from "hono";
import { eq, desc, inArray } from "drizzle-orm";
import * as schema from "../db/schema";
import type { DrizzleD1Database } from "drizzle-orm/d1";

type Env = {
  Variables: {
    db: DrizzleD1Database<typeof schema>;
  };
};

const projects = new Hono<Env>();

// GET /api/projects — list all projects
projects.get("/", async (c) => {
  const db = c.get("db");
  const rows = await db.query.projects.findMany({
    orderBy: desc(schema.projects.createdAt),
  });
  return c.json(rows);
});

// GET /api/projects/:projectId — single project
projects.get("/:projectId", async (c) => {
  const db = c.get("db");
  const { projectId } = c.req.param();

  const project = await db.query.projects.findFirst({
    where: eq(schema.projects.id, projectId),
  });

  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  return c.json(project);
});

// POST /api/projects — create project(s) from selected repos
projects.post("/", async (c) => {
  const db = c.get("db");

  let body: {
    repos: Array<{ name: string; repoUrl: string; installationId: number }>;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.repos || !Array.isArray(body.repos) || body.repos.length === 0) {
    return c.json({ error: "repos array is required and must not be empty" }, 400);
  }

  for (const repo of body.repos) {
    if (!repo.name || !repo.repoUrl || !repo.installationId) {
      return c.json({ error: "Each repo must have name, repoUrl, and installationId" }, 400);
    }
  }

  // Check for existing projects with same repoUrl
  const repoUrls = body.repos.map((r) => r.repoUrl);
  const existing = await db.query.projects.findMany({
    where: inArray(schema.projects.repoUrl, repoUrls),
    columns: { repoUrl: true },
  });
  const existingUrls = new Set(existing.map((p) => p.repoUrl));

  const newRepos = body.repos.filter((r) => !existingUrls.has(r.repoUrl));
  if (newRepos.length === 0) {
    return c.json({ error: "All selected repos already have projects" }, 409);
  }

  const now = Date.now();
  const created = newRepos.map((repo) => ({
    id: crypto.randomUUID(),
    name: repo.name,
    repoUrl: repo.repoUrl,
    installationId: repo.installationId,
    createdAt: now,
    updatedAt: now,
  }));

  await db.insert(schema.projects).values(created);

  return c.json(created, 201);
});

export { projects };
