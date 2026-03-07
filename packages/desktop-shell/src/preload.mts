import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("clankiDesktop", {
  createRunnerSession(title: string, repoUrl: string) {
    return ipcRenderer.invoke("desktop-runner:create-session", { repoUrl, title });
  },
  promptRunnerTask(args: {
    backendBaseUrl: string;
    callbackToken: string;
    directory: string;
    executionId: string;
    prompt: string;
    sessionId: string;
  }) {
    return ipcRenderer.invoke("desktop-runner:prompt-task", args);
  },
});
