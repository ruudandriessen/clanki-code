import { useEffect, useState } from "react";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { cn } from "../lib/utils";
import { useSession } from "../lib/auth-client";
import { MobileHeader } from "./layout/mobile-header";
import { Sidebar } from "./layout/sidebar";

export function Layout() {
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!isPending && !session) {
      navigate({ to: "/login" });
    }
  }, [isPending, session, navigate]);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // On iOS, interactive-widget=resizes-content doesn't reliably resize the layout
  // viewport when the virtual keyboard opens. Use visualViewport.height as the
  // source of truth so the layout always fits above the keyboard.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    function updateHeight() {
      document.documentElement.style.setProperty("--app-height", `${viewport!.height}px`);
    }

    viewport.addEventListener("resize", updateHeight);
    viewport.addEventListener("scroll", updateHeight);
    updateHeight();

    return () => {
      viewport.removeEventListener("resize", updateHeight);
      viewport.removeEventListener("scroll", updateHeight);
    };
  }, []);

  if (isPending) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <Loader2 className="h-7 w-7 animate-spin text-foreground" />
      </div>
    );
  }

  if (!session) return null;

  return (
    <div
      className="neo-enter flex bg-background text-foreground"
      style={{ height: "var(--app-height, 100dvh)" }}
    >
      {/* Mobile backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-[rgb(18_18_18_/_0.32)] backdrop-blur-[1px] transition-opacity md:hidden",
          sidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 border-r border-border bg-card transition-transform duration-200 ease-in-out",
          "md:relative md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <MobileHeader onOpenSidebar={() => setSidebarOpen(true)} />

        <main className="flex-1 overflow-hidden neo-scroll">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
