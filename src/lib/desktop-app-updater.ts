import { getClankiDesktopBridge, type DesktopAppUpdateState } from "@/lib/clanki-desktop-bridge";

export type { DesktopAppUpdateState };

export async function getDesktopAppUpdateState(): Promise<DesktopAppUpdateState> {
  return await getClankiDesktopBridge().getAppUpdateState();
}

export function onDesktopAppUpdateStateChange(
  listener: (state: DesktopAppUpdateState) => void,
): () => void {
  return getClankiDesktopBridge().onAppUpdateStateChange(listener);
}

export async function quitAndInstallDesktopAppUpdate(): Promise<void> {
  await getClankiDesktopBridge().quitAndInstallAppUpdate();
}
