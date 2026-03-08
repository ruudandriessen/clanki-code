import { app, BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";

const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const UPDATE_STATE_CHANNEL = "app-updater:state-changed";

export type AppUpdateState = {
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

type AppUpdaterController = {
  getState: () => AppUpdateState;
  quitAndInstall: () => void;
  start: () => void;
  stop: () => void;
};

export function createAppUpdaterController(): AppUpdaterController {
  let checkForUpdatesPromise: Promise<AppUpdateState> | null = null;
  let hasStarted = false;
  let intervalId: NodeJS.Timeout | null = null;
  let state: AppUpdateState = {
    availableVersion: null,
    currentVersion: app.getVersion(),
    status: app.isPackaged ? "idle" : "unavailable",
  };

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = app.getVersion().includes("-");

  autoUpdater.on("checking-for-update", () => {
    updateState({
      status: "checking",
    });
  });

  autoUpdater.on("update-available", (info) => {
    updateState({
      availableVersion: info.version,
      status: "update-available",
    });
  });

  autoUpdater.on("download-progress", () => {
    updateState({
      status: "downloading",
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    updateState({
      availableVersion: info.version,
      status: "downloaded",
    });
  });

  autoUpdater.on("update-not-available", () => {
    updateState({
      availableVersion: null,
      status: "up-to-date",
    });
  });

  autoUpdater.on("error", () => {
    updateState({
      status: "error",
    });
  });

  function start(): void {
    if (hasStarted) {
      return;
    }

    hasStarted = true;

    if (!app.isPackaged) {
      broadcastState();
      return;
    }

    void checkForUpdates();
    intervalId = setInterval(() => {
      void checkForUpdates();
    }, UPDATE_CHECK_INTERVAL_MS);
  }

  async function checkForUpdates(): Promise<AppUpdateState> {
    if (!app.isPackaged) {
      updateState({
        status: "unavailable",
      });
      return state;
    }

    if (checkForUpdatesPromise) {
      return await checkForUpdatesPromise;
    }

    checkForUpdatesPromise = autoUpdater
      .checkForUpdates()
      .then(() => state)
      .catch(() => {
        updateState({
          status: "error",
        });
        return state;
      })
      .finally(() => {
        checkForUpdatesPromise = null;
      });

    return await checkForUpdatesPromise;
  }

  function quitAndInstall(): void {
    if (state.status !== "downloaded") {
      throw new Error("No downloaded update is ready to install.");
    }

    autoUpdater.quitAndInstall();
  }

  function getState(): AppUpdateState {
    return state;
  }

  function stop(): void {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function updateState(nextPartialState: Partial<AppUpdateState>): void {
    state = {
      ...state,
      ...nextPartialState,
      currentVersion: app.getVersion(),
    };
    broadcastState();
  }

  function broadcastState(): void {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isDestroyed()) {
        continue;
      }

      window.webContents.send(UPDATE_STATE_CHANNEL, state);
    }
  }

  return {
    getState,
    quitAndInstall,
    start,
    stop,
  };
}
