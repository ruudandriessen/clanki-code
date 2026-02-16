import type { Event as OpencodeEvent } from "@opencode-ai/sdk";
import type { AppDb } from "../../db/client";
import type { DurableStreamsEnv } from "../durable-streams";
import { appendTaskEvent } from "../task-run-events";
import { insertAssistantTaskMessage, safeJsonStringify } from "./helpers";

const OPENCODE_SERVER_PORT = 4096;
const MAX_EVENT_STREAM_RETRY_ATTEMPTS = 4;
const EVENT_STREAM_RETRY_BASE_DELAY_MS = 500;

export type AssistantStreamCapture = {
  textPartsByMessageId: Map<string, Map<string, string>>;
  persistedAssistantMessageIds: Set<string>;
  lastPersistedTaskMessageId: string | null;
  persistedAssistantMessageCount: number;
};

type EventStreamSandbox = {
  containerFetch(
    requestOrUrl: Request | string | URL,
    portOrInit?: number | RequestInit,
    portParam?: number,
  ): Promise<Response>;
};

export function createAssistantStreamCapture(): AssistantStreamCapture {
  return {
    textPartsByMessageId: new Map(),
    persistedAssistantMessageIds: new Set(),
    lastPersistedTaskMessageId: null,
    persistedAssistantMessageCount: 0,
  };
}

export async function streamSessionEvents(args: {
  db: AppDb;
  env: DurableStreamsEnv;
  sandbox: EventStreamSandbox;
  executionId: string;
  taskId: string;
  organizationId: string;
  sessionId: string;
  directory: string;
  signal: AbortSignal;
  capture: AssistantStreamCapture;
}): Promise<void> {
  const {
    db,
    env,
    sandbox,
    executionId,
    taskId,
    organizationId,
    sessionId,
    directory,
    signal,
    capture,
  } = args;

  for (let attempt = 1; attempt <= MAX_EVENT_STREAM_RETRY_ATTEMPTS; attempt++) {
    if (signal.aborted) {
      return;
    }

    try {
      const sawSessionIdle = await consumeSessionEventStream({
        db,
        sandbox,
        executionId,
        taskId,
        organizationId,
        env,
        sessionId,
        directory,
        signal,
        capture,
      });

      if (sawSessionIdle || signal.aborted) {
        return;
      }

      throw new Error("OpenCode event stream ended before session completed");
    } catch (error) {
      if (signal.aborted || isAbortError(error)) {
        return;
      }

      const transient = isTransientNetworkDisconnect(error);
      const hasRemainingAttempts = attempt < MAX_EVENT_STREAM_RETRY_ATTEMPTS;

      if (transient && hasRemainingAttempts) {
        console.warn("OpenCode event stream disconnected; retrying", {
          executionId,
          sessionId,
          attempt,
          message: getStreamErrorMessage(error),
        });
        await sleepWithAbort(EVENT_STREAM_RETRY_BASE_DELAY_MS * Math.max(1, attempt), signal);
        continue;
      }

      console.error("Failed to subscribe to OpenCode event stream", {
        executionId,
        sessionId,
        message: getStreamErrorMessage(error),
      });

      return;
    }
  }
}

// ---------------------------------------------------------------------------
// SSE consumer
// ---------------------------------------------------------------------------

