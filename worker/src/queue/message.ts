export interface PrMergedMessage {
  type: "pr_merged";
  repository: string;
  prNumber: number;
  prTitle: string;
  mergedBy: string | undefined;
  mergedAt: number | null;
  branch: string;
  baseBranch: string;
  installationId: number;
  commitSha: string | null;
}

export type QueueMessage = PrMergedMessage;
