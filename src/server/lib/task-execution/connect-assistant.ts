import { eq } from "drizzle-orm";
import type { AppDb } from "../../db/client";
import * as schema from "../../db/schema";
import type { SupportedOpencodeProvider } from "../opencode";
import { toProviderModelRef } from "../opencode";
import { getDecryptedProviderAuth } from "../provider-credentials";
import { getOpenCodeClient, type TaskSandbox } from "../sandbox";
import type { SecretCryptoEnv } from "../secret-crypto";

export async function connectAssistant(args: {
  sandbox: TaskSandbox;
  repoDir: string;
  provider: SupportedOpencodeProvider;
  model: string;
  db: AppDb;
  env: SecretCryptoEnv;
  userId: string;
}) {
  const { sandbox, repoDir, provider, model, db, env, userId } = args;

  const providerAuth = await getDecryptedProviderAuth(db, env, userId, provider);
  if (!providerAuth) {
    throw new Error(`No ${provider} credentials configured. Add them in Settings first.`);
  }

  const { client } = await getOpenCodeClient(sandbox, repoDir, {
    enabled_providers: [provider],
    model: toProviderModelRef(provider, model),
  });

  const authSetResponse = await client.auth.set({
    path: { id: provider },
    body: providerAuth,
  });
  if (!authSetResponse.response.ok) {
    const statusText = authSetResponse.response.statusText.trim();
    const statusInfo =
      statusText.length > 0
        ? `${authSetResponse.response.status} ${statusText}`
        : String(authSetResponse.response.status);
    throw new Error(`Failed to configure OpenCode provider auth (${statusInfo})`);
  }

  return { client };
}

export async function ensureSession(args: {
  client: Awaited<ReturnType<typeof getOpenCodeClient>>["client"];
  directory: string;
  db: AppDb;
  taskId: string;
  taskTitle: string;
  sandboxId: string;
}): Promise<{ sessionId: string; isNewSession: boolean }> {
  const { client, directory, db, taskId, taskTitle, sandboxId } = args;

  const task = await db.query.tasks.findFirst({
    where: eq(schema.tasks.id, taskId),
    columns: { sessionId: true },
  });

  let sessionId = task?.sessionId ?? null;
  let isNewSession = false;

  if (sessionId) {
    try {
      const existing = await client.session.get({
        path: { id: sessionId },
        query: { directory },
      });
      if (!existing.data) {
        sessionId = null;
      }
    } catch {
      sessionId = null;
    }
  }

  if (!sessionId) {
    const createResponse = await client.session.create({
      query: { directory },
      body: { title: taskTitle },
    });

    if (!createResponse.response.ok || !createResponse.data?.id) {
      const statusText = createResponse.response.statusText.trim();
      const statusInfo =
        statusText.length > 0
          ? `${createResponse.response.status} ${statusText}`
          : String(createResponse.response.status);
      throw new Error(`Failed to create OpenCode session (${statusInfo})`);
    }

    sessionId = createResponse.data.id;
    isNewSession = true;
  }

  await db
    .update(schema.tasks)
    .set({ sessionId, sandboxId, updatedAt: Date.now() })
    .where(eq(schema.tasks.id, taskId));

  return { sessionId, isNewSession };
}
