/**
 * Real-ESRGAN realesr-general-x4v3 (SRVGGNetCompact).
 * Gigapixel analog: 4× CNN restore, then resample. Scratch/denoise/sharpen
 * blend the recovered high-frequency residual; foil pixels stay from the scan.
 */

import type { EnhancementSettings } from "./types";
import { createSession, getOrt, withTimeout, type OrtSession } from "./ort";

const SCALE = 4;
const RESTORE_EDGE = 160;
const UPSCALED_EDGE = 192;

let sessionReady: Promise<OrtSession | null> | null = null;
let cnnDisabled = false;

function clamp(n: number, min: number, max: number) {
  return n < min ? min : n > max ? max : n;
}

function isHoloPixel(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  if (sat < 0.42 || max < 90) return false;
  return (g > r && b > r * 0.7) || (b > g && r > g * 0.7);
}

async function getSession() {
  if (cnnDisabled) return null;
  if (!sessionReady) {
    sessionReady = (async () => {
      try {
        return await createSession(`${window.location.origin}/models/realesr-general-x4v3.onnx`, 25000);
      } catch {
        cnnDisabled = true;
        return null;
      }
    })();
  }
  return sessionReady;
}

function fitPad(src: ImageData, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(src.width, src.height));
  let w = Math.max(8, Math.round(src.width * scale));
  let h = Math.max(8, Math.round(src.height * scale));
  w = Math.ceil(w / 8) * 8;
  h = Math.ceil(h / 8) * 8;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  const tmp = document.createElement("canvas");
  tmp.width = src.width;
  tmp.height = src.height;
  const tctx = tmp.getContext("2d");
  if (!tctx) throw new Error("Canvas unavailable");
  tctx.putImageData(src, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(tmp, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

function toNchw(src: ImageData) {
  const { width: w, height: h, data } = src;
  const plane = w * h;
  const tensor = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    tensor[i] = data[i * 4] / 255;
    tensor[plane + i] = data[i * 4 + 1] / 255;
    tensor[2 * plane + i] = data[i * 4 + 2] / 255;
  }
  return tensor;
}

function fromNchw(data: Float32Array, w: number, h: number): ImageData {
  const out = new ImageData(w, h);
  const plane = w * h;
  for (let i = 0; i < plane; i++) {
    const o = i * 4;
    out.data[o] = clamp(data[i] * 255, 0, 255);
    out.data[o + 1] = clamp(data[plane + i] * 255, 0, 255);
    out.data[o + 2] = clamp(data[2 * plane + i] * 255, 0, 255);
    out.data[o + 3] = 255;
  }
  return out;
}

function resample(src: ImageData, w: number, h: number): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  const tmp = document.createElement("canvas");
  tmp.width = src.width;
  tmp.height = src.height;
  const tctx = tmp.getContext("2d");
  if (!tctx) throw new Error("Canvas unavailable");
  tctx.putImageData(src, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(tmp, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

async function infer(src: ImageData): Promise<ImageData> {
  const session = await getSession();
  if (!session) throw new Error("CNN unavailable");
  const ort = await getOrt();
  const tensor = toNchw(src);
  const input = new ort.Tensor("float32", tensor, [1, 3, src.height, src.width]);
  const feeds: Record<string, unknown> = {};
  feeds[session.inputNames[0] ?? "input"] = input;
  const result = await withTimeout(session.run(feeds), 12000, "CNN infer timed out");
  const outName = session.outputNames[0] ?? Object.keys(result)[0];
  const output = outName ? result[outName] : undefined;
  if (!output) throw new Error("CNN empty");
  const dims = output.dims;
  const h = dims.length === 4 ? dims[2] : src.height * SCALE;
  const w = dims.length === 4 ? dims[3] : src.width * SCALE;
  return fromNchw(output.data as Float32Array, w, h);
}

function blendRestore(orig: ImageData, restored: ImageData, settings: EnhancementSettings): ImageData {
  const out = new ImageData(orig.width, orig.height);
  const a = orig.data;
  const b = restored.data;
  const o = out.data;
  const denoise = settings.noiseReduction ? 0.35 + settings.noiseReductionStrength * 0.45 : 0.22;
  const sharp = settings.sharpening ? settings.sharpeningAmount * 0.55 : 0.15;
  for (let i = 0; i < a.length; i += 4) {
    if (settings.preserveHolographic && isHoloPixel(a[i], a[i + 1], a[i + 2])) {
      o[i] = a[i];
      o[i + 1] = a[i + 1];
      o[i + 2] = a[i + 2];
      o[i + 3] = 255;
      continue;
    }
    const r = a[i] * (1 - denoise) + b[i] * denoise;
    const g = a[i + 1] * (1 - denoise) + b[i + 1] * denoise;
    const bl = a[i + 2] * (1 - denoise) + b[i + 2] * denoise;
    o[i] = clamp(r + (b[i] - a[i]) * sharp, 0, 255);
    o[i + 1] = clamp(g + (b[i + 1] - a[i + 1]) * sharp, 0, 255);
    o[i + 2] = clamp(bl + (b[i + 2] - a[i + 2]) * sharp, 0, 255);
    o[i + 3] = 255;
  }
  return out;
}

export type CnnResult = {
  image: ImageData;
  used: boolean;
};

export async function cnnRestore(src: ImageData, settings: EnhancementSettings): Promise<CnnResult> {
  if (typeof window === "undefined" || cnnDisabled) {
    return { image: src, used: false };
  }
  if (!settings.cnnRestore && !settings.upscaling) {
    return { image: src, used: false };
  }
  try {
    const factor = settings.upscaling ? settings.upscaleFactor : 1;
    const maxEdge = factor > 1 ? UPSCALED_EDGE : RESTORE_EDGE;
    const low = fitPad(src, maxEdge);
    const hi = await infer(low);
    if (factor > 1) {
      const w = src.width * factor;
      const h = src.height * factor;
      const upOrig = resample(src, w, h);
      const upCnn = resample(hi, w, h);
      return { image: blendRestore(upOrig, upCnn, settings), used: true };
    }
    const restored = resample(hi, src.width, src.height);
    return { image: blendRestore(src, restored, settings), used: true };
  } catch {
    cnnDisabled = true;
    return { image: src, used: false };
  }
}
