import { useCallback, useMemo, useRef, useState } from "react";
import {
  Check,
  Download,
  Eraser,
  Image as ImageIcon,
  Loader2,
  Maximize,
  Minus,
  Plus,
  RotateCcw,
  RotateCw,
  Sparkles,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/sonner";
import { FoilField } from "@/components/studio/foil-field";
import { ConnectorStatusBar } from "@/components/studio/connector-status";
import { AppNav } from "@/components/studio/app-nav";
import {
  useBatch,
  cardUrl,
  downloadArtifact,
  identityLabel,
  type ArtifactType,
  type CardRecord,
  type DropPhase,
} from "@/lib/batch";
import { cn } from "@/lib/utils";

const ACCEPT = "image/jpeg,image/png,image/webp,image/bmp,image/tiff,application/zip,.zip";

const LOT = [
  { src: "/samples/mesh/darby-allin-front.jpg", name: "darby-allin-front.jpg" },
  { src: "/samples/mesh/mina-shirakawa-dazzlers.jpg", name: "mina-shirakawa-dazzlers.jpg" },
  { src: "/samples/mesh/chelsea-green-table.jpg", name: "chelsea-green-table.jpg" },
  { src: "/samples/mesh/bret-hart-chrome.jpg", name: "bret-hart-chrome.jpg" },
] as const;

export function StudioApp() {
  const cards = useBatch((s) => s.cards);
  const sources = useBatch((s) => s.sources);
  const dropPhase = useBatch((s) => s.dropPhase);
  const batchStatus = useBatch((s) => s.batchStatus);
  const selectedCardId = useBatch((s) => s.selectedCardId);
  const selected = cards.find((c) => c.id === selectedCardId) ?? cards[0] ?? null;
  const completed = cards.filter((c) => c.stage === "completed").length;
  const failed = cards.filter((c) => c.stage === "failed").length;
  const processing = cards.filter((c) => !["completed", "failed", "queued"].includes(c.stage)).length;
  const selectedCount = cards.filter((c) => c.selected).length;

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-bg text-fg">
      <FoilField />
      <Toaster position="top-right" />
      <div className="relative z-10 flex min-h-dvh flex-col">
        <header className="border-b border-border bg-surface/80">
          <AppNav current="/" />
          <div className="mx-auto flex max-w-7xl items-center justify-end gap-2 px-4 pb-3 sm:px-6">
            <ConnectorStatusBar />
            {completed > 0 ? (
              <Badge variant="outline" className="hidden sm:inline-flex">
                {completed} ready
              </Badge>
            ) : null}
            {processing > 0 ? (
              <Badge variant="outline" className="border-accent/40 text-accent">
                {processing} running
              </Badge>
            ) : null}
            {failed > 0 ? (
              <Badge variant="outline" className="border-destructive/40 text-destructive">
                {failed} failed
              </Badge>
            ) : null}
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-3 py-4 sm:px-6">
          <DropPanel phase={dropPhase} status={batchStatus} sourceCount={sources.length} cardCount={cards.length} />
          {cards.length > 0 ? (
            <>
              <BatchBar
                sources={sources.length}
                cards={cards.length}
                completed={completed}
                failed={failed}
                selectedCount={selectedCount}
              />
              <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
                <CardGrid cards={cards} selectedId={selected?.id ?? null} />
                {selected ? <Workspace card={selected} /> : <EmptyWorkspace />}
              </div>
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function DropPanel({
  phase,
  status,
  sourceCount,
  cardCount,
}: {
  phase: DropPhase;
  status: string;
  sourceCount: number;
  cardCount: number;
}) {
  const addFiles = useBatch((s) => s.addFiles);
  const setDropPhase = useBatch((s) => s.setDropPhase);
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const ingest = useCallback(
    async (list: FileList | File[] | null) => {
      if (!list || list.length === 0) return;
      try {
        await addFiles(Array.from(list));
        toast.success("Batch updated");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      }
    },
    [addFiles],
  );

  const loadNamed = async (items: readonly { src: string; name: string }[]) => {
    const files = await Promise.all(
      items.map(async (s) => {
        const res = await fetch(s.src);
        return new File([await res.blob()], s.name, { type: "image/jpeg" });
      }),
    );
    await ingest(files);
  };

  const label =
    phase === "drag_over"
      ? "Drop to add"
      : phase === "uploading"
        ? "Uploading"
        : phase === "processing"
          ? "Detecting cards"
          : phase === "success"
            ? "Ready"
            : phase === "partial_failure"
              ? "Partial success"
              : phase === "failure"
                ? "Upload failed"
                : "Drop card images or scanner sheets";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload card images"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
        setDropPhase("drag_over");
      }}
      onDragLeave={() => {
        setOver(false);
        setDropPhase(sourceCount ? "success" : "idle");
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void ingest(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "rounded-3xl border border-dashed px-4 py-8 text-center transition-[border-color,background-color] sm:py-10",
        over || phase === "drag_over" ? "border-accent bg-accent/10" : "border-border bg-surface/70",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="sr-only"
        onChange={(e) => {
          void ingest(e.target.files);
          e.currentTarget.value = "";
        }}
      />
      <Upload className="mx-auto size-8 text-accent" />
      <p className="mt-3 font-display text-xl tracking-tight">{label}</p>
      <p className="mt-1 text-sm text-muted">
        One file or a ZIP. Multi-card sheets split automatically. {sourceCount} sources · {cardCount} cards
      </p>
      <p className="mt-1 text-xs text-muted">{status.replaceAll("_", " ")}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2" onClick={(e) => e.stopPropagation()}>
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          Choose files
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => void loadNamed(LOT)}>
          Load sample scans
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={async () => {
            const res = await fetch("/samples/scanner-dump.zip");
            const file = new File([await res.blob()], "scanner-dump.zip", { type: "application/zip" });
            await ingest([file]);
          }}
        >
          70-card dump
        </Button>
      </div>
    </div>
  );
}

function BatchBar({
  sources,
  cards,
  completed,
  failed,
  selectedCount,
}: {
  sources: number;
  cards: number;
  completed: number;
  failed: number;
  selectedCount: number;
}) {
  const settings = useBatch((s) => s.settings);
  const setSettings = useBatch((s) => s.setSettings);
  const selectAll = useBatch((s) => s.selectAll);
  const selectByStage = useBatch((s) => s.selectByStage);
  const processUpscale = useBatch((s) => s.processUpscale);
  const processDescratch = useBatch((s) => s.processDescratch);
  const processCombined = useBatch((s) => s.processCombined);
  const retryCards = useBatch((s) => s.retryCards);
  const exportCards = useBatch((s) => s.exportCards);
  const allCards = useBatch((s) => s.cards);
  const ids = allCards.filter((c) => c.selected).map((c) => c.id);
  const target = ids.length ? ids : allCards.map((c) => c.id);
  const failedIds = allCards.filter((c) => c.stage === "failed").map((c) => c.id);
  const [exportType, setExportType] = useState<ArtifactType>("cropped");

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-muted">
          <span className="text-fg tabular-nums">{sources}</span> sources ·{" "}
          <span className="text-fg tabular-nums">{cards}</span> cards ·{" "}
          <span className="text-fg tabular-nums">{completed}</span> ready
          {failed ? ` · ${failed} failed` : ""}
        </p>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => selectAll(true)}>
            Select all
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => selectByStage("completed")}>
            Select completed
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => selectByStage("failed")}>
            Select failed
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => selectAll(false)}>
            Clear selection
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={() => void processUpscale(target)}>
          <Maximize className="size-4" />
          Upscale {selectedCount || "all"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => void processDescratch(target)}>
          <Eraser className="size-4" />
          Descratch
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => void processCombined(target)}>
          <Sparkles className="size-4" />
          Upscale + descratch
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={!failedIds.length} onClick={() => void retryCards(failedIds)}>
          Retry failed
        </Button>
        <label className="ml-auto flex items-center gap-2 text-xs text-muted">
          Export
          <select
            className="h-10 rounded-lg border border-border bg-elevated px-2 text-fg"
            value={exportType}
            onChange={(e) => setExportType(e.target.value as ArtifactType)}
          >
            <option value="cropped">Rectified</option>
            <option value="upscaled">Upscaled</option>
            <option value="descratched">Descratched</option>
            <option value="upscaled_descratched">Upscaled + descratched</option>
            <option value="original">Original</option>
          </select>
        </label>
        <Button type="button" size="sm" onClick={() => void exportCards(target, exportType)}>
          <Download className="size-4" />
          ZIP
        </Button>
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-muted">
        <label className="flex items-center gap-2">
          Concurrency
          <select
            className="h-10 rounded-lg border border-border bg-elevated px-2 text-fg"
            value={settings.concurrency}
            onChange={(e) => setSettings({ concurrency: Number(e.target.value) as 1 | 2 | 3 | 4 })}
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          Scale
          <select
            className="h-10 rounded-lg border border-border bg-elevated px-2 text-fg"
            value={settings.upscaleScale}
            onChange={(e) => setSettings({ upscaleScale: Number(e.target.value) as 2 | 4 })}
          >
            <option value={2}>2×</option>
            <option value={4}>4×</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          Descratch
          <select
            className="h-10 rounded-lg border border-border bg-elevated px-2 text-fg"
            value={settings.descratchLevel}
            onChange={(e) => setSettings({ descratchLevel: e.target.value as typeof settings.descratchLevel })}
          >
            <option value="off">Off</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          Format
          <select
            className="h-10 rounded-lg border border-border bg-elevated px-2 text-fg"
            value={settings.exportFormat}
            onChange={(e) => setSettings({ exportFormat: e.target.value as typeof settings.exportFormat })}
          >
            <option value="png">PNG</option>
            <option value="jpg">JPEG</option>
            <option value="webp">WebP</option>
          </select>
        </label>
      </div>
    </div>
  );
}

