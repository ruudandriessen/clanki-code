import type {
  CreateProjectInput as ContractCreateProjectInput,
  CreateTaskInput as ContractCreateTaskInput,
  GitHubRepo,
  Installation,
  Project,
  ProviderCredentialStatus,
  ProviderOauthStart,
  Task,
  TaskMessage,
  TaskRun,
  TaskStreamEvent,
} from "../../../shared/orpc/contract";
import { apiClient } from "./orpc-client";

export interface MutationResult<T> {
  data: T;
  txid?: number;
}

function toApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (message.length > 0) {
      return message;
    }
  }

  return fallback;
}

async function callApi<T>(operation: Promise<T>, fallbackMessage: string): Promise<T> {
  try {
    return await operation;
  } catch (error) {
    throw new Error(toApiErrorMessage(error, fallbackMessage), { cause: error });
  }
}

export type { Project, Installation, GitHubRepo, Task, TaskMessage, TaskRun, TaskStreamEvent };
export type CreateProjectInput = ContractCreateProjectInput;
export type CreateTaskInput = ContractCreateTaskInput;

export function fetchInstallations() {
  return callApi(apiClient.installations.list(), "Failed to fetch installations");
}

export function fetchInstallationRepos(installationId: number) {
  return callApi(apiClient.installations.repos({ installationId }), "Failed to fetch repositories");
}

export function createProjects(
  repos: Array<CreateProjectInput>,
): Promise<MutationResult<Project[]>> {
  return callApi(apiClient.projects.create({ repos }), "Failed to create projects");
}

export function updateProjectSetupCommand(
  projectId: string,
  setupCommand: string | null,
): Promise<MutationResult<Project>> {
  return callApi(
    apiClient.projects.updateSetupCommand({ projectId, setupCommand }),
    "Failed to update project setup command",
  );
}

export function createTask(input: CreateTaskInput): Promise<MutationResult<Task>> {
  return callApi(apiClient.tasks.create(input), "Failed to create task");
}

export function updateTask(taskId: string, title: string): Promise<MutationResult<Task>> {
  return callApi(apiClient.tasks.update({ taskId, title }), "Failed to update task");
}

export function deleteTask(taskId: string): Promise<{ txid?: number }> {
  return callApi(apiClient.tasks.delete({ taskId }), "Failed to delete task");
}

export function createTaskMessage(
  taskId: string,
  input: {
    id?: string;
    role: string;
    content: string;
    createdAt?: number;
  },
): Promise<MutationResult<TaskMessage>> {
  return callApi(
    apiClient.tasks.createMessage({ taskId, message: input }),
    "Failed to create task message",
  );
}

export function createTaskRun(
  taskId: string,
  messageId?: string,
  options?: { provider?: string; model?: string },
) {
  return callApi(
    apiClient.tasks.createRun({
      taskId,
      messageId,
      provider: options?.provider,
      model: options?.model,
    }),
    "Failed to create task run",
  );
}

export function getTaskEventStreamUrl(taskId: string) {
  return `${globalThis.location.origin}/api/tasks/${taskId}/stream`;
}

export type { ProviderCredentialStatus, ProviderOauthStart };

export function fetchProviderCredentialStatus(provider: string) {
  return callApi(
    apiClient.settings.getProviderCredentialStatus({ provider }),
    "Failed to fetch provider credential status",
  );
}

export function upsertProviderCredential(provider: string, apiKey: string) {
  return callApi(
    apiClient.settings.upsertProviderCredential({ provider, apiKey }),
    "Failed to upsert provider credential",
  );
}

export function deleteProviderCredential(provider: string) {
  return callApi(
    apiClient.settings.deleteProviderCredential({ provider }),
    "Failed to delete provider credential",
  );
}

export function startProviderOauth(provider: string) {
  return callApi(
    apiClient.settings.startProviderOauth({ provider }),
    "Failed to start provider OAuth",
  );
}

export function completeProviderOauth(provider: string, attemptId: string, code?: string) {
  const trimmedCode = code?.trim();
  return callApi(
    apiClient.settings.completeProviderOauth({
      provider,
      attemptId,
      code: trimmedCode && trimmedCode.length > 0 ? trimmedCode : undefined,
    }),
    "Failed to complete provider OAuth",
  );
}
