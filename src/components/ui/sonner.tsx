import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useTheme } from "@/components/theme-provider";

export function Toaster(props: ToasterProps) {
  const { theme } = useTheme();

  return (
    <Sonner
      closeButton
      position="top-right"
      theme={theme}
      toastOptions={{
        classNames: {
          actionButton:
            "border border-border bg-primary text-primary-foreground shadow-[2px_2px_0_0_var(--color-border)]",
          cancelButton:
            "border border-border bg-secondary text-secondary-foreground shadow-[2px_2px_0_0_var(--color-border)]",
          description: "text-sm text-muted-foreground",
          toast:
            "group border border-border bg-card text-card-foreground shadow-[3px_3px_0_0_var(--color-border)]",
          title: "font-bold tracking-[0.02em]",
        },
      }}
      {...props}
    />
  );
}
