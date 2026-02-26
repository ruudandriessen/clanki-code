import { createAuth } from "./auth";
import { getDb } from "./db/client";
import { getEnv } from "./env";
import { resolveAuthorizedActiveOrganizationId } from "./lib/active-organization";
import { SessionContext } from "./middleware";
import { toSessionErrorResponse } from "./session-error-response";

/**
 * Standalone session helper for API routes (not server functions).
 * Returns the session context or throws a 401 Response.
 */
export async function requireSession(request: Request): Promise<SessionContext> {
  const env = getEnv();
  const db = getDb(env);
  const auth = createAuth(env, request);
  let result: Awaited<ReturnType<typeof auth.api.getSession>>;
  try {
    result = await auth.api.getSession({ headers: request.headers });
  } catch (error) {
    throw toSessionErrorResponse(error);
  }

  if (!result) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const activeOrganizationId = await resolveAuthorizedActiveOrganizationId({
    db,
    userId: result.session.userId,
    activeOrganizationId: result.session.activeOrganizationId,
  });

  return {
    session: {
      userId: result.session.userId,
      activeOrganizationId,
    },
    user: {
      id: result.user.id,
      name: result.user.name,
      email: result.user.email,
      image: result.user.image,
    },
  };
}
