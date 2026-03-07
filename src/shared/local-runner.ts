import type { RunnerSessionSummary } from "@/shared/runner-session";

export type EnsureAssistantSessionRequest = {
  directory: string;
  model: string;
  provider: string;
  sessionId?: string | null;
  taskTitle: string;
};

export type EnsureAssistantSessionResponse = {
  isNewSession: boolean;
  sessionId: string;
};

export type ListAssistantSessionsResponse = {
  sessions: RunnerSessionSummary[];
};
