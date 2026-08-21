import { useCallback, useEffect, useRef, useState } from "react";
import { FileArchive, Image as ImageIcon, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatBytes } from "@/lib/utils";
import { useStudio } from "@/lib/jobs";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/bmp", "image/tiff"];
const MAX_IMAGE = 50 * 1024 * 1024;
const MAX_ZIP = 512 * 1024 * 1024;

const PAIR = [
  { src: "/samples/demo-front.jpg", name: "demo-front.jpg", label: "Front" },
  { src: "/samples/demo-back.jpg", name: "demo-back.jpg", label: "Back" },
] as const;

const LOT = [
  { src: "/samples/mesh/darby-allin-front.jpg", name: "darby-allin-front.jpg", label: "Darby Allin" },
  { src: "/samples/mesh/mina-shirakawa-dazzlers.jpg", name: "mina-shirakawa-dazzlers.jpg", label: "Mina" },
  { src: "/samples/mesh/mina-shirakawa-dazzlers-back.jpg", name: "mina-shirakawa-dazzlers-back.jpg", label: "Mina back" },
  { src: "/samples/mesh/athena-pyro.jpg", name: "athena-pyro.jpg", label: "Athena" },
  { src: "/samples/mesh/jamie-hayter-mighty-ones.jpg", name: "jamie-hayter-mighty-ones.jpg", label: "Hayter" },
  { src: "/samples/mesh/willow-harley-tag.jpg", name: "willow-harley-tag.jpg", label: "Tag team" },
  { src: "/samples/mesh/toni-timeline-front.jpg", name: "toni-timeline-front.jpg", label: "Toni" },
  { src: "/samples/mesh/bret-hart-chrome.jpg", name: "bret-hart-chrome.jpg", label: "Bret Hart" },
  { src: "/samples/mesh/chelsea-green-front.jpg", name: "chelsea-green-front.jpg", label: "Chelsea" },
  { src: "/samples/mesh/chelsea-green-table.jpg", name: "chelsea-green-table.jpg", label: "Table crop" },
  { src: "/samples/mesh/kofi-kingston-prizm.jpg", name: "kofi-kingston-prizm.jpg", label: "Kofi" },
  { src: "/samples/mesh/lola-vice-chrome.jpg", name: "lola-vice-chrome.jpg", label: "Lola Vice" },
] as const;

function isZip(file: File) {
  return (
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed" ||
    file.name.toLowerCase().endsWith(".zip")
  );
}

