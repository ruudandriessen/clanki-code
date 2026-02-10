import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "@tanstack/react-db";
import { Loader2 } from "lucide-react";
import { projectsCollection } from "../lib/collections";

export function IndexRedirect() {
  const { data: projects, isLoading } = useLiveQuery((q) => q.from({ p: projectsCollection }));
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;

    if (projects && projects.length > 0) {
      navigate({
        to: "/projects/$projectId",
        params: { projectId: projects[0].id },
        replace: true,
      });
    } else {
      navigate({ to: "/settings", replace: true });
    }
  }, [isLoading, projects, navigate]);

  return (
    <div className="flex items-center justify-center h-full text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );
}
