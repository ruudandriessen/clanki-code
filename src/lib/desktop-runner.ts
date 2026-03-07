import { invoke } from "@tauri-apps/api/core";
import { createLocalRunnerClient } from "@/lib/local-runner-client";
import type { RunnerConnectionPayload, RunnerSessionsPayload } from "@/shared/runner-session";

const DEFAULT_OPENCODE_MODEL = "gpt-5.3-codex";
const DEFAULT_OPENCODE_PROVIDER = "openai";

async function ensureDesktopRunnerConnection(): Promise<RunnerConnectionPayload> {
  return await invoke<RunnerConnectionPayload>("ensure_runner_connection");
}

export async function listDesktopRunnerSessions(): Promise<RunnerSessionsPayload> {
  const connection = await ensureDesktopRunnerConnection();
  const client = createLocalRunnerClient(connection);
  const response = await client.listAssistantSessions();

  return {
    sessions: response.sessions,
    workspaceDirectory: connection.workspaceDirectory,
  };
}

export async function createDesktopRunnerSession(title: string): Promise<{ sessionId: string }> {
  const connection = await ensureDesktopRunnerConnection();
  const client = createLocalRunnerClient(connection);
  const response = await client.ensureAssistantSession({
    model: DEFAULT_OPENCODE_MODEL,
    provider: DEFAULT_OPENCODE_PROVIDER,
    taskTitle: title,
  });

  return { sessionId: response.sessionId };
}
