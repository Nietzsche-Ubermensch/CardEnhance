import { useState, type FormEvent } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { PageShell } from "@/components/studio/app-nav";
import { PageError, PagePending } from "@/components/studio/page-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Toaster } from "@/components/ui/sonner";
import { checkConnectors, type ConnectorStatus } from "@/lib/connectors/status";
import { listStoredCards } from "@/lib/connectors/persist";
import { testNotify } from "@/lib/connectors/notify";

export const Route = createFileRoute("/connectors")({
  loader: async () => {
    const [status, cards] = await Promise.all([checkConnectors(), listStoredCards()]);
    return { status, count: cards.length };
  },
  pendingComponent: () => (
    <PageShell current="/connectors">
      <PagePending label="Checking connectors" />
    </PageShell>
  ),
  errorComponent: ({ error }) => (
    <PageShell current="/connectors">
      <PageError message={error.message} />
    </PageShell>
  ),
  component: ConnectorsPage,
});

const LABELS: { key: string; title: string; detail: string }[] = [
  { key: "xai", title: "xAI", detail: "Vision OCR fallback. Uses injected XAI_API_KEY." },
  { key: "neon", title: "Database", detail: "Neon when DATABASE_URL is set, otherwise in-process PGLite." },
  { key: "huggingface", title: "Hugging Face", detail: "PaddleOCR-VL via HF_TOKEN or HF_SPACE_URL." },
  { key: "slack", title: "Slack", detail: "Needs SLACK_BOT_TOKEN and SLACK_CHANNEL." },
  { key: "telegram", title: "Telegram", detail: "Needs TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID." },
];

function ConnectorsPage() {
  const { status, count } = Route.useLoaderData();
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ slack: string; telegram: string } | null>(null);

  const onTest = async (e: FormEvent) => {
    e.preventDefault();
    const cardName = name.trim();
    if (!cardName) {
      setError("Enter a card name to send.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      const next = await testNotify({ data: { cardName } });
      setResult(next);
      toast.success(`Slack ${next.slack} · Telegram ${next.telegram}`);
      await router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Notify failed");
    } finally {
      setPending(false);
    }
  };

  return (
    <PageShell current="/connectors">
      <Toaster position="top-right" />
      <div>
        <h1 className="font-display text-2xl">Connectors</h1>
        <p className="text-sm text-muted">
          Live status from this process. {count} cards in{" "}
          <Link to="/library" className="text-accent hover:underline">
            library
          </Link>
          .
        </p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {LABELS.map((item) => (
          <li key={item.key} className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-medium">{item.title}</h2>
              <StatusBadge value={status[item.key] ?? "disconnected"} />
            </div>
            <p className="mt-2 text-sm text-muted">{item.detail}</p>
          </li>
        ))}
      </ul>

      <form onSubmit={onTest} className="space-y-4 rounded-2xl border border-border bg-surface p-4 sm:p-6">
        <div>
          <h2 className="font-display text-xl">Test notification</h2>
          <p className="text-sm text-muted">
            Writes an audit row. Slack/Telegram send only if those tokens are injected.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="notify-name">Card name</Label>
          <input
            id="notify-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-elevated px-3 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {result ? (
          <p className="text-sm text-muted">
            Slack: {result.slack} · Telegram: {result.telegram}
          </p>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Sending" : "Send test"}
        </Button>
      </form>
    </PageShell>
  );
}

function StatusBadge({ value }: { value: ConnectorStatus }) {
  const label = value;
  if (value === "connected") return <Badge className="bg-emerald-500/15 text-emerald-400">{label}</Badge>;
  if (value === "pglite") return <Badge variant="outline">{label}</Badge>;
  if (value === "error") return <Badge variant="destructive">{label}</Badge>;
  return <Badge variant="outline">{label}</Badge>;
}
