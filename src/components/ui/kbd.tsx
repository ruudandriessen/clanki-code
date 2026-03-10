import { formatKeys } from "@/lib/hotkeys";
import { cn } from "@/lib/utils";

export function Kbd({ keys, className }: { keys: string; className?: string }) {
  const parts = formatKeys(keys);
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {parts.map((part) => (
        <kbd
          key={part}
          className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1 font-mono text-[10px] font-medium text-muted-foreground"
        >
          {part}
        </kbd>
      ))}
    </span>
  );
}
