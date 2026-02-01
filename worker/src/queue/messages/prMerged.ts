import { eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../../db/schema";
import { projects, pullRequests, snapshots } from "../../db/schema";
import { and } from "drizzle-orm";
import type { PrMergedMessage } from "../message";

export async function processPrMergedJob(
  message: PrMergedMessage,
  db: DrizzleD1Database<typeof schema>,
): Promise<void> {
  const repoUrl = `https://github.com/${message.repository}`;

  const project = await db.query.projects.findFirst({
    where: eq(projects.repoUrl, repoUrl),
  });

  if (!project) {
    console.log(`No project found for repository ${message.repository}, skipping`);
    return;
  }

  const pr = await db.query.pullRequests.findFirst({
    where: and(
      eq(pullRequests.repository, message.repository),
      eq(pullRequests.prNumber, message.prNumber),
    ),
  });

  const snapshotId = crypto.randomUUID();

  await db.insert(snapshots).values({
    id: snapshotId,
    projectId: project.id,
    pullRequestId: pr?.id ?? null,
    commitSha: message.commitSha,
    status: "pending",
    createdAt: Date.now(),
  });

  console.log(
    `Created snapshot ${snapshotId} for project ${project.id} from PR #${message.prNumber}`,
  );
}
