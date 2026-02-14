import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import type { AppDb } from "../db/client";
import { withTransaction, withTxid } from "../db/transaction";
import { clauseToString } from "../lib/clause-to-string";
import { electricFn } from "../lib/electric";
import * as schema from "../db/schema";

type Env = {
  Variables: {
    db: AppDb;
    session: {
      session: { userId: string; activeOrganizationId?: string | null };
      user: { id: string; name: string; email: string; image?: string | null };
    };
  };
};

const projects = new Hono<Env>();

function getOrgId(c: { get: (key: "session") => Env["Variables"]["session"] }): string | null {
  const session = c.get("session");
  return (session.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null;
}

function parseOptionalId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseOptionalTimestamp(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  if (value < 0) {
    return undefined;
  }

  return Math.trunc(value);
}

projects.get("/shape", async (c) => {
  const orgId = getOrgId(c);

  if (!orgId) {
    return c.json({ error: "No active organization" }, 400);
  }

  return electricFn({
    request: c.req.raw,
    table: "projects",
    where: clauseToString(eq(schema.projects.organizationId, orgId)),
  });
});

// POST /api/projects — create project(s) from selected repos
projects.post("/", async (c) => {
  const db = c.get("db");
  const orgId = getOrgId(c);

  if (!orgId) {
    return c.json({ error: "No active organization" }, 400);
  }

  let body: {
    repos: Array<{
      id?: string;
      name: string;
      repoUrl: string;
      installationId: number;
      createdAt?: number;
      updatedAt?: number;
    }>;
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
    if (!repo.name || !repo.repoUrl || typeof repo.installationId !== "number") {
      return c.json({ error: "Each repo must have name, repoUrl, and installationId" }, 400);
    }
  }

  const result = await withTransaction(db, async (tx, txid) => {
    // Check for existing projects with same repoUrl in this org
    const repoUrls = body.repos.map((r) => r.repoUrl);
    const existing = await tx.query.projects.findMany({
      where: and(
        eq(schema.projects.organizationId, orgId),
        inArray(schema.projects.repoUrl, repoUrls),
      ),
      columns: { repoUrl: true },
    });
    const existingUrls = new Set(existing.map((p) => p.repoUrl));

    const newRepos = body.repos.filter((r) => !existingUrls.has(r.repoUrl));
    if (newRepos.length === 0) {
      return { conflict: true as const };
    }

    const now = Date.now();
    const created = newRepos.map((repo) => {
      const createdAt = parseOptionalTimestamp(repo.createdAt) ?? now;
      const updatedAt = parseOptionalTimestamp(repo.updatedAt) ?? createdAt;

      return {
        id: parseOptionalId(repo.id) ?? crypto.randomUUID(),
        organizationId: orgId,
        name: repo.name,
        repoUrl: repo.repoUrl,
        installationId: repo.installationId,
        setupCommand: null,
        createdAt,
        updatedAt,
      };
    });

    await tx.insert(schema.projects).values(created);
    return { created, txid };
  });

  if ("conflict" in result) {
    return c.json({ error: "All selected repos already have projects" }, 409);
  }

  return withTxid(c.json(result.created, 201), result.txid);
});

// PATCH /api/projects/:projectId — update project settings
projects.patch("/:projectId", async (c) => {
  const db = c.get("db");
  const orgId = getOrgId(c);
  const { projectId } = c.req.param();

  if (!orgId) {
    return c.json({ error: "No active organization" }, 400);
  }

  let body: { setupCommand?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!body || typeof body !== "object") {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!("setupCommand" in body)) {
    return c.json({ error: "setupCommand is required" }, 400);
  }

  if (typeof body.setupCommand !== "string" && body.setupCommand !== null) {
    return c.json({ error: "setupCommand must be a string or null" }, 400);
  }

  const setupCommand =
    typeof body.setupCommand === "string"
      ? body.setupCommand.trim().length > 0
        ? body.setupCommand.trim()
        : null
      : null;

  const result = await withTransaction(db, async (tx, txid) => {
    const existing = await tx.query.projects.findFirst({
      where: and(eq(schema.projects.id, projectId), eq(schema.projects.organizationId, orgId)),
      columns: { id: true },
    });

    if (!existing) {
      return { notFound: true as const };
    }

    const updatedAt = Date.now();
    await tx
      .update(schema.projects)
      .set({ setupCommand, updatedAt })
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.organizationId, orgId)));

    const updated = await tx.query.projects.findFirst({
      where: and(eq(schema.projects.id, projectId), eq(schema.projects.organizationId, orgId)),
    });

    return { updated, txid };
  });

  if ("notFound" in result) {
    return c.json({ error: "Project not found" }, 404);
  }

  return withTxid(c.json(result.updated), result.txid);
});

export { projects };
