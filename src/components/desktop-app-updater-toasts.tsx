import { useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  getDesktopAppUpdateState,
  onDesktopAppUpdateStateChange,
  quitAndInstallDesktopAppUpdate,
  type DesktopAppUpdateState,
} from "@/lib/desktop-app-updater";
import { isDesktopApp } from "@/lib/is-desktop-app";

const UPDATE_READY_TOAST_ID = "desktop-app-update-ready";

export function DesktopAppUpdaterToasts() {
  const previousStatusRef = useRef<DesktopAppUpdateState["status"] | null>(null);

  useEffect(() => {
    if (!isDesktopApp()) {
      return;
    }

    let active = true;

    const handleUpdateState = (updateState: DesktopAppUpdateState) => {
      if (!active) {
        return;
      }

      const previousStatus = previousStatusRef.current;
      previousStatusRef.current = updateState.status;

      if (updateState.status === "downloaded" && previousStatus !== "downloaded") {
        toast("Clanki update ready", {
          action: {
            label: "Update Now",
            onClick: () => {
              void quitAndInstallDesktopAppUpdate().catch((error) => {
                toast.error(
                  error instanceof Error ? error.message : "Failed to install the desktop update",
                );
              });
            },
          },
          description: updateState.availableVersion
            ? `Version ${updateState.availableVersion} has been downloaded and is ready to install.`
            : "A new Clanki version has been downloaded and is ready to install.",
          duration: Number.POSITIVE_INFINITY,
          id: UPDATE_READY_TOAST_ID,
        });
        return;
      }

      if (updateState.status !== "downloaded") {
        toast.dismiss(UPDATE_READY_TOAST_ID);
      }
    };

    void getDesktopAppUpdateState()
      .then(handleUpdateState)
      .catch(() => {});

    const unsubscribe = onDesktopAppUpdateStateChange(handleUpdateState);

    return () => {
      active = false;
      toast.dismiss(UPDATE_READY_TOAST_ID);
      unsubscribe();
    };
  }, []);

  return null;
}
