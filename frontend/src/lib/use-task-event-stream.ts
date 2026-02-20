import { useEffect, useState } from "react";
import { stream } from "@durable-streams/client";
import type { TaskStreamEvent } from "../../../shared/task-stream-events";
import { getTaskEventStreamUrl } from "./api";

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

interface UseTaskEventStreamArgs {
  taskId: string;
  streamId: string | null;
}

export function useTaskEventStream(args: UseTaskEventStreamArgs): TaskStreamEvent[] {
  const { taskId, streamId } = args;
  const [runEvents, setRunEvents] = useState<TaskStreamEvent[]>([]);

  useEffect(() => {
    setRunEvents([]);
  }, [taskId, streamId]);

  useEffect(() => {
    if (!streamId) {
      return;
    }

    const abortController = new AbortController();
    const streamUrl = getTaskEventStreamUrl(taskId);

    stream<TaskStreamEvent>({
      url: streamUrl,
      offset: "-1",
      live: "sse",
      json: true,
      signal: abortController.signal,
    })
      .then((res) => {
        if (abortController.signal.aborted) {
          return;
        }

        res.subscribeJson(({ items }) => {
          setRunEvents((previousEvents) => appendUniqueEvents(previousEvents, items));
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

  return runEvents;
}
