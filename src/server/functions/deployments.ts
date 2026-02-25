import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import * as schema from "@/server/db/schema";
import { createInstallationToken } from "@/server/lib/github";
import { authMiddleware } from "../middleware";
import { badGateway, badRequest, getOrgId, notFound } from "./common";

type GitHubDeployment = {
  id: number;
  ref: string;
  environment: string;
  transient_environment: boolean;
  production_environment: boolean;
  created_at: string;
  updated_at: string;
};

type GitHubDeploymentStatus = {
  state: string;
  environment_url: string | null;
  target_url: string | null;
  created_at: string;
  updated_at: string;
};

type DeploymentPreview = {
  id: number;
  ref: string;
  environment: string;
  state: string;
  previewUrl: string | null;
  detailsUrl: string | null;
  createdAt: number;
  updatedAt: number;
  isProduction: boolean;
};

export const fetchTaskDeployments = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .inputValidator(z.object({ taskId: z.string() }))
  .handler(async ({ data: input, context }): Promise<DeploymentPreview[]> => {
    const { db, env } = context;
    const orgId = getOrgId(context);

    if (!orgId) {
      badRequest("No active organization");
    }

    const task = await db.query.tasks.findFirst({
      where: and(eq(schema.tasks.id, input.taskId), eq(schema.tasks.organizationId, orgId)),
      columns: { id: true, projectId: true, branch: true },
    });

    if (!task) {
      notFound("Task not found");
    }

    if (!task.projectId) {
      return [];
    }

    const project = await db.query.projects.findFirst({
      where: and(eq(schema.projects.id, task.projectId), eq(schema.projects.organizationId, orgId)),
      columns: { repoUrl: true, installationId: true },
    });

    if (!project?.repoUrl || project.installationId === null) {
      return [];
    }

    const repo = extractRepoFromUrl(project.repoUrl);
    if (!repo) {
      return [];
    }

    const token = await createInstallationToken(env, project.installationId);
    const refFilter = task.branch?.trim() ?? "";
    const query = new URLSearchParams({ per_page: "8" });
    if (refFilter.length > 0) {
      query.set("ref", refFilter);
    }

    const deploymentsResponse = await fetch(
      `https://api.github.com/repos/${repo}/deployments?${query.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "clanki-worker",
        },
      },
    );

    if (!deploymentsResponse.ok) {
      const body = await deploymentsResponse.text();
      badGateway(
        `Failed to fetch deployments from GitHub (${deploymentsResponse.status}): ${body}`,
      );
    }

    const deployments = (await deploymentsResponse.json()) as GitHubDeployment[];
    if (deployments.length === 0) {
      return [];
    }

    const results = await Promise.all(
      deployments.map(async (deployment): Promise<DeploymentPreview> => {
        const statusResponse = await fetch(
          `https://api.github.com/repos/${repo}/deployments/${deployment.id}/statuses?per_page=1`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/vnd.github+json",
              "User-Agent": "clanki-worker",
            },
          },
        );

        let latestStatus: GitHubDeploymentStatus | null = null;
        if (statusResponse.ok) {
          const statuses = (await statusResponse.json()) as GitHubDeploymentStatus[];
          latestStatus = statuses[0] ?? null;
        }

        const previewUrl = normalizeAbsoluteUrl(
          latestStatus?.environment_url ?? latestStatus?.target_url ?? null,
        );

        return {
          id: deployment.id,
          ref: deployment.ref,
          environment: deployment.environment,
          state: latestStatus?.state ?? "queued",
          previewUrl,
          detailsUrl: normalizeAbsoluteUrl(latestStatus?.target_url ?? null),
          createdAt: toMsTimestamp(deployment.created_at),
          updatedAt: toMsTimestamp(latestStatus?.updated_at ?? deployment.updated_at),
          isProduction: deployment.production_environment,
        };
      }),
    );

    return results.toSorted((a, b) => b.updatedAt - a.updatedAt);
  });

function extractRepoFromUrl(repoUrl: string): string | null {
  try {
    const parsed = new URL(repoUrl);
    const parts = parsed.pathname
      .split("/")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    if (parts.length < 2) {
      return null;
    }

    return `${parts[0]}/${parts[1]}`;
  } catch {
    return null;
  }
}

function toMsTimestamp(value: string | null | undefined): number {
  if (!value) {
    return Date.now();
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function normalizeAbsoluteUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}
