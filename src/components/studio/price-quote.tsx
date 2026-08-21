import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatUsd, type PriceQuote } from "@/lib/prices";

export function PriceQuoteView({
  quote,
  status,
  error,
  onRefresh,
}: {
  quote: PriceQuote | null | undefined;
  status?: "idle" | "loading" | "ok" | "empty" | "error";
  error?: string;
  onRefresh: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-elevated p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Market comps</h3>
        <Button type="button" size="sm" variant="outline" onClick={onRefresh}>
          {status === "loading" ? <Loader2 className="size-4 animate-spin" /> : "Refresh"}
        </Button>
      </div>
      {status === "loading" ? <p className="mt-2 text-xs text-muted">Looking up sold comps…</p> : null}
      {status === "error" ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
      {quote ? (
        <>
          <p className="mt-2 font-mono text-xs text-muted">{quote.query || "No query"}</p>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <Stat label="Low" value={formatUsd(quote.low)} />
            <Stat label="Median" value={formatUsd(quote.medianUngraded)} accent />
            <Stat label="High" value={formatUsd(quote.high)} />
          </div>
          {quote.listings.length ? (
            <ul className="mt-3 space-y-2">
              {quote.listings.map((row) => (
                <li key={row.url}>
                  <a
                    href={row.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-lg border border-border px-2 py-1.5 hover:border-accent/50"
                  >
                    <p className="truncate text-sm">{row.title}</p>
                    <p className="truncate text-[11px] text-muted">{row.setName}</p>
                    <p className="mt-0.5 font-mono text-xs">
                      Ungraded {formatUsd(row.ungraded)} · Graded {formatUsd(row.graded)} · Mint {formatUsd(row.mint)}
                    </p>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted">No matching comps. Open eBay sold search.</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <OutLink href={quote.ebaySoldUrl}>eBay sold</OutLink>
            <OutLink href={quote.ebayActiveUrl}>eBay live</OutLink>
            <OutLink href={quote.priceChartingUrl}>PriceCharting</OutLink>
            <OutLink href={quote.sciSearchUrl}>SCI search</OutLink>
          </div>
          {quote.notes.length ? (
            <ul className="mt-3 space-y-1 text-[11px] text-muted">
              {quote.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
        </>
      ) : status !== "loading" ? (
        <p className="mt-2 text-xs text-muted">Prices load after OCR identifies the card.</p>
      ) : null}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-[10px] tracking-wide text-muted uppercase">{label}</p>
      <p className={accent ? "text-lg tabular-nums text-accent" : "text-sm tabular-nums"}>{value}</p>
    </div>
  );
}

function OutLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      className="rounded-lg border border-border px-2 py-1 text-xs hover:border-accent/50"
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  );
}
