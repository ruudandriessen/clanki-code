import { useEffect, useState } from "react";
import { stream } from "@durable-streams/client";
import type { TaskStreamEvent } from "../../../shared/task-stream-events";
import { getTaskEventStreamUrl } from "./api";

const STREAM_STORAGE_PREFIX = "task-event-stream";
const MAX_PERSISTED_EVENTS = 1_000;

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function appendUniqueEvents(
  previousEvents: TaskStreamEvent[],
  nextEvents: readonly TaskStreamEvent[],
): TaskStreamEvent[] {
  if (nextEvents.length === 0) {
    return previousEvents;
  }

  const seenEventIds = new Set(previousEvents.map((event) => event.id));
  const mergedEvents = [...previousEvents];
  let didAddEvent = false;

  for (const event of nextEvents) {
    if (seenEventIds.has(event.id)) {
      continue;
    }

    seenEventIds.add(event.id);
    mergedEvents.push(event);
    didAddEvent = true;
  }

  return didAddEvent ? mergedEvents : previousEvents;
}

function getTaskStreamStorageKey(taskId: string, streamId: string): string {
  return `${STREAM_STORAGE_PREFIX}:${taskId}:${streamId}`;
}

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

function trimPersistedEvents(events: TaskStreamEvent[]): TaskStreamEvent[] {
  if (events.length <= MAX_PERSISTED_EVENTS) {
    return events;
  }

  return events.slice(events.length - MAX_PERSISTED_EVENTS);
}

function parsePersistedEvents(value: unknown): TaskStreamEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isTaskStreamEvent);
}

function isTaskStreamEvent(value: unknown): value is TaskStreamEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.taskId === "string" &&
    typeof candidate.runId === "string" &&
    typeof candidate.createdAt === "number" &&
    typeof candidate.kind === "string" &&
    typeof candidate.payload === "string"
  );
}

function readPersistedTaskStream(storageKey: string): {
  cursor: string | null;
  events: TaskStreamEvent[];
} {
  if (!canUseStorage()) {
    return { cursor: null, events: [] };
  }

  try {
    const raw = globalThis.localStorage.getItem(storageKey);
    if (!raw) {
      return { cursor: null, events: [] };
    }

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { cursor: null, events: [] };
    }

    const candidate = parsed as Record<string, unknown>;
    const cursor =
      typeof candidate.cursor === "string" && candidate.cursor.length > 0 ? candidate.cursor : null;
    const events = trimPersistedEvents(parsePersistedEvents(candidate.events));
    return { cursor, events };
  } catch {
    return { cursor: null, events: [] };
  }
}

function persistTaskStream(
  storageKey: string,
  cursor: string | null,
  events: TaskStreamEvent[],
): void {
  if (!canUseStorage()) {
    return;
  }

  try {
    globalThis.localStorage.setItem(
      storageKey,
      JSON.stringify({
        cursor,
        events: trimPersistedEvents(events),
      }),
    );
  } catch {
    // Ignore storage failures and keep streaming in-memory.
  }
}

function extractBatchItems(value: unknown): readonly TaskStreamEvent[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  const candidate = value as Record<string, unknown>;
  const parsedItems = parsePersistedEvents(candidate.items);
  return parsedItems;
}

function extractBatchCursor(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.cursor === "string" && candidate.cursor.length > 0) {
    return candidate.cursor;
  }

  return null;
}

interface UseTaskEventStreamArgs {
  taskId: string;
  streamId: string | null;
}

export function useTaskEventStream(args: UseTaskEventStreamArgs): TaskStreamEvent[] {
  const { taskId, streamId } = args;
  const [runEvents, setRunEvents] = useState<TaskStreamEvent[]>([]);

  useEffect(() => {
    if (!streamId) {
      return;
    }

    const storageKey = getTaskStreamStorageKey(taskId, streamId);
    const persisted = readPersistedTaskStream(storageKey);
    let latestCursor = persisted.cursor;
    setRunEvents(persisted.events);

    const abortController = new AbortController();
    const streamUrl = getTaskEventStreamUrl(taskId);

    stream<TaskStreamEvent>({
      url: streamUrl,
      offset: latestCursor ?? "-1",
      live: "sse",
      json: true,
      signal: abortController.signal,
    })
      .then((res) => {
        if (abortController.signal.aborted) {
          return;
        }

        res.subscribeJson((batch) => {
          const items = extractBatchItems(batch);
          const batchCursor = extractBatchCursor(batch);
          if (batchCursor !== null) {
            latestCursor = batchCursor;
          }

          setRunEvents((previousEvents) => {
            const mergedEvents = appendUniqueEvents(previousEvents, items);
            const trimmedEvents = trimPersistedEvents(mergedEvents);
            persistTaskStream(storageKey, latestCursor, trimmedEvents);
            return trimmedEvents;
          });
        });
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) {
          return;
        }

        console.error("Failed to subscribe to task stream", error);
      });

    return () => {
      abortController.abort();
    };
  }, [taskId, streamId]);

  useEffect(() => {
    if (streamId) {
      return;
    }

    setRunEvents([]);
  }, [taskId, streamId]);

  return runEvents;
}
