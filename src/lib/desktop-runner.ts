import {
  getClankiDesktopBridge,
  type DesktopRunnerModelSelection,
  type DesktopWorkspaceEditor,
  type ListDesktopRunnerModelsResponse,
} from "@/lib/clanki-desktop-bridge";

export type {
  DesktopRunnerModelSelection,
  DesktopWorkspaceEditor,
  ListDesktopRunnerModelsResponse,
};

export async function createDesktopRunnerSession(
  title: string,
  repoUrl: string,
): Promise<{ runnerType: string; sessionId: string; workspaceDirectory: string }> {
  return await getClankiDesktopBridge().createRunnerSession(title, repoUrl);
}

export async function deleteDesktopRunnerWorkspace(workspaceDirectory: string): Promise<void> {
  await getClankiDesktopBridge().deleteRunnerWorkspace(workspaceDirectory);
}

export async function listDesktopRunnerModels(args: {
  directory: string;
}): Promise<ListDesktopRunnerModelsResponse> {
  return await getClankiDesktopBridge().listRunnerModels(args);
}

export async function openDesktopWorkspaceInEditor(args: {
  editor: DesktopWorkspaceEditor;
  workspaceDirectory: string;
}): Promise<void> {
  await getClankiDesktopBridge().openWorkspaceInEditor(args);
}

export async function promptDesktopRunnerTask(args: {
  backendBaseUrl: string;
  callbackToken: string;
  directory: string;
  executionId: string;
  model?: string;
  prompt: string;
  provider?: string;
  sessionId: string;
}): Promise<void> {
  await getClankiDesktopBridge().promptRunnerTask(args);
}
