import { useState, type ComponentProps } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "@tanstack/react-db";
import { useHotkey } from "@tanstack/react-hotkeys";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { projectsCollection, tasksCollection } from "@/lib/collections";
import { createDesktopRunnerSession, runDesktopWorkspaceSetup } from "@/lib/desktop-runner";
import { hotkeys } from "@/lib/hotkeys";

type ButtonProps = ComponentProps<typeof Button>;

type NewTaskButtonProps = Omit<ButtonProps, "children" | "disabled" | "onClick"> & {
  iconOnly?: boolean;
};

export function NewTaskButton({ iconOnly = false, ...props }: NewTaskButtonProps) {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const { data: projects } = useLiveQuery((query) =>
    query.from({ p: projectsCollection }).orderBy(({ p }) => p.created_at, "asc"),
  );

  const [defaultProject] = projects;

  useHotkey(hotkeys.newTask.keys, () => handleNewTask());

  function handleNewTask() {
    const repoUrl = defaultProject?.repo_url;
    const setupCommand = defaultProject?.setup_command?.trim() ?? "";
    if (creating || !defaultProject || !repoUrl) {
      return;
    }

    setCreating(true);

    const taskTitle = "New task";
    const now = Date.now();
    const taskId = crypto.randomUUID();
    tasksCollection.insert({
      id: taskId,
      organization_id: defaultProject.organization_id,
      project_id: defaultProject.id,
      title: taskTitle,
      status: "open",
      setup_status: "worktree-setup",
      stream_id: null,
      branch: null,
      runner_type: null,
      runner_session_id: null,
      workspace_path: null,
      error: null,
      created_at: BigInt(now),
      updated_at: BigInt(now),
    });

    navigate({ to: "/tasks/$taskId", params: { taskId } });
    setCreating(false);

    createDesktopRunnerSession(taskTitle, repoUrl)
      .then(async (response) => {
        tasksCollection.update(taskId, (draft) => {
          draft.runner_type = response.runnerType;
          draft.runner_session_id = response.sessionId;
          draft.workspace_path = response.workspaceDirectory;
          draft.setup_status = setupCommand.length > 0 ? "installing" : "ready";
        });

        if (setupCommand.length === 0) {
          return;
        }

        await runDesktopWorkspaceSetup({
          setupCommand,
          workspaceDirectory: response.workspaceDirectory,
        });

        tasksCollection.update(taskId, (draft) => {
          draft.setup_status = "ready";
        });
      })
      .catch((err) => {
        tasksCollection.update(taskId, (draft) => {
          draft.error = err instanceof Error ? err.message : "Failed to create workspace";
        });
      });
  }

  const icon = creating ? (
    <Loader2 className="w-3.5 h-3.5 animate-spin" />
  ) : (
    <Plus className="w-3.5 h-3.5" />
  );

  const button = (
    <Button
      type="button"
      disabled={creating || !defaultProject}
      onClick={() => handleNewTask()}
      {...props}
    >
      {icon}
      {iconOnly ? null : (
        <>
          <span>New task</span>
          <Kbd keys={hotkeys.newTask.keys} />
        </>
      )}
    </Button>
  );

  if (iconOnly) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>
          <span className="flex items-center gap-2">
            {hotkeys.newTask.label}
            <Kbd keys={hotkeys.newTask.keys} />
          </span>
        </TooltipContent>
      </Tooltip>
    );
  }

  return button;
}