function CardGrid({ cards, selectedId }: { cards: CardRecord[]; selectedId: string | null }) {
  const selectCard = useBatch((s) => s.selectCard);
  const toggleSelect = useBatch((s) => s.toggleSelect);
  return (
    <div className="max-h-[40vh] overflow-auto rounded-2xl border border-border bg-surface p-2 lg:max-h-none">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-2">
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => selectCard(card.id)}
            className={cn(
              "relative overflow-hidden rounded-xl border text-left",
              card.id === selectedId ? "border-accent" : "border-border",
            )}
          >
            <img src={card.thumbUrl} alt={card.identity?.player ?? card.sourceFilename} className="aspect-[2/3] w-full object-cover" />
            <span className="absolute top-1 left-1 rounded bg-bg/80 px-1 font-mono text-[10px] text-fg">
              {card.sourceIndex + 1}.{card.cardIndex + 1}
            </span>
            <span
              role="checkbox"
              aria-checked={card.selected}
              aria-label={`Select card ${card.cardIndex + 1}`}
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                toggleSelect(card.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleSelect(card.id);
                }
              }}
              className={cn(
                "absolute top-1 right-1 flex size-6 items-center justify-center rounded border",
                card.selected ? "border-accent bg-accent text-accent-foreground" : "border-border bg-bg/70",
              )}
            >
              {card.selected ? <Check className="size-3" /> : null}
            </span>
            <span className="block truncate bg-bg/80 px-1 py-1 text-[10px] text-muted">
              {stageLabel(card)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function stageLabel(card: CardRecord) {
  if (card.stage === "failed") return card.error ?? "Failed";
  if (card.stage === "completed") return card.identity?.player ?? "Ready";
  return card.stage.replaceAll("_", " ");
}

function EmptyWorkspace() {
  return (
    <div className="flex min-h-80 items-center justify-center rounded-2xl border border-border bg-surface text-sm text-muted">
      Select a card
    </div>
  );
}

function Workspace({ card }: { card: CardRecord }) {
  const rotateCard = useBatch((s) => s.rotateCard);
  const processUpscale = useBatch((s) => s.processUpscale);
  const processDescratch = useBatch((s) => s.processDescratch);
  const processCombined = useBatch((s) => s.processCombined);
  const retryCards = useBatch((s) => s.retryCards);
  const resetRectified = useBatch((s) => s.resetRectified);
  const compareLeft = useBatch((s) => s.compareLeft);
  const compareRight = useBatch((s) => s.compareRight);
  const setCompare = useBatch((s) => s.setCompare);
  const leftUrl = cardUrl(card, compareLeft);
  const rightUrl = cardUrl(card, compareRight);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-display text-xl tracking-tight">
            {card.identity ? identityLabel(card.identity) : card.sourceFilename}
          </h2>
          <p className="text-xs text-muted">
            Source {card.sourceIndex + 1} · Card {card.cardIndex + 1} · {card.orientation}° ·{" "}
            {card.detectorMethod} {Math.round(card.detectorConfidence * 100)}% · {card.geometryMethod ?? "axis_box"}{" "}
            {Math.round(card.geometryConfidence * 100)}%
          </p>
        </div>
        {card.stage === "failed" ? (
          <div className="flex items-center gap-2">
            <p className="text-sm text-destructive">{card.error}</p>
            <Button type="button" size="sm" onClick={() => void retryCards([card.id])}>
              Retry
            </Button>
          </div>
        ) : null}
      </div>
      <ComparePane leftUrl={leftUrl} rightUrl={rightUrl} left={compareLeft} right={compareRight} />
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["cropped", "Rectified"],
            ["upscaled", "Upscaled"],
            ["descratched", "Descratched"],
            ["upscaled_descratched", "Both"],
            ["original", "Original"],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            type="button"
            size="sm"
            variant={compareRight === key ? "default" : "outline"}
            onClick={() => setCompare("cropped", key)}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => void rotateCard(card.id, -90)} aria-label="Rotate left">
          <RotateCcw className="size-4" />
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => void rotateCard(card.id, 90)} aria-label="Rotate right">
          <RotateCw className="size-4" />
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => void rotateCard(card.id, 180)}>
          180°
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => void rotateCard(card.id, 0)}>
          0°
        </Button>
        <Button type="button" size="sm" onClick={() => void processUpscale([card.id])}>
          Upscale
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => void processDescratch([card.id])}>
          Descratch
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => void processCombined([card.id])}>
          Both
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => void resetRectified(card.id)}>
          Reset
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => downloadArtifact(card, compareRight)}>
          <Download className="size-4" />
          Download
        </Button>
      </div>
      {card.warnings.length ? <p className="text-xs text-muted">{card.warnings.join(" · ")}</p> : null}
      {card.usedRealSr === false ? <p className="text-xs text-muted">Upscale used interpolation, not Real-ESRGAN.</p> : null}
      {card.usedRealSr ? <p className="text-xs text-accent">Real-ESRGAN super-resolution</p> : null}
    </div>
  );
}

