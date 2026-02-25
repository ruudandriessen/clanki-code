import type { EmitterWebhookEvent } from "@octokit/webhooks";

export async function handleDeploymentStatus(
  event: EmitterWebhookEvent<"deployment_status">,
): Promise<void> {
  const { action, deployment, deployment_status: status, repository } = event.payload;

  console.log("Deployment status webhook received", {
    action,
    repository: repository.full_name,
    deploymentId: deployment.id,
    state: status.state,
    environmentUrl: status.environment_url ?? null,
    targetUrl: status.target_url ?? null,
  });
}
