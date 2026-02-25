import type { EmitterWebhookEvent } from "@octokit/webhooks";

export async function handleDeployment(event: EmitterWebhookEvent<"deployment">): Promise<void> {
  const { action, deployment, repository } = event.payload;

  console.log("Deployment webhook received", {
    action,
    repository: repository.full_name,
    deploymentId: deployment.id,
    ref: deployment.ref,
    environment: deployment.environment,
  });
}
