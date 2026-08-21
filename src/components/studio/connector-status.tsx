import { useEffect, useState } from "react";
import { checkConnectors, type ConnectorStatus } from "@/lib/connectors/status";
import { cn } from "@/lib/utils";

const LABELS: Record<string, string> = {
  xai: "xAI",
  neon: "DB",
  slack: "Slack",
  huggingface: "HF",
  telegram: "TG",
};

export function ConnectorStatusBar() {
  const [status, setStatus] = useState<Record<string, ConnectorStatus> | null>(null);

  useEffect(() => {
    let live = true;
    checkConnectors()
      .then((next) => {
        if (live) setStatus(next);
      })
      .catch(() => {
        if (live) setStatus({ xai: "disconnected", neon: "error", slack: "disconnected", huggingface: "disconnected", telegram: "disconnected" });
      });
    return () => {
      live = false;
    };
  }, []);

  if (!status) return null;

  return (
    <div className="hidden items-center gap-1.5 sm:flex">
      {Object.entries(LABELS).map(([key, label]) => {
        const value = status[key] ?? "disconnected";
        return (
          <span
            key={key}
            title={`${label}: ${value}`}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase",
              value === "connected" && "border-emerald-500/40 text-emerald-400",
              value === "pglite" && "border-accent/40 text-accent",
              value === "disconnected" && "border-border text-muted",
              value === "error" && "border-destructive/40 text-destructive",
            )}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}
