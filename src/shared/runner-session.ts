export type RunnerSessionSummary = {
  createdAt: number;
  directory: string;
  id: string;
  title: string;
  updatedAt: number;
};

export type RunnerConnectionPayload = {
  baseUrl: string;
  workspaceDirectory: string;
};

export type RunnerSessionsPayload = {
  sessions: RunnerSessionSummary[];
  workspaceDirectory: string;
};
