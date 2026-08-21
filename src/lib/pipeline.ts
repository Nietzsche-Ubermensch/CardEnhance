import JSZip from "jszip";
import type { EnhancementSettings, OutputFormat } from "./types";
import { fitMaxEdge } from "./enhance";

const IMAGE_RE = /\.(jpe?g|png|webp|bmp|tif{1,2})$/i;

export async function expandFiles(files: File[]): Promise<File[]> {
  const out: File[] = [];
  for (const file of files) {
    const isZip =
      file.type === "application/zip" ||
      file.type === "application/x-zip-compressed" ||
      file.name.toLowerCase().endsWith(".zip");
    if (!isZip) {
      out.push(file);
      continue;
    }
    const zip = await JSZip.loadAsync(file);
    const entries = Object.values(zip.files);
    for (const entry of entries) {
      if (entry.dir || !IMAGE_RE.test(entry.name)) continue;
      const blob = await entry.async("blob");
      const name = entry.name.split("/").pop() ?? entry.name;
      const type = blob.type || guessType(name);
      out.push(new File([blob], name, { type }));
    }
  }
  return out;
}

function guessType(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

export async function fileToImageData(file: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(file);
  const { w, h } = fitMaxEdge(bitmap.width, bitmap.height);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return ctx.getImageData(0, 0, w, h);
}

export async function imageDataToUrl(
  image: ImageData,
  settings: EnhancementSettings,
): Promise<string> {
  const factor = settings.upscaling ? settings.upscaleFactor : 1;
  const w = image.width * factor;
  const h = image.height * factor;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  const src = document.createElement("canvas");
  src.width = image.width;
  src.height = image.height;
  const sctx = src.getContext("2d");
  if (!sctx) throw new Error("Canvas unavailable");
  sctx.putImageData(image, 0, 0);
  ctx.imageSmoothingEnabled = factor > 1;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, w, h);
  const mime = mimeFor(settings.outputFormat);
  const quality = settings.outputQuality / 100;
  return canvas.toDataURL(mime, quality);
}

function mimeFor(format: OutputFormat) {
  if (format === "jpg") return "image/jpeg";
  if (format === "webp") return "image/webp";
  return "image/png";
}

export function downloadUrl(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}

export async function downloadJobZip(
  files: { name: string; url: string }[],
  zipName: string,
) {
  const zip = new JSZip();
  for (const file of files) {
    const res = await fetch(file.url);
    zip.file(file.name, await res.blob());
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  downloadUrl(url, zipName);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

type EnhanceOk = { image: ImageData; blemishCount: number };

function spawnEnhanceWorker() {
  return new Worker(new URL("../workers/enhance.worker.ts", import.meta.url), {
    type: "module",
  });
}

function runOnWorker(
  worker: Worker,
  image: ImageData,
  settings: EnhancementSettings,
): Promise<EnhanceOk> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      reject(new Error("Enhance timed out"));
    }, 45000);
    const onMessage = (event: MessageEvent) => {
      if (event.data.id !== id) return;
      clearTimeout(timer);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      const data = new Uint8ClampedArray(event.data.buffer);
      resolve({
        image: new ImageData(data, event.data.width, event.data.height),
        blemishCount: event.data.blemishCount,
      });
    };
    const onError = (err: ErrorEvent) => {
      clearTimeout(timer);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      reject(err.error ?? new Error(err.message));
    };
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    const copy = new Uint8ClampedArray(image.data);
    worker.postMessage(
      {
        id,
        width: image.width,
        height: image.height,
        buffer: copy.buffer,
        settings,
      },
      [copy.buffer],
    );
  });
}

export function createEnhancePool(size: number) {
  const n = Math.max(1, Math.min(4, Math.round(size) || 1));
  const idle: Worker[] = Array.from({ length: n }, spawnEnhanceWorker);
  const waiters: Array<(worker: Worker) => void> = [];
  let closed = false;

  function acquire(): Promise<Worker> {
    if (closed) return Promise.reject(new Error("Pool closed"));
    const worker = idle.pop();
    if (worker) return Promise.resolve(worker);
    return new Promise((resolve) => waiters.push(resolve));
  }

  function release(worker: Worker) {
    if (closed) {
      worker.terminate();
      return;
    }
    const next = waiters.shift();
    if (next) next(worker);
    else idle.push(worker);
  }

  return {
    size: n,
    enhance(image: ImageData, settings: EnhancementSettings) {
      return acquire().then(async (worker) => {
        try {
          const result = await runOnWorker(worker, image, settings);
          release(worker);
          return result;
        } catch (err) {
          worker.terminate();
          if (!closed) release(spawnEnhanceWorker());
          throw err;
        }
      });
    },
    terminate() {
      closed = true;
      for (const worker of idle) worker.terminate();
      idle.length = 0;
      waiters.length = 0;
    },
  };
}

export function enhanceInWorker(
  image: ImageData,
  settings: EnhancementSettings,
): Promise<EnhanceOk> {
  const pool = createEnhancePool(1);
  return pool.enhance(image, settings).finally(() => pool.terminate());
}
