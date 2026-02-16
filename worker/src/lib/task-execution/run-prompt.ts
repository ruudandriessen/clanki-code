import type { Sandbox } from "@cloudflare/sandbox";
import type { AppDb } from "../../db/client";
import type { DurableStreamsEnv } from "../durable-streams";
import { readProviderAuthFromSandbox } from "../opencode-auth";
import type { SupportedOpencodeProvider } from "../opencode";
import { upsertProviderAuthCredential } from "../provider-credentials";
import { getOpenCodeClient } from "../sandbox";
import type { SecretCryptoEnv } from "../secret-crypto";
import { appendTaskEvent } from "../task-run-events";
import { extractTextFromParts, insertAssistantTaskMessage } from "./helpers";
import { createAssistantStreamCapture, streamSessionEvents } from "./stream-events";

export async function runPrompt(args: {
  client: Awaited<ReturnType<typeof getOpenCodeClient>>["client"];
  sandbox: Sandbox;
  sessionId: string;
  prompt: string;
  repoDir: string;
  db: AppDb;
  env: DurableStreamsEnv & SecretCryptoEnv;
  executionId: string;
  taskId: string;
  organizationId: string;
  userId: string;
  provider: SupportedOpencodeProvider;
}): Promise<void> {
  const {
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
    userId,
    provider,
  } = args;

  const streamAbortController = new AbortController();
  const capture = createAssistantStreamCapture();
  const streamPromise = streamSessionEvents({
    db,
    env,
    sandbox,
    executionId,
    taskId,
    organizationId,
    sessionId,
    directory: repoDir,
    signal: streamAbortController.signal,
    capture,
  });

  let response: { parts?: unknown } | undefined;
  try {
    const result = await client.session.prompt({
      path: { id: sessionId },
      body: {
        parts: [{ type: "text", text: prompt }],
      },
    });
    response = result.data;
  } finally {
    streamAbortController.abort();
    await streamPromise;
  }

  // Persist the latest auth payload in case provider refresh tokens rotated.
  try {
    const refreshedAuth = await readProviderAuthFromSandbox(sandbox, provider);
    if (refreshedAuth) {
      await upsertProviderAuthCredential(db, env, userId, provider, refreshedAuth);
    }
  } catch {}

  // If no assistant message was captured from the live stream, persist the
  // response text as a fallback output message.
  const output = extractTextFromParts(response?.parts).trim();
  const assistantOutput = output.length > 0 ? output : "OpenCode completed without text output.";

  if (!capture.lastPersistedTaskMessageId) {
    await insertAssistantTaskMessage({
      db,
      organizationId,
      taskId,
      content: assistantOutput,
    });
    await appendTaskEvent({
      env,
      executionId,
      taskId,
      organizationId,
      kind: "assistant",
      payload: assistantOutput,
    });
  }
}
