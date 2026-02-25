#!/usr/bin/env node

import { appendFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";

/**
 * Autonomous task runner that executes inside an isolated sandbox VM.
 *
 * Reads configuration from TASK_* environment variables, then:
 * 1. Reads SSE events from the local OpenCode event stream
 * 2. Appends events to Durable Streams (ElectricSQL)
 * 3. Sends heartbeats to the worker
 * 4. Reports local git branch changes to the worker
 * 5. Calls the worker on completion or failure
 */

const OPENCODE_PORT = 4096;
const HEARTBEAT_INTERVAL_MS = 30_000;
const BRANCH_POLL_INTERVAL_MS = 5_000;
const STREAM_CONNECTION_TIMEOUT_MS = 5_000;
const SESSION_COMPLETION_TIMEOUT_MS = 30 * 60 * 1000;
const SESSION_STATUS_POLL_INTERVAL_MS = 2_000;
const DURABLE_STREAMS_BASE_URL = "https://api.electric-sql.cloud";
const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Config from environment
// ---------------------------------------------------------------------------

const requiredEnv = (name) => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
};

const optionalEnv = (name) => process.env[name]?.trim() ?? "";
const taskRunnerLogFile = "/tmp/task-runner.log";
let logFileWriteWarningEmitted = false;

function truncateText(value, maxLength = 500) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...`;
}

function logMeta(config, extra = {}) {
  return { runId: config.runId, taskId: config.taskId, ...extra };
}

function appendFileLog(level, message, meta = {}) {
  try {
    appendFileSync(
      taskRunnerLogFile,
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        message,
        ...meta,
      })}\n`,
      "utf8",
    );
  } catch (error) {
    if (logFileWriteWarningEmitted) return;
    logFileWriteWarningEmitted = true;
    console.warn("task-runner: failed to write log file", {
      logFile: taskRunnerLogFile,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function logWarn(config, message, extra = {}) {
  const meta = logMeta(config, extra);
  appendFileLog("warn", message, meta);
  console.warn(`task-runner: ${message}`, meta);
}

function logError(config, message, extra = {}) {
  const meta = logMeta(config, extra);
  appendFileLog("error", message, meta);
  console.error(`task-runner: ${message}`, meta);
}

async function readResponseText(response) {
  try {
    return truncateText((await response.text()).trim());
  } catch {
    return "";
  }
}

function readConfig() {
  return {
    workerUrl: requiredEnv("TASK_WORKER_URL"),
    callbackToken: requiredEnv("TASK_CALLBACK_TOKEN"),
    taskId: requiredEnv("TASK_ID"),
    runId: requiredEnv("TASK_RUN_ID"),
    orgId: requiredEnv("TASK_ORG_ID"),
    sessionId: requiredEnv("TASK_SESSION_ID"),
    repoDir: requiredEnv("TASK_REPO_DIR"),
    dsServiceId: optionalEnv("TASK_DS_SERVICE_ID"),
    dsSecret: optionalEnv("TASK_DS_SECRET"),
  };
}

// ---------------------------------------------------------------------------
// Durable Streams helpers (plain fetch, no client library)
// ---------------------------------------------------------------------------

function buildStreamUrl(config) {
  if (!config.dsServiceId) return null;

  const streamPath = `org/${encodeURIComponent(config.orgId)}/tasks/${encodeURIComponent(config.taskId)}/events`;
  return `${DURABLE_STREAMS_BASE_URL}/v1/stream/${encodeURIComponent(config.dsServiceId)}/${streamPath}`;
}

function dsHeaders(config) {
  return {
    Authorization: `Bearer ${config.dsSecret}`,
    "Content-Type": "application/json",
  };
}

async function ensureDurableStream(url, config) {
  if (!url) {
    return;
  }

  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: dsHeaders(config),
    });

    // 200 = created, 409 = already exists — both are fine.
    if (!response.ok && response.status !== 409) {
      logWarn(config, "failed to ensure durable stream", {
        status: response.status,
        statusText: response.statusText,
        body: await readResponseText(response),
      });
    }
  } catch (error) {
    logWarn(config, "failed to ensure durable stream", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function appendToDurableStream(url, config, event) {
  if (!url) return;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: dsHeaders(config),
      // Durable Streams JSON protocol: wrap in array.
      body: `[${JSON.stringify(event)}]`,
    });

    if (!response.ok) {
      logWarn(config, "failed to append durable stream event", {
        status: response.status,
        statusText: response.statusText,
        kind: event.kind,
        body: await readResponseText(response),
      });
    }
  } catch (error) {
    logWarn(config, "failed to append durable stream event", {
      kind: event.kind,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ---------------------------------------------------------------------------
// Worker callback helpers
// ---------------------------------------------------------------------------

function callbackHeaders(config) {
  return {
    Authorization: `Bearer ${config.callbackToken}`,
    "Content-Type": "application/json",
  };
}

async function sendHeartbeat(config) {
  try {
    const response = await fetch(
      `${config.workerUrl}/api/internal/task-runs/${config.runId}/heartbeat`,
      {
        method: "POST",
        headers: callbackHeaders(config),
        body: "{}",
      },
    );

    if (!response.ok) {
      logWarn(config, "heartbeat callback failed", {
        status: response.status,
        statusText: response.statusText,
        body: await readResponseText(response),
      });
      return;
    }
  } catch (error) {
    logWarn(config, "heartbeat callback failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function callComplete(config, body = {}) {
  try {
    const response = await fetch(
      `${config.workerUrl}/api/internal/task-runs/${config.runId}/complete`,
      {
        method: "POST",
        headers: callbackHeaders(config),
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      logError(config, "complete callback failed", {
        status: response.status,
        statusText: response.statusText,
        body: await readResponseText(response),
      });
      return;
    }
  } catch (error) {
    logError(config, "complete callback failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function callFail(config, errorMessage) {
  try {
    const response = await fetch(
      `${config.workerUrl}/api/internal/task-runs/${config.runId}/fail`,
      {
        method: "POST",
        headers: callbackHeaders(config),
        body: JSON.stringify({ error: errorMessage }),
      },
    );

    if (!response.ok) {
      logError(config, "fail callback failed", {
        status: response.status,
        statusText: response.statusText,
        body: await readResponseText(response),
      });
      return;
    }
  } catch (error) {
    logError(config, "fail callback failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function callMessage(config, content) {
  try {
    const response = await fetch(
      `${config.workerUrl}/api/internal/task-runs/${config.runId}/message`,
      {
        method: "POST",
        headers: callbackHeaders(config),
        body: JSON.stringify({ content }),
      },
    );

    if (!response.ok) {
      logWarn(config, "message callback failed", {
        status: response.status,
        statusText: response.statusText,
        contentLength: content.length,
        body: await readResponseText(response),
      });
      return false;
    }
    return true;
  } catch (error) {
    logWarn(config, "message callback failed", {
      contentLength: content.length,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function callBranch(config, branch) {
  try {
    const response = await fetch(
      `${config.workerUrl}/api/internal/task-runs/${config.runId}/branch`,
      {
        method: "POST",
        headers: callbackHeaders(config),
        body: JSON.stringify({ branch }),
      },
    );

    if (!response.ok) {
      logWarn(config, "branch callback failed", {
        status: response.status,
        statusText: response.statusText,
        branch,
        body: await readResponseText(response),
      });
      return false;
    }

    return true;
  } catch (error) {
    logWarn(config, "branch callback failed", {
      branch,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function readCurrentGitBranch(repoDir) {
  const { stdout } = await execFileAsync("git", ["-C", repoDir, "branch", "--show-current"], {
    timeout: 3_000,
    maxBuffer: 16 * 1024,
  });

  const branch = stdout.trim();
  return branch.length > 0 ? branch : null;
}

// ---------------------------------------------------------------------------
// SSE parsing (same logic as worker/src/lib/task-execution/stream-events.ts)
// ---------------------------------------------------------------------------

function parseSseEventData(chunk) {
  const lines = chunk.split(/\r?\n/);
  const dataLines = [];

  for (const line of lines) {
    if (!line.startsWith("data:")) continue;
    dataLines.push(line.replace(/^data:\s?/, ""));
  }

  if (dataLines.length === 0) return null;

  const data = dataLines.join("\n").trim();
  if (data.length === 0 || data === "[DONE]") return null;

  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function isOpencodeEvent(value) {
  return (
    value && typeof value === "object" && typeof value.type === "string" && "properties" in value
  );
}

function readPossibleSessionId(container) {
  if (!container || typeof container !== "object") return null;

  if (typeof container.sessionID === "string" && container.sessionID.length > 0) {
    return container.sessionID;
  }

  if (typeof container.sessionId === "string" && container.sessionId.length > 0) {
    return container.sessionId;
  }

  return null;
}

function extractEventSessionId(event) {
  const props = event.properties;
  if (!props || typeof props !== "object") return null;

  const propsSessionId = readPossibleSessionId(props);
  if (propsSessionId) {
    return propsSessionId;
  }

  const info = props.info;
  if (info && typeof info === "object") {
    const infoSessionId = readPossibleSessionId(info);
    if (infoSessionId) {
      return infoSessionId;
    }

    if (event.type.startsWith("session.") && typeof info.id === "string") {
      return info.id;
    }
  }

  const part = props.part;
  if (part && typeof part === "object") {
    const partSessionId = readPossibleSessionId(part);
    if (partSessionId) {
      return partSessionId;
    }
  }

  return null;
}

function isSessionIdleEvent(event, sessionId) {
  if (event.type !== "session.idle") return false;
  const eventSessionId = extractEventSessionId(event);
  return !eventSessionId || eventSessionId === sessionId;
}

function isCompletedAssistantMessageEvent(event) {
  if (event.type !== "message.updated") return false;

  const info = event.properties?.info;
  if (!info || typeof info !== "object") return false;
  if (info.role !== "assistant") return false;

  return typeof info.time?.completed === "number";
}

function getMessageIdFromEvent(event) {
  return event.properties?.info?.id ?? null;
}

// ---------------------------------------------------------------------------
// Assistant text capture (same logic as stream-events.ts)
// ---------------------------------------------------------------------------

function createCapture() {
  return {
    textPartsByMessageId: new Map(),
    persistedMessageIds: new Set(),
    lastPersistedTaskMessageId: null,
  };
}

function collectAssistantTextPart(event, capture) {
  if (event.type !== "message.part.updated") return;

  const part = event.properties?.part;
  if (!part || part.type !== "text") return;
  if (!part.messageID || !part.id) return;

  let parts = capture.textPartsByMessageId.get(part.messageID);
  if (!parts) {
    parts = new Map();
    capture.textPartsByMessageId.set(part.messageID, parts);
  }
  parts.set(part.id, part.text ?? "");
}

function getAssistantTextForMessage(capture, messageId) {
  const parts = capture.textPartsByMessageId.get(messageId);
  if (!parts) return null;

  const text = Array.from(parts.values()).join("").trim();
  return text.length > 0 ? text : null;
}

// ---------------------------------------------------------------------------
// Event stream consumer
// ---------------------------------------------------------------------------

async function consumeEventStream(
  config,
  streamUrl,
  capture,
  signal,
  options = { onConnected: undefined, onConnectionError: undefined },
) {
  const query = new URLSearchParams({ directory: config.repoDir }).toString();
  const url = `http://localhost:${OPENCODE_PORT}/event?${query}`;

  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
      },
      signal,
    });
  } catch (error) {
    options.onConnectionError?.(error);
    throw error;
  }

  if (!response.ok) {
    const error = new Error(`OpenCode /event failed: ${response.status} ${response.statusText}`);
    options.onConnectionError?.(error);
    throw error;
  }

  if (!response.body) {
    const error = new Error("OpenCode /event returned no body");
    options.onConnectionError?.(error);
    throw error;
  }

  options.onConnected?.();

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let eventCount = 0;
  let missingSessionIdEventCount = 0;
  let persistedAssistantMessages = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += value;
      const chunks = buffer.split(/\r?\n\r?\n/);
      buffer = chunks.pop() ?? "";

      for (const chunk of chunks) {
        const parsed = parseSseEventData(chunk);
        if (!isOpencodeEvent(parsed)) continue;
        const eventSessionId = extractEventSessionId(parsed);
        if (!eventSessionId) {
          missingSessionIdEventCount++;
        }

        eventCount++;

        // Collect assistant text parts for message persistence.
        collectAssistantTextPart(parsed, capture);

        // Persist completed assistant messages via worker callback.
        if (isCompletedAssistantMessageEvent(parsed)) {
          const messageId = getMessageIdFromEvent(parsed);
          if (messageId && !capture.persistedMessageIds.has(messageId)) {
            const content = getAssistantTextForMessage(capture, messageId);
            if (content) {
              const persisted = await callMessage(config, content);
              if (persisted) {
                capture.persistedMessageIds.add(messageId);
                capture.lastPersistedTaskMessageId = messageId;
                persistedAssistantMessages++;
              } else {
                logWarn(config, "assistant message persist failed", {
                  messageId,
                  contentLength: content.length,
                });
              }
            }
          }
        }

        // Append event to Durable Streams.
        const streamEvent = {
          id: crypto.randomUUID(),
          taskId: config.taskId,
          runId: config.runId,
          kind: `opencode.${parsed.type}`,
          payload: JSON.stringify(parsed),
          createdAt: Date.now(),
        };
        await appendToDurableStream(streamUrl, config, streamEvent);

        // Check for session completion.
        if (isSessionIdleEvent(parsed, config.sessionId)) {
          return true;
        }
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {}
    reader.releaseLock();
  }

  logWarn(config, "event stream ended without session idle", {
    eventCount,
    missingSessionIdEventCount,
    persistedAssistantMessages,
  });
  return false;
}

async function getSessionStatus(config) {
  const query = new URLSearchParams({ directory: config.repoDir }).toString();
  const response = await fetch(`http://localhost:${OPENCODE_PORT}/session/status?${query}`);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `OpenCode status failed: ${response.status} ${response.statusText}${body ? `: ${truncateText(body)}` : ""}`,
    );
  }

  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const statusForSession = payload[config.sessionId];
  if (statusForSession && typeof statusForSession === "object") {
    return statusForSession;
  }

  return null;
}

function getSessionStatusType(status) {
  if (!status || typeof status !== "object") {
    return "unknown";
  }

  return typeof status.type === "string" ? status.type : "unknown";
}

async function waitForSessionIdle(config, timeoutMs = SESSION_COMPLETION_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let lastStatusType = "unknown";

  while (Date.now() < deadline) {
    try {
      const status = await getSessionStatus(config);
      const statusType = getSessionStatusType(status);
      lastStatusType = statusType;
      if (statusType === "idle") {
        return;
      }
    } catch (error) {
      logWarn(config, "failed to read session status", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    await sleep(SESSION_STATUS_POLL_INTERVAL_MS);
  }

  throw new Error(
    `Timed out waiting for OpenCode session to become idle (last status: ${lastStatusType})`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const config = readConfig();

  // Set up Durable Streams.
  const streamUrl = buildStreamUrl(config);
  await ensureDurableStream(streamUrl, config);

  // Start heartbeat interval.
  const heartbeatTimer = setInterval(() => {
    sendHeartbeat(config).catch((error) => {
      logWarn(config, "heartbeat timer tick failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, HEARTBEAT_INTERVAL_MS);

  let lastReportedBranch;
  let gitBranchReadFailureLogged = false;
  const syncBranch = async () => {
    let currentBranch;
    try {
      currentBranch = await readCurrentGitBranch(config.repoDir);
      gitBranchReadFailureLogged = false;
    } catch (error) {
      if (!gitBranchReadFailureLogged) {
        gitBranchReadFailureLogged = true;
        logWarn(config, "failed to read git branch", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (currentBranch === lastReportedBranch) {
      return;
    }

    const updated = await callBranch(config, currentBranch);
    if (updated) {
      lastReportedBranch = currentBranch;
    }
  };

  await syncBranch();
  const branchWatcherTimer = setInterval(() => {
    syncBranch().catch((error) => {
      logWarn(config, "branch watcher tick failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, BRANCH_POLL_INTERVAL_MS);

  const capture = createCapture();
  const streamAbortController = new AbortController();

  try {
    let settleStreamConnection = null;
    const streamConnected = new Promise((resolve, reject) => {
      let settled = false;
      settleStreamConnection = {
        connected: () => {
          if (settled) return;
          settled = true;
          resolve(true);
        },
        failed: (error) => {
          if (settled) return;
          settled = true;
          reject(error);
        },
      };
    });

    // Connect stream first to avoid missing early session events.
    const streamPromise = consumeEventStream(
      config,
      streamUrl,
      capture,
      streamAbortController.signal,
      {
        onConnected: () => settleStreamConnection?.connected(),
        onConnectionError: (error) => settleStreamConnection?.failed(error),
      },
    ).catch((error) => {
      logWarn(config, "event stream failed; falling back to prompt-only completion", {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    });

    try {
      await Promise.race([
        streamConnected,
        new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error("Timed out waiting for opencode event stream connection"));
          }, STREAM_CONNECTION_TIMEOUT_MS);
        }),
      ]);
    } catch (error) {
      logWarn(config, "event stream was not confirmed before prompt dispatch", {
        timeoutMs: STREAM_CONNECTION_TIMEOUT_MS,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const completionResult = await Promise.race([
      streamPromise.then((completed) => ({ source: "stream", completed })),
      waitForSessionIdle(config).then(() => ({ source: "status", completed: true })),
      sleep(SESSION_COMPLETION_TIMEOUT_MS).then(() => ({ source: "timeout", completed: false })),
    ]);

    if (completionResult.source === "timeout") {
      streamAbortController.abort();
      throw new Error(
        `Timed out waiting for OpenCode session completion after ${SESSION_COMPLETION_TIMEOUT_MS}ms`,
      );
    }

    if (completionResult.source === "status") {
      streamAbortController.abort();
      await Promise.race([streamPromise, sleep(2_000)]);
    } else if (!completionResult.completed) {
      await waitForSessionIdle(config);
    }

    // Persist fallback assistant output if no message was captured from stream.
    let assistantOutput = undefined;
    if (!capture.lastPersistedTaskMessageId) {
      assistantOutput = "OpenCode completed without streamed assistant output.";
    }
    await callComplete(config, { assistantOutput });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError(config, "failed", { error: message });
    await callFail(config, message);
  } finally {
    clearInterval(branchWatcherTimer);
    clearInterval(heartbeatTimer);
  }
}

main().catch((error) => {
  appendFileLog("error", "unhandled error", {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  console.error("task-runner: unhandled error", {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
