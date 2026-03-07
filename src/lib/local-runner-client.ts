import type {
  EnsureAssistantSessionRequest,
  EnsureAssistantSessionResponse,
  ListAssistantSessionsResponse,
} from "@/shared/local-runner";
import type { RunnerConnectionPayload } from "@/shared/runner-session";

export function createLocalRunnerClient(connection: RunnerConnectionPayload) {
  const baseUrl = connection.baseUrl.endsWith("/")
    ? connection.baseUrl.slice(0, -1)
    : connection.baseUrl;

  return {
    async ensureAssistantSession(
      body: Omit<EnsureAssistantSessionRequest, "directory">,
    ): Promise<EnsureAssistantSessionResponse> {
      return await postJson<EnsureAssistantSessionResponse>(`${baseUrl}/assistant/session/ensure`, {
        ...body,
        directory: connection.workspaceDirectory,
      } satisfies EnsureAssistantSessionRequest);
    },
    async listAssistantSessions(): Promise<ListAssistantSessionsResponse> {
      return await getJson<ListAssistantSessionsResponse>(
        `${baseUrl}/assistant/sessions?${new URLSearchParams({
          directory: connection.workspaceDirectory,
        }).toString()}`,
      );
    },
  };
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  return await parseJsonResponse<T>(response);
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return await parseJsonResponse<T>(response);
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const body = text.trim().length > 0 ? (JSON.parse(text) as T | { error: string }) : null;

  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : `${response.status} ${response.statusText}`.trim();
    throw new Error(message);
  }

  return body as T;
}
