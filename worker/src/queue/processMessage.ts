import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/schema";
import type { QueueMessage } from "./message";
import { processPrMergedJob } from "./messages/prMerged";

export async function processQueueMessage(
  message: QueueMessage,
  db: DrizzleD1Database<typeof schema>,
): Promise<void> {
  switch (message.type) {
    case "pr_merged": {
      await processPrMergedJob(message, db);
      break;
    }
  }
}
