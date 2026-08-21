import { useEffect, useState } from "react";
import { Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  useBatch,
  computeBatchProgress,
  sourceProgress,
  cardProgress,
  type CardRecord,
  type SourceRecord,
} from "@/lib/batch";

function formatElapsed(ms: number) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

export function BatchProgress() {
  const sources = useBatch((s) => s.sources);
  const cards = useBatch((s) => s.cards);
  const ingestTotal = useBatch((s) => s.ingestTotal);
  const ingestDone = useBatch((s) => s.ingestDone);
  const batchStatus = useBatch((s) => s.batchStatus);
  const activeLabel = useBatch((s) => s.activeLabel);
  const runStartedAt = useBatch((s) => s.runStartedAt);
  const cancel = useBatch((s) => s.cancel);
  const { percent, label, busy } = computeBatchProgress({
    sources,
    cards,
    ingestTotal,
    ingestDone,
    batchStatus,
  });
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!busy || !runStartedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [busy, runStartedAt]);

  if (!sources.length && !cards.length && !busy) return null;

  const completed = cards.filter((c) => c.stage === "completed").length;
  const failed = cards.filter((c) => c.stage === "failed").length;
  const running = cards.filter((c) => !["completed", "failed", "queued"].includes(c.stage)).length;
  const sourceFailed = sources.filter((s) => s.status === "failed").length;

  return (
    <section aria-label="Batch progress" className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl tracking-tight">Batch progress</h2>
          <p className="mt-1 text-sm text-muted">
            <span className="capitalize text-fg">{label}</span>
            {activeLabel ? ` · ${activeLabel}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="font-mono text-2xl tabular-nums text-fg">{percent}%</p>
          {busy ? (
            <Button type="button" size="sm" variant="outline" onClick={cancel}>
              <Square className="size-3.5" />
              Stop
            </Button>
          ) : null}
        </div>
      </div>
      <Progress value={percent} className="mt-4 h-2" />
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Stat label="Sources" value={`${sources.filter((s) => s.status === "completed" || s.status === "failed").length}/${ingestTotal || sources.length}`} />
        <Stat label="Cards" value={`${completed}/${cards.length || 0}`} />
        <Stat label="Running" value={String(running)} />
        <Stat label="Failed" value={String(failed + sourceFailed)} />
      </dl>
      {busy && runStartedAt ? (
        <p className="mt-3 font-mono text-xs text-muted tabular-nums">Elapsed {formatElapsed(now - runStartedAt)}</p>
      ) : null}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-mono text-sm tabular-nums text-fg">{value}</dd>
    </div>
  );
}

export function SourceProgressBar({ source }: { source: SourceRecord }) {
  const value = sourceProgress(source);
  return <Progress value={value} className="mt-2 h-1.5" />;
}

export function CardProgressBar({ card }: { card: CardRecord }) {
  const value = cardProgress(card);
  return <Progress value={value} className="mt-1.5 h-1" />;
}