export function DropZone() {
  const startJob = useStudio((s) => s.startJob);
  const busy = useStudio((s) => s.busy);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [fileInputReady, setFileInputReady] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFileInputReady(true);
  }, []);

  const addFiles = useCallback((list: FileList | File[] | null) => {
    if (!list) return;
    const next: File[] = [];
    for (const file of Array.from(list)) {
      const zip = isZip(file);
      if (!zip && !IMAGE_TYPES.includes(file.type) && !/\.(jpe?g|png|webp|bmp|tiff?)$/i.test(file.name)) {
        toast.error(`${file.name}: unsupported format`);
        continue;
      }
      const cap = zip ? MAX_ZIP : MAX_IMAGE;
      if (file.size > cap) {
        toast.error(`${file.name}: too large (${formatBytes(file.size)})`);
        continue;
      }
      next.push(file);
    }
    if (next.length) setFiles((prev) => [...prev, ...next]);
  }, []);

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  };

  const loadNamed = async (items: readonly { src: string; name: string }[]) => {
    const blobs = await Promise.all(
      items.map(async (sample) => {
        const res = await fetch(sample.src);
        if (!res.ok) throw new Error("Could not load sample scans");
        return new File([await res.blob()], sample.name, { type: "image/jpeg" });
      }),
    );
    return blobs;
  };

  const enhanceLot = async () => {
    try {
      await startJob(await loadNamed(LOT));
      toast.success("Enhancing a 12-card wrestling lot");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start lot");
    }
  };

  const enhanceDump = async () => {
    try {
      const res = await fetch("/samples/scanner-dump.zip");
      if (!res.ok) throw new Error("Could not load scanner dump");
      const file = new File([await res.blob()], "scanner-dump.zip", { type: "application/zip" });
      await startJob([file]);
      toast.success("Enhancing 70-card scanner dump");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start dump");
    }
  };

  const enhancePair = async () => {
    try {
      await startJob(await loadNamed(PAIR));
      toast.success("Enhancing two AEW / Upper Deck scans");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start sample job");
    }
  };

  const queueLot = async () => {
    try {
      addFiles(await loadNamed(LOT));
      toast.success("Loaded 12-card lot");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load lot");
    }
  };

  const run = async () => {
    if (!files.length) return;
    try {
      await startJob(files);
      setFiles([]);
      toast.success(`Queued ${files.length} file${files.length === 1 ? "" : "s"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start job");
    }
  };

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <h2 className="font-display text-2xl tracking-tight text-fg text-balance">
          Upload scans
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted text-pretty">
          Drop a table shot, a full-bleed scan, or a ZIP of 100+ cards. YOLO26
          finds the card. Real-ESRGAN restores scratches. OCR reads any set.
        </p>
      </div>

      <div className="rounded-3xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-fg">12-card wrestling lot</p>
            <p className="mt-0.5 text-sm text-muted">
              AEW Upper Deck · Topps Chrome · Panini Prizm · or run the full 70-card unnamed dump
            </p>
          </div>
          <Badge variant="outline" className="border-accent/40 text-accent">
            YOLO26 + CNN
          </Badge>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6">
          {LOT.map((sample) => (
            <figure key={sample.src} className="overflow-hidden rounded-lg bg-elevated">
              <img
                src={sample.src}
                alt={sample.label}
                className="aspect-[2/3] w-full object-cover"
              />
              <figcaption className="truncate px-1.5 py-1 text-center text-[10px] tracking-wide text-muted uppercase">
                {sample.label}
              </figcaption>
            </figure>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button type="button" onClick={enhanceLot} disabled={busy}>
            {busy ? "Enhancing…" : "Enhance 12-card lot"}
          </Button>
          <Button type="button" variant="outline" onClick={queueLot} disabled={busy}>
            Add to queue
          </Button>
          <Button type="button" variant="ghost" onClick={enhancePair} disabled={busy}>
            Two-card quick run
          </Button>
          <Button type="button" variant="outline" onClick={enhanceDump} disabled={busy}>
            {busy ? "Enhancing…" : "Enhance 70-card dump"}
          </Button>
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex min-h-56 flex-col items-center justify-center rounded-3xl border border-dashed px-6 py-12 text-center ${
          dragging ? "border-accent bg-accent/10" : "border-border bg-surface"
        }`}
      >
        <div className="flex size-12 items-center justify-center rounded-lg bg-elevated text-accent">
          <Upload className="size-5" />
        </div>
        <p className="mt-4 font-medium text-fg">Drop a lot or a ZIP</p>
        <p className="mt-1 max-w-md text-sm text-muted">
          JPG, PNG, WebP, BMP, TIFF · 50 MB each · ZIP up to 512 MB for 100+ card
          batches
        </p>
        <div className="mt-5">
          <Button
            type="button"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            Choose files
          </Button>
        </div>
        {fileInputReady ? (
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/bmp,image/tiff,.zip"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        ) : null}
      </div>

      {files.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-fg">
              Queue{" "}
              <Badge variant="outline" className="ml-1 tabular-nums">
                {files.length}
              </Badge>
            </p>
            <button
              type="button"
              className="text-xs text-muted hover:text-fg"
              onClick={() => setFiles([])}
            >
              Clear
            </button>
          </div>
          <ul className="flex max-h-48 flex-col gap-2 overflow-auto">
            {files.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="flex items-center gap-3 rounded-xl bg-elevated px-3 py-2"
              >
                {isZip(file) ? (
                  <FileArchive className="size-4 shrink-0 text-muted" />
                ) : (
                  <ImageIcon className="size-4 shrink-0 text-muted" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm text-fg">{file.name}</span>
                <span className="shrink-0 font-mono text-xs text-muted tabular-nums">
                  {formatBytes(file.size)}
                </span>
                <button
                  type="button"
                  className="rounded-md p-1 text-muted hover:text-fg"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
          <Button className="mt-4 w-full sm:w-auto" onClick={run} disabled={busy}>
            {busy ? "Processing…" : `Enhance ${files.length} file${files.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      )}
    </div>
  );
}
