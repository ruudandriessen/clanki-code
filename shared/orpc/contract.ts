import { oc } from "@orpc/contract";
import { z } from "zod";

const txidSchema = z.number().int().nonnegative();

const mutationResultSchema = <TData extends z.ZodTypeAny>(data: TData) =>
  z.object({
    data,
    txid: txidSchema.optional(),
  });

export const projectSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string(),
  repoUrl: z.string().nullable(),
  installationId: z.number().nullable(),
  setupCommand: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const installationSchema = z.object({
  installationId: z.number(),
  accountLogin: z.string(),
  accountType: z.string(),
  createdAt: z.number(),
  deletedAt: z.number().nullable(),
  updatedAt: z.number().nullable(),
});

export const gitHubRepoSchema = z.object({
  id: z.number(),
  fullName: z.string(),
  name: z.string(),
  htmlUrl: z.string(),
  private: z.boolean(),
});

export const createProjectInputSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  repoUrl: z.string(),
  installationId: z.number(),
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
});

export const taskSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  projectId: z.string().nullable(),
  title: z.string(),
  status: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const taskMessageSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  role: z.string(),
  content: z.string(),
  createdAt: z.number(),
});

export const taskRunSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  tool: z.string(),
  status: z.string(),
  inputMessageId: z.string().nullable(),
  outputMessageId: z.string().nullable(),
  sandboxId: z.string().nullable(),
  sessionId: z.string().nullable(),
  initiatedByUserId: z.string().nullable(),
  provider: z.string(),
  model: z.string(),
  error: z.string().nullable(),
  startedAt: z.number().nullable(),
  finishedAt: z.number().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const taskStreamEventSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  runId: z.string(),
  kind: z.string(),
  payload: z.string(),
  createdAt: z.number(),
});

export const createTaskInputSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  projectId: z.string(),
  status: z.string().optional(),
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
});

export const createTaskMessageInputSchema = z.object({
  id: z.string().optional(),
  role: z.string(),
  content: z.string(),
  createdAt: z.number().optional(),
});

export const providerCredentialStatusSchema = z.object({
  provider: z.string(),
  configured: z.boolean(),
  authType: z.enum(["api", "oauth", "wellknown"]).nullable(),
  updatedAt: z.number().nullable(),
});

export const providerOauthStartSchema = z.object({
  attemptId: z.string(),
  url: z.string(),
  instructions: z.string(),
  method: z.enum(["auto", "code"]),
  expiresAt: z.number(),
});

export const apiContract = {
  installations: {
    list: oc.output(z.array(installationSchema)),
    repos: oc
      .input(
        z.object({
          installationId: z.number().int(),
        }),
      )
      .output(z.array(gitHubRepoSchema)),
  },
  projects: {
    create: oc
      .input(
        z.object({
          repos: z.array(createProjectInputSchema).min(1),
        }),
      )
      .output(mutationResultSchema(z.array(projectSchema))),
    updateSetupCommand: oc
      .input(
        z.object({
          projectId: z.string(),
          setupCommand: z.string().nullable(),
        }),
      )
      .output(mutationResultSchema(projectSchema)),
  },
  tasks: {
    create: oc.input(createTaskInputSchema).output(mutationResultSchema(taskSchema)),
    update: oc
      .input(
        z.object({
          taskId: z.string(),
          title: z.string(),
        }),
      )
      .output(mutationResultSchema(taskSchema)),
    delete: oc
      .input(
        z.object({
          taskId: z.string(),
        }),
      )
      .output(
        z.object({
          txid: txidSchema.optional(),
        }),
      ),
    createMessage: oc
      .input(
        z.object({
          taskId: z.string(),
          message: createTaskMessageInputSchema,
        }),
      )
      .output(mutationResultSchema(taskMessageSchema)),
    createRun: oc
      .input(
        z.object({
          taskId: z.string(),
          messageId: z.string().optional(),
          provider: z.string().optional(),
          model: z.string().optional(),
        }),
      )
      .output(taskRunSchema),
  },
  settings: {
    getProviderCredentialStatus: oc
      .input(
        z.object({
          provider: z.string(),
        }),
      )
      .output(providerCredentialStatusSchema),
    upsertProviderCredential: oc
      .input(
        z.object({
          provider: z.string(),
          apiKey: z.string(),
        }),
      )
      .output(providerCredentialStatusSchema),
    deleteProviderCredential: oc
      .input(
        z.object({
          provider: z.string(),
        }),
      )
      .output(providerCredentialStatusSchema),
    startProviderOauth: oc
      .input(
        z.object({
          provider: z.string(),
        }),
      )
      .output(providerOauthStartSchema),
    completeProviderOauth: oc
      .input(
        z.object({
          provider: z.string(),
          attemptId: z.string(),
          code: z.string().optional(),
        }),
      )
      .output(providerCredentialStatusSchema),
  },
};

export type Project = z.infer<typeof projectSchema>;
export type Installation = z.infer<typeof installationSchema>;
export type GitHubRepo = z.infer<typeof gitHubRepoSchema>;
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;
export type Task = z.infer<typeof taskSchema>;
export type TaskMessage = z.infer<typeof taskMessageSchema>;
export type TaskRun = z.infer<typeof taskRunSchema>;
export type TaskStreamEvent = z.infer<typeof taskStreamEventSchema>;
export type CreateTaskInput = z.infer<typeof createTaskInputSchema>;
export type CreateTaskMessageInput = z.infer<typeof createTaskMessageInputSchema>;
export type ProviderCredentialStatus = z.infer<typeof providerCredentialStatusSchema>;
export type ProviderOauthStart = z.infer<typeof providerOauthStartSchema>;
