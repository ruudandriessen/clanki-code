type CreateDesktopRunnerSessionResponse = {
  runnerType: string;
  sessionId: string;
  workspaceDirectory: string;
};

export type DesktopWorkspaceEditor = "cursor" | "vscode" | "zed";

export type DesktopRunnerModelSelection = {
  model: string;
  provider: string;
};

export type DesktopRunnerModelProvider = {
  id: string;
  models: Record<string, { id: string; name: string }>;
  name: string;
};

export type ListDesktopRunnerModelsResponse = {
  connected: string[];
  default: Record<string, string>;
  providers: DesktopRunnerModelProvider[];
};

export type DesktopAppUpdateState = {
  availableVersion: string | null;
  currentVersion: string;
  status:
    | "checking"
    | "downloaded"
    | "downloading"
    | "error"
    | "idle"
    | "unavailable"
    | "up-to-date"
    | "update-available";
};

export type ClankiDesktopBridge = {
  createRunnerSession: (
    title: string,
    repoUrl: string,
  ) => Promise<CreateDesktopRunnerSessionResponse>;
  deleteRunnerWorkspace: (workspaceDirectory: string) => Promise<void>;
  getAppUpdateState: () => Promise<DesktopAppUpdateState>;
  listRunnerModels: (args: { directory: string }) => Promise<ListDesktopRunnerModelsResponse>;
  onAppUpdateStateChange: (listener: (state: DesktopAppUpdateState) => void) => () => void;
  openWorkspaceInEditor: (args: {
    editor: DesktopWorkspaceEditor;
    workspaceDirectory: string;
  }) => Promise<void>;
  promptRunnerTask: (args: {
    backendBaseUrl: string;
    callbackToken: string;
    directory: string;
    executionId: string;
    model?: string;
    prompt: string;
    provider?: string;
    sessionId: string;
  }) => Promise<void>;
  quitAndInstallAppUpdate: () => Promise<void>;
};

declare global {
  interface Window {
    clankiDesktop?: ClankiDesktopBridge;
  }
}

export function getClankiDesktopBridge(): ClankiDesktopBridge {
  if (typeof window === "undefined" || !window.clankiDesktop) {
    throw new Error("The desktop bridge is only available in the Electron app.");
  }

  return window.clankiDesktop;
}
