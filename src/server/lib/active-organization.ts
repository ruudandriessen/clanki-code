import { and, eq } from "drizzle-orm";
import type { AppDb } from "@/server/db/client";
import * as schema from "@/server/db/schema";

export async function resolveAuthorizedActiveOrganizationId(args: {
  db: AppDb;
  userId: string;
  activeOrganizationId: string | null | undefined;
}): Promise<string | null> {
  const activeOrganizationId = args.activeOrganizationId ?? null;
  if (!activeOrganizationId) {
    return null;
  }

  const membership = await args.db.query.member.findFirst({
    where: and(
      eq(schema.member.userId, args.userId),
      eq(schema.member.organizationId, activeOrganizationId),
    ),
    columns: { id: true },
  });

  return membership ? activeOrganizationId : null;
}
