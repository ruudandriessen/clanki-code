export type OpenCodeEnv = {
  OPENCODE_BASE_URL?: string;
  OPENCODE_SERVER_PASSWORD?: string;
  OPENCODE_SERVER_USERNAME?: string;
  OPENCODE_MODEL?: string;
};

export type OpenCodeMessageResult = {
  assistantMessageId: string | null;
  output: string;
};

export async function createOpenCodeSession(env: OpenCodeEnv, title: string): Promise<string> {
  const response = await requestOpenCode(env, "/session", {
    method: "POST",
    body: JSON.stringify({ title }),
  });

  const payload = (await response.json()) as { id?: unknown };
  if (typeof payload.id !== "string" || payload.id.length === 0) {
    throw new Error("OpenCode returned an invalid session id");
  }

  return payload.id;
}

export async function sendOpenCodeMessage(
  env: OpenCodeEnv,
  sessionId: string,
  prompt: string,
): Promise<OpenCodeMessageResult> {
  const requestBody: Record<string, unknown> = {
    parts: [{ type: "text", text: prompt }],
  };

  const model = parseModelSelector(env.OPENCODE_MODEL);
  if (env.OPENCODE_MODEL && !model) {
    throw new Error(
      'Invalid OPENCODE_MODEL. Use "provider/model" (e.g. "openai/gpt-5.3-codex") or JSON like {"providerID":"openai","modelID":"gpt-5.3-codex"}.',
    );
  }

  if (model) {
    requestBody.model = model;
  }

  const response = await requestOpenCode(env, `/session/${encodeURIComponent(sessionId)}/message`, {
    method: "POST",
    body: JSON.stringify(requestBody),
  });

  const payload = (await response.json()) as Record<string, unknown>;
  const runError = parseAssistantError(payload);
  if (runError) {
    throw new Error(runError);
  }

  const assistantMessageId = parseAssistantMessageId(payload);
  let output = collectText(payload).trim();
  if (output.length === 0 && assistantMessageId) {
    try {
      const assistantMessage = await fetchOpenCodeMessage(env, sessionId, assistantMessageId);
      output = collectText(assistantMessage).trim();
    } catch {}
  }

  return {
    assistantMessageId,
    output: output.length > 0 ? output : "OpenCode completed without text output.",
  };
}

async function fetchOpenCodeMessage(
  env: OpenCodeEnv,
  sessionId: string,
  messageId: string,
): Promise<Record<string, unknown>> {
  const response = await requestOpenCode(
    env,
    `/session/${encodeURIComponent(sessionId)}/message/${encodeURIComponent(messageId)}`,
    { method: "GET" },
  );

  return (await response.json()) as Record<string, unknown>;
}

async function requestOpenCode(
  env: OpenCodeEnv,
  path: string,
  init: RequestInit,
): Promise<Response> {
  const baseUrl = env.OPENCODE_BASE_URL;
  if (!baseUrl) {
    throw new Error("OPENCODE_BASE_URL is not configured");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...getOpenCodeAuthHeader(env),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    const text = body.trim();
    const suffix = text.length > 0 ? `: ${text}` : "";
    throw new Error(`OpenCode request failed (${response.status})${suffix}`);
  }

  return response;
}

function parseModelSelector(
  value: string | undefined,
): { providerID: string; modelID: string } | null {
  if (!value) {
    return null;
  }

  const model = value.trim();
  if (model.length === 0) {
    return null;
  }

  // Supports OPENCODE_MODEL as "provider/model" for compatibility.
  const slashIndex = model.indexOf("/");
  if (slashIndex > 0 && slashIndex < model.length - 1) {
    const providerID = model.slice(0, slashIndex).trim();
    const modelID = model.slice(slashIndex + 1).trim();
    if (providerID.length > 0 && modelID.length > 0) {
      return { providerID, modelID };
    }
  }

  // Supports explicit JSON object, e.g. {"providerID":"openai","modelID":"gpt-5"}.
  if (model.startsWith("{")) {
    try {
      const parsed = JSON.parse(model) as Record<string, unknown>;
      const providerID = parsed.providerID;
      const modelID = parsed.modelID;
      if (typeof providerID === "string" && typeof modelID === "string") {
        return { providerID, modelID };
      }
    } catch {
      return null;
    }
  }

  return null;
}

function getOpenCodeAuthHeader(env: OpenCodeEnv): Record<string, string> {
  const password = env.OPENCODE_SERVER_PASSWORD;
  if (!password) {
    return {};
  }

  const username = env.OPENCODE_SERVER_USERNAME ?? "opencode";
  return {
    Authorization: `Basic ${btoa(`${username}:${password}`)}`,
  };
}

function parseAssistantMessageId(payload: Record<string, unknown>): string | null {
  const info = payload.info;
  if (!info || typeof info !== "object") {
    return null;
  }

  const id = (info as Record<string, unknown>).id;
  if (typeof id !== "string" || id.length === 0) {
    return null;
  }

  return id;
}

function parseAssistantError(payload: Record<string, unknown>): string | null {
  const info = payload.info;
  if (!info || typeof info !== "object") {
    return null;
  }

  const error = (info as Record<string, unknown>).error;
  if (!error || typeof error !== "object") {
    return null;
  }

  const errorRecord = error as Record<string, unknown>;
  const data = errorRecord.data;
  if (data && typeof data === "object") {
    const message = (data as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim().length > 0) {
      return `OpenCode assistant failed: ${message}`;
    }
  }

  const message = errorRecord.message;
  if (typeof message === "string" && message.trim().length > 0) {
    return `OpenCode assistant failed: ${message}`;
  }

  return "OpenCode assistant failed with an unknown error.";
}

function collectText(payload: Record<string, unknown>): string {
  const chunks: string[] = [];
  collectTextRecursive(payload.parts, chunks);
  return chunks.join("\n\n");
}

function collectTextRecursive(value: unknown, chunks: string[]): void {
  if (!value) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectTextRecursive(item, chunks);
    }
    return;
  }

  if (typeof value !== "object") {
    return;
  }

  const record = value as Record<string, unknown>;
  const text = record.text;
  if (typeof text === "string" && text.trim().length > 0) {
    chunks.push(text.trim());
  }

  if ("parts" in record) {
    collectTextRecursive(record.parts, chunks);
  }
}
