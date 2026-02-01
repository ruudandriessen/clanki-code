import type { QueueMessage } from "./message";

export async function dispatch(queue: Queue, message: QueueMessage): Promise<void> {
  await queue.send(message);
}
