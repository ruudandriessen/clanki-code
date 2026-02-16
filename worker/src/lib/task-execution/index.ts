import type { AppDb } from "../../db/client";
import type { DurableStreamsEnv } from "../durable-streams";
import type { GitHubAppEnv } from "../github";
import type { SupportedOpencodeProvider } from "../opencode";
import type { SandboxEnv } from "../sandbox";
import type { SecretCryptoEnv } from "../secret-crypto";
import { connectAssistant, ensureSession } from "./connect-assistant";
import { completeTask, getErrorMessage, markTaskFailed, markTaskRunning } from "./helpers";
import { prepareSandbox } from "./prepare-sandbox";
import { runPrompt } from "./run-prompt";
import { cloneRepository, runSetupScript, setupGitIdentity, setupGitToken } from "./setup-git";

type TaskExecutionEnv = SandboxEnv & GitHubAppEnv & SecretCryptoEnv & DurableStreamsEnv;

export async function executeTaskPrompt(args: {
  db: AppDb;
  env: TaskExecutionEnv;
  executionId: string;
  taskId: string;
  organizationId: string;
  taskTitle: string;
  prompt: string;
  repoUrl: string;
  installationId: number | null;
  setupCommand: string | null;
  initiatedByUserId: string;
  initiatedByUserName: string;
  initiatedByUserEmail: string;
  provider: SupportedOpencodeProvider;
  model: string;
}): Promise<void> {
  const {
    db,
    env,
    executionId,
    taskId,
    organizationId,
    taskTitle,
    prompt,
    repoUrl,
    installationId,
    setupCommand,
    initiatedByUserId,
    initiatedByUserName,
    initiatedByUserEmail,
    provider,
    model,
  } = args;

  const repoDir = "/home/user/repo";

  try {
    const { sandbox, sandboxId } = prepareSandbox({ env, taskId });
    await markTaskRunning({ db, taskId, sandboxId });

    const gitToken = await setupGitToken({ env, sandbox, installationId });
    const [, { freshClone }] = await Promise.all([
      setupGitIdentity({
        sandbox,
        userId: initiatedByUserId,
        userName: initiatedByUserName,
        userEmail: initiatedByUserEmail,
      }),
      cloneRepository({ sandbox, repoUrl, repoDir, gitToken }),
    ]);
    if (freshClone) {
      await runSetupScript({ sandbox, command: setupCommand, repoDir });
    }

    const { client } = await connectAssistant({
      sandbox,
      repoDir,
      provider,
      model,
      db,
      env,
      userId: initiatedByUserId,
    });
    const sessionId = await ensureSession({ client, db, taskId, taskTitle, sandboxId });

    await runPrompt({
      client,
      sandbox,
      sessionId,
      prompt,
      repoDir,
      db,
      env,
      executionId,
      taskId,
      organizationId,
      userId: initiatedByUserId,
      provider,
    });

    await completeTask({ db, taskId });
  } catch (error) {
    await markTaskFailed({ db, taskId, message: getErrorMessage(error) });
  }
}
