import { ExternalLink, Loader2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type DeploymentPreviewItem = {
  id: number;
  ref: string;
  environment: string;
  state: string;
  previewUrl: string | null;
  detailsUrl: string | null;
  createdAt: number;
  updatedAt: number;
  isProduction: boolean;
};

interface DeploymentPreviewPaneProps {
  deployments: DeploymentPreviewItem[];
  selectedDeploymentId: number | null;
  loading: boolean;
  loadingError: string | null;
  onSelectDeployment: (deploymentId: number) => void;
  onRefresh: () => void;
}

export function DeploymentPreviewPane({
  deployments,
  selectedDeploymentId,
  loading,
  loadingError,
  onSelectDeployment,
  onRefresh,
}: DeploymentPreviewPaneProps) {
  const selectedDeployment =
    deployments.find((deployment) => deployment.id === selectedDeploymentId) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-border bg-card px-3 py-2">
        <div>
          <p className="text-xs font-semibold tracking-[0.08em] uppercase">Deployments</p>
          <p className="text-xs text-muted-foreground">
            {deployments.length > 0
              ? `${deployments.length} recent deployment${deployments.length === 1 ? "" : "s"}`
              : "No deployments yet"}
          </p>
        </div>
        <Button type="button" variant="outline" size="xs" onClick={onRefresh} disabled={loading}>
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCcw className="h-3.5 w-3.5" />
          )}
          Refresh
        </Button>
      </div>

      {loadingError ? (
        <div className="rounded-[var(--radius-md)] border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {loadingError}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <div className="neo-scroll flex max-h-[14rem] flex-col gap-2 overflow-y-auto rounded-[var(--radius-md)] border border-border bg-card p-2 lg:max-h-none lg:w-72">
          {deployments.map((deployment) => {
            const selected = deployment.id === selectedDeploymentId;
            const statusTone = getStatusClasses(deployment.state);

            return (
              <button
                key={deployment.id}
                type="button"
                onClick={() => onSelectDeployment(deployment.id)}
                className={cn(
                  "rounded-[var(--radius-sm)] border px-2.5 py-2 text-left transition-colors",
                  selected
                    ? "border-foreground/40 bg-accent/70"
                    : "border-border/80 bg-background/60 hover:border-foreground/30 hover:bg-accent/40",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-semibold">{deployment.environment}</span>
                  <span
                    className={cn("rounded border px-1.5 py-0.5 text-[10px] uppercase", statusTone)}
                  >
                    {deployment.state}
                  </span>
                </div>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">{deployment.ref}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Updated {new Date(deployment.updatedAt).toLocaleString()}
                </p>
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden rounded-[var(--radius-md)] border border-border bg-card">
          {selectedDeployment?.previewUrl ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <div>
                  <p className="text-xs font-semibold">
                    {selectedDeployment.environment}
                    {selectedDeployment.isProduction ? " (production)" : ""}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {selectedDeployment.previewUrl}
                  </p>
                </div>
                <Button asChild variant="outline" size="xs">
                  <a href={selectedDeployment.previewUrl} target="_blank" rel="noreferrer">
                    Open
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </Button>
              </div>
              <iframe
                title={`Deployment preview ${selectedDeployment.id}`}
                src={selectedDeployment.previewUrl}
                className="h-full w-full bg-white"
                loading="lazy"
                sandbox="allow-forms allow-modals allow-popups allow-scripts"
              />
            </div>
          ) : selectedDeployment?.detailsUrl ? (
            <div className="flex h-full items-center justify-center px-4 text-center">
              <div className="space-y-2">
                <p className="text-sm">
                  This deployment does not expose an embeddable environment URL.
                </p>
                <Button asChild variant="outline" size="sm">
                  <a href={selectedDeployment.detailsUrl} target="_blank" rel="noreferrer">
                    Open deployment details
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
              Select a deployment with a preview URL.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getStatusClasses(state: string): string {
  const normalized = state.trim().toLowerCase();

  if (normalized === "success") {
    return "border-emerald-300 bg-emerald-100 text-emerald-900";
  }

  if (
    normalized === "failure" ||
    normalized === "error" ||
    normalized === "inactive" ||
    normalized === "cancelled"
  ) {
    return "border-red-300 bg-red-100 text-red-900";
  }

  if (normalized === "queued" || normalized === "in_progress" || normalized === "pending") {
    return "border-amber-300 bg-amber-100 text-amber-900";
  }

  return "border-border bg-card text-muted-foreground";
}
