import { createFileRoute } from "@tanstack/react-router";
import { TaskPage } from "@/pages/task-page";

export const Route = createFileRoute("/_layout/tasks/$taskId")({
  component: TaskPage,
});
