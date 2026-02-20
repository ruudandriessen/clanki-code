import { useEffect, useRef, useState } from "react";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { cn } from "../lib/utils";
import { useSession } from "../lib/auth-client";
import { MobileHeader } from "./layout/mobile-header";
import { Sidebar } from "./layout/sidebar";

const EDGE_THRESHOLD = 30; // px from left edge to start swipe
const SWIPE_MIN_DISTANCE = 50; // minimum horizontal swipe distance to trigger

export function Layout() {
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const sidebarOpenRef = useRef(sidebarOpen);
  sidebarOpenRef.current = sidebarOpen;

  useEffect(() => {
    if (!isPending && !session) {
      navigate({ to: "/login" });
    }
  }, [isPending, session, navigate]);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Intercept left-edge swipe on mobile to open sidebar instead of browser back
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let isEdgeSwipe = false;

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      isEdgeSwipe = startX < EDGE_THRESHOLD && !sidebarOpenRef.current;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isEdgeSwipe) return;
      // Prevent the browser's back-swipe gesture from firing
      e.preventDefault();
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!isEdgeSwipe) return;
      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = Math.abs(touch.clientY - startY);
      if (deltaX > SWIPE_MIN_DISTANCE && deltaX > deltaY) {
        setSidebarOpen(true);
      }
      isEdgeSwipe = false;
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
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
    <div className="neo-enter flex h-dvh bg-background text-foreground">
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
          "fixed inset-y-0 left-0 z-50 w-full border-r border-border bg-card transition-transform duration-200 ease-in-out",
          "md:relative md:w-64 md:translate-x-0",
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