async function consumeSessionEventStream(args: {
  db: AppDb;
  env: DurableStreamsEnv;
  sandbox: EventStreamSandbox;
  executionId: string;
  taskId: string;
  organizationId: string;
  sessionId: string;
  directory: string;
  signal: AbortSignal;
  capture: AssistantStreamCapture;
}): Promise<boolean> {
  const {
    db,
    env,
    sandbox,
    executionId,
    taskId,
    organizationId,
    sessionId,
    directory,
    signal,
    capture,
  } = args;

  const query = new URLSearchParams({ directory }).toString();
  const url = `https://sandbox/event${query.length > 0 ? `?${query}` : ""}`;

  const response = await sandbox.containerFetch(
    url,
    {
      method: "GET",
      headers: {
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
      },
    },
    OPENCODE_SERVER_PORT,
  );

  if (!response.ok) {
    const details = (await response.text()).trim();
    throw new Error(
      `OpenCode /event failed (${response.status} ${response.statusText})${
        details.length > 0 ? `: ${details}` : ""
      }`,
    );
  }

  if (!response.body) {
    throw new Error("OpenCode /event returned no response body");
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  const onAbort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", onAbort);
  let buffer = "";

  try {
    while (true) {
      if (signal.aborted) {
        return false;
      }

      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += value;
      const chunks = buffer.split(/\r?\n\r?\n/);
      buffer = chunks.pop() ?? "";

      for (const chunk of chunks) {
        const parsed = parseSseEventData(chunk);
        if (!isOpencodeEvent(parsed)) {
          continue;
        }
        if (!eventBelongsToSession(parsed, sessionId)) {
          continue;
        }

        collectAssistantTextPart(parsed, capture);
        if (isCompletedAssistantMessageEvent(parsed)) {
          const completedMessageId = getMessageIdFromEvent(parsed);
          const persistedTaskMessageId =
            completedMessageId === null
              ? null
              : await persistCompletedAssistantMessage({
                  db,
                  env,
                  executionId,
                  taskId,
                  organizationId,
                  opencodeMessageId: completedMessageId,
                  capture,
                });

          console.info("OpenCode assistant message completed", {
            executionId,
            sessionId,
            messageId: completedMessageId,
            persistedTaskMessageId,
          });
        }
        await appendTaskEvent({
          env,
          executionId,
          taskId,
          organizationId,
          kind: `opencode.${parsed.type}`,
          payload: safeJsonStringify(parsed),
        });

        if (isSessionIdleEvent(parsed, sessionId)) {
          return true;
        }
      }
    }

    return false;
  } finally {
    signal.removeEventListener("abort", onAbort);
    try {
      await reader.cancel();
    } catch {}
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Assistant message persistence
// ---------------------------------------------------------------------------

async function persistCompletedAssistantMessage(args: {
  db: AppDb;
  env: DurableStreamsEnv;
  executionId: string;
  taskId: string;
  organizationId: string;
  opencodeMessageId: string;
  capture: AssistantStreamCapture;
}): Promise<string | null> {
  const { db, env, executionId, taskId, organizationId, opencodeMessageId, capture } = args;

  if (capture.persistedAssistantMessageIds.has(opencodeMessageId)) {
    return null;
  }

  const content = getAssistantTextForMessage(capture, opencodeMessageId);
  if (!content) {
    return null;
  }

  const taskMessageId = await insertAssistantTaskMessage({
    db,
    organizationId,
    taskId,
    content,
  });
  capture.persistedAssistantMessageIds.add(opencodeMessageId);
  capture.lastPersistedTaskMessageId = taskMessageId;
  capture.persistedAssistantMessageCount += 1;

  await appendTaskEvent({
    env,
    executionId,
    taskId,
    organizationId,
    kind: "assistant",
    payload: content,
  });
  return taskMessageId;
}

// ---------------------------------------------------------------------------
// Event helpers
// ---------------------------------------------------------------------------

function collectAssistantTextPart(event: OpencodeEvent, capture: AssistantStreamCapture): void {
  if (event.type !== "message.part.updated") {
    return;
  }

  const properties = toRecord(event.properties);
  const part = toRecord(properties?.part);
  if (!part || toStringOrNull(part.type) !== "text") {
    return;
  }

  const messageId = toStringOrNull(part.messageID);
  const partId = toStringOrNull(part.id);
  if (!messageId || !partId) {
    return;
  }

  const text = toStringOrNull(part.text) ?? "";
  const parts = capture.textPartsByMessageId.get(messageId) ?? new Map<string, string>();
  parts.set(partId, text);
  capture.textPartsByMessageId.set(messageId, parts);
}

function getAssistantTextForMessage(
  capture: AssistantStreamCapture,
  opencodeMessageId: string,
): string | null {
  const parts = capture.textPartsByMessageId.get(opencodeMessageId);
  if (!parts) {
    return null;
  }

  const text = Array.from(parts.values()).join("").trim();
  return text.length > 0 ? text : null;
}

function isOpencodeEvent(value: unknown): value is OpencodeEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (!("type" in value) || typeof value.type !== "string") {
    return false;
  }

  return "properties" in value;
}

function eventBelongsToSession(event: OpencodeEvent, sessionId: string): boolean {
  return extractEventSessionId(event) === sessionId;
}

function isSessionIdleEvent(event: OpencodeEvent, sessionId: string): boolean {
  if (event.type !== "session.idle") {
    return false;
  }

  return extractEventSessionId(event) === sessionId;
}

function isCompletedAssistantMessageEvent(event: OpencodeEvent): boolean {
  if (event.type !== "message.updated") {
    return false;
  }

  const properties = toRecord(event.properties);
  const info = toRecord(properties?.info);
  if (!info) {
    return false;
  }

  if (toStringOrNull(info.role) !== "assistant") {
    return false;
  }

  const time = toRecord(info.time);
  return typeof time?.completed === "number";
}

function getMessageIdFromEvent(event: OpencodeEvent): string | null {
  const properties = toRecord(event.properties);
  const info = toRecord(properties?.info);
  return toStringOrNull(info?.id);
}

function extractEventSessionId(event: OpencodeEvent): string | null {
  const properties = toRecord(event.properties);
  if (!properties) {
    return null;
  }

  const directSessionId = toStringOrNull(properties.sessionID);
  if (directSessionId) {
    return directSessionId;
  }

  const info = toRecord(properties.info);
  const infoSessionId = toStringOrNull(info?.sessionID);
  if (infoSessionId) {
    return infoSessionId;
  }
  if (event.type.startsWith("session.")) {
    const infoId = toStringOrNull(info?.id);
    if (infoId) {
      return infoId;
    }
  }

  const part = toRecord(properties.part);
  const partSessionId = toStringOrNull(part?.sessionID);
  if (partSessionId) {
    return partSessionId;
  }

  return null;
}

// ---------------------------------------------------------------------------
// SSE parsing
// ---------------------------------------------------------------------------

function parseSseEventData(chunk: string): unknown {
  const lines = chunk.split(/\r?\n/);
  const dataLines: string[] = [];

  for (const line of lines) {
    if (!line.startsWith("data:")) {
      continue;
    }
    dataLines.push(line.replace(/^data:\s?/, ""));
  }

  if (dataLines.length === 0) {
    return null;
  }

  const data = dataLines.join("\n").trim();
  if (data.length === 0 || data === "[DONE]") {
    return null;
  }

  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getStreamErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Unknown error";
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function isTransientNetworkDisconnect(error: unknown): boolean {
  const message = getStreamErrorMessage(error).toLowerCase();
  return (
    message.includes("network connection lost") ||
    message.includes("container suddenly disconnected") ||
    message.includes("stream ended before session completed")
  );
}

async function sleepWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0 || signal.aborted) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeoutId = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timeoutId);
      signal.removeEventListener("abort", onAbort);
      resolve();
    };

    signal.addEventListener("abort", onAbort);
  });
}