function ComparePane({
  leftUrl,
  rightUrl,
  left,
  right,
}: {
  leftUrl: string | null;
  rightUrl: string | null;
  left: string;
  right: string;
}) {
  const [split, setSplit] = useState(50);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const a = leftUrl;
  const b = rightUrl ?? leftUrl;
  if (!a) {
    return (
      <div className="flex aspect-[2/3] max-h-[70vh] items-center justify-center rounded-xl border border-border text-sm text-muted">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Generating preview
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div
        className="relative mx-auto w-full max-w-md touch-none overflow-hidden rounded-xl border border-border bg-elevated"
        style={{ aspectRatio: "2 / 3" }}
        onPointerDown={(e) => {
          const target = e.currentTarget;
          const rect = () => target.getBoundingClientRect();
          const nearSplit = Math.abs(e.clientX - (rect().left + (rect().width * split) / 100)) < 18;
          const panMode = zoom > 1 && !nearSplit;
          const origin = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
          const move = (ev: PointerEvent) => {
            const box = rect();
            if (panMode) {
              setPan({
                x: origin.panX + ev.clientX - origin.x,
                y: origin.panY + ev.clientY - origin.y,
              });
              return;
            }
            setSplit(Math.min(96, Math.max(4, ((ev.clientX - box.left) / box.width) * 100)));
          };
          move(e.nativeEvent);
          const onMove = (ev: PointerEvent) => move(ev);
          const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
          };
          window.addEventListener("pointermove", onMove);
          window.addEventListener("pointerup", onUp);
        }}
      >
        <div
          className="absolute inset-0"
          style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transformOrigin: "center center" }}
        >
          <img src={b ?? a} alt="After" className="absolute inset-0 size-full object-contain" />
          <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
            <img src={a} alt="Before" className="absolute inset-0 size-full object-contain" />
          </div>
        </div>
        <div className="pointer-events-none absolute inset-y-0 z-10 w-px bg-accent" style={{ left: `${split}%` }} />
        <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-bg/80 px-2 py-0.5 text-[10px] uppercase">
          {left}
        </span>
        <span className="pointer-events-none absolute right-2 bottom-2 rounded bg-bg/80 px-2 py-0.5 text-[10px] uppercase">
          {right}
        </span>
      </div>
      <div className="flex items-center justify-center gap-2">
        <Button type="button" size="icon-sm" variant="outline" onClick={() => setZoom((z) => Math.max(1, z - 0.25))} aria-label="Zoom out">
          <Minus className="size-4" />
        </Button>
        <Button type="button" size="icon-sm" variant="outline" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} aria-label="Reset zoom">
          <ImageIcon className="size-4" />
        </Button>
        <Button type="button" size="icon-sm" variant="outline" onClick={() => setZoom((z) => Math.min(4, z + 0.25))} aria-label="Zoom in">
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export function useSampleCount() {
  return useMemo(() => LOT.length, []);
}
