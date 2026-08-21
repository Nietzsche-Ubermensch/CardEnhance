import { create } from "zustand";
import JSZip from "jszip";
import { expandFiles } from "./pipeline";
import { validateUploadedImage } from "./validate";
import { detectCards, rectifyCard } from "./detect-sheet";
import { identifyCard, identityLabel } from "./identify";
import { saveProcessedCard } from "./connectors/persist";
import { notifyCardProcessed } from "./connectors/notify";
import { upscaleCard } from "./upscale";
import { buildScratchMask, descratchCard, validateScratchMask, type DescratchLevel } from "./descratch";
import {
  artifactOfType,
  createDerivedArtifact,
  getArtifact,
  getArtifactUrl,
  storeArtifact,
  type ArtifactType,
} from "./artifacts";
import {
  imageDataFromBlob,
  rotateImage,
  sha256Hex,
  identityFilename,
  encodeImage,
  thumbnail,
} from "./image-ops";
import type { CardIdentity } from "./types";

export type Stage =
  | "queued"
  | "uploading"
  | "validating"
  | "detecting"
  | "cropping"
  | "orienting"
  | "upscaling"
  | "descratching"
  | "generating_previews"
  | "completed"
  | "failed"
  | "retrying";

export type BatchStatus =
  | "queued"
  | "uploading"
  | "validating"
  | "detecting"
  | "cropping"
  | "orienting"
  | "upscaling"
  | "descratching"
  | "generating_previews"
  | "completed"
  | "partial_success"
  | "failed"
  | "cancelled"
  | "retrying";

export type DropPhase = "idle" | "drag_over" | "uploading" | "processing" | "success" | "partial_failure" | "failure";

export type SourceRecord = {
  id: string;
  filename: string;
  hash: string;
  sourceIndex: number;
  width: number;
  height: number;
  originalArtifactId: string;
  status: Stage;
  error?: string;
};

export type CardRecord = {
  id: string;
  sourceId: string;
  sourceFilename: string;
  sourceIndex: number;
  cardIndex: number;
  stage: Stage;
  selected: boolean;
  orientation: 0 | 90 | 180 | 270;
  orientationMethod: string;
  orientationConfidence: number;
  detectorMethod: string;
  detectorConfidence: number;
  geometryConfidence: number;
  geometryMethod?: string;
  identity?: CardIdentity;
  warnings: string[];
  error?: string;
  thumbUrl: string;
  croppedId: string | null;
  upscaledId: string | null;
  descratchedId: string | null;
  combinedId: string | null;
  originalId: string;
  usedRealSr?: boolean;
  maskCoverage?: number;
};

type Settings = {
  concurrency: 1 | 2 | 3 | 4;
  upscaleScale: 2 | 4;
  descratchLevel: DescratchLevel;
  exportFormat: "png" | "jpg" | "webp";
  exportQuality: number;
};

const defaultSettings: Settings = {
  concurrency: 2,
  upscaleScale: 2,
  descratchLevel: "medium",
  exportFormat: "png",
  exportQuality: 92,
};

const pixels = new Map<string, ImageData>();

type Store = {
  settings: Settings;
  setSettings: (partial: Partial<Settings>) => void;
  dropPhase: DropPhase;
  setDropPhase: (p: DropPhase) => void;
  batchId: string;
  batchStatus: BatchStatus;
  createdAt: number;
  updatedAt: number;
  sources: SourceRecord[];
  cards: CardRecord[];
  selectedCardId: string | null;
  compareLeft: ArtifactType;
  compareRight: ArtifactType;
  setCompare: (left: ArtifactType, right: ArtifactType) => void;
  selectCard: (id: string | null) => void;
  toggleSelect: (id: string) => void;
  selectAll: (on: boolean) => void;
  selectByStage: (stage: "completed" | "failed") => void;
  addFiles: (files: File[]) => Promise<void>;
  rotateCard: (id: string, degrees: 90 | -90 | 0 | 180 | 270) => Promise<void>;
  processUpscale: (ids: string[]) => Promise<void>;
  processDescratch: (ids: string[]) => Promise<void>;
  processCombined: (ids: string[]) => Promise<void>;
  retryCards: (ids: string[]) => Promise<void>;
  resetRectified: (id: string) => Promise<void>;
  exportCards: (ids: string[], type: ArtifactType) => Promise<void>;
  cancel: () => void;
};

let cancelled = false;
let sourceCursor = 0;

function nowBatchStatus(cards: CardRecord[], sources: SourceRecord[]): BatchStatus {
  if (cancelled) return "cancelled";
  const failedCards = cards.filter((c) => c.stage === "failed").length;
  const done = cards.filter((c) => c.stage === "completed").length;
  const busyCards = cards.some((c) => !["completed", "failed", "queued"].includes(c.stage));
  const busySources = sources.some((s) =>
    ["uploading", "validating", "detecting", "cropping", "orienting"].includes(s.status),
  );
  if (busyCards || busySources) return "detecting";
  if (failedCards && done) return "partial_success";
  if (failedCards && !done) return "failed";
  if (done) return "completed";
  if (sources.some((s) => s.status === "failed") && !cards.length) return "failed";
  return "queued";
}

function dropFromBatch(status: BatchStatus): DropPhase {
  if (status === "completed") return "success";
  if (status === "partial_success") return "partial_failure";
  if (status === "failed") return "failure";
  if (status === "queued") return "idle";
  return "processing";
}

export const useBatch = create<Store>((set, get) => ({
  settings: defaultSettings,
  setSettings: (partial) => set({ settings: { ...get().settings, ...partial }, updatedAt: Date.now() }),
  dropPhase: "idle",
  setDropPhase: (p) => set({ dropPhase: p }),
  batchId: crypto.randomUUID(),
  batchStatus: "queued",
  createdAt: Date.now(),
  updatedAt: Date.now(),
  sources: [],
  cards: [],
  selectedCardId: null,
  compareLeft: "cropped",
  compareRight: "upscaled",
  setCompare: (left, right) => set({ compareLeft: left, compareRight: right }),
  selectCard: (id) => set({ selectedCardId: id }),
  toggleSelect: (id) =>
    set({ cards: get().cards.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c)) }),
  selectAll: (on) => set({ cards: get().cards.map((c) => ({ ...c, selected: on })) }),
  selectByStage: (stage) =>
    set({ cards: get().cards.map((c) => ({ ...c, selected: c.stage === stage })) }),
  cancel: () => {
    cancelled = true;
    set({ batchStatus: "cancelled", dropPhase: "idle" });
  },
  addFiles: async (files) => {
    cancelled = false;
    set({ dropPhase: "uploading", batchStatus: "uploading" });
    let expanded: File[] = [];
    try {
      expanded = await expandFiles(files);
    } catch {
      set({ dropPhase: "failure", batchStatus: "failed" });
      return;
    }
    set({ dropPhase: "processing", batchStatus: "validating" });
    const conc = get().settings.concurrency;
    let i = 0;
    const run = async () => {
      while (i < expanded.length && !cancelled) {
        const idx = i++;
        await ingestSource(expanded[idx], get, set);
      }
    };
    await Promise.all(Array.from({ length: conc }, run));
    const st = nowBatchStatus(get().cards, get().sources);
    set({ batchStatus: st, dropPhase: dropFromBatch(st), updatedAt: Date.now() });
  },
  rotateCard: async (id, degrees) => {
    const card = get().cards.find((c) => c.id === id);
    if (!card?.croppedId) return;
    const img = pixels.get(card.croppedId);
    if (!img) return;
    const target = (degrees === -90 ? (card.orientation + 270) % 360 : degrees === 90 ? (card.orientation + 90) % 360 : degrees) as
      | 0
      | 90
      | 180
      | 270;
    const delta = ((target - card.orientation + 360) % 360) as 0 | 90 | 180 | 270;
    if (delta === 0) return;
    const rot = rotateImage(img, delta);
    const art = await createDerivedArtifact({
      cardId: card.id,
      sourceId: card.sourceId,
      artifactType: "cropped",
      parentArtifact: card.croppedId,
      image: rot,
    });
    pixels.set(art.id, rot);
    const thumb = URL.createObjectURL(await encodeImage(thumbnail(rot), "jpg", 0.8));
    set({
      cards: get().cards.map((c) =>
        c.id === id
          ? {
              ...c,
              croppedId: art.id,
              orientation: target,
              orientationMethod: "manual",
              orientationConfidence: 1,
              thumbUrl: thumb,
              upscaledId: null,
              descratchedId: null,
              combinedId: null,
            }
          : c,
      ),
      updatedAt: Date.now(),
    });
  },
  processUpscale: async (ids) => runOnCards(ids, "upscaling", upscaleOne, get, set),
  processDescratch: async (ids) => runOnCards(ids, "descratching", descratchOne, get, set),
  processCombined: async (ids) => runOnCards(ids, "upscaling", combinedOne, get, set),
  retryCards: async (ids) => {
    const failed = get().cards.filter((c) => ids.includes(c.id) && c.stage === "failed");
    if (!failed.length) return;
    set({
      batchStatus: "retrying",
      cards: get().cards.map((c) =>
        ids.includes(c.id) && c.stage === "failed" ? { ...c, stage: "retrying", error: undefined } : c,
      ),
    });
    await runOnCards(
      failed.map((c) => c.id),
      "cropping",
      async (card) => {
        const srcArt = getArtifact(card.originalId);
        if (!srcArt) throw new Error("Original missing");
        const src = await imageDataFromBlob(srcArt.blob);
        await extractOne(src, card.sourceId, card.sourceFilename, card.sourceIndex, get, set, card.id);
      },
      get,
      set,
    );
  },
  resetRectified: async (id) => {
    set({
      cards: get().cards.map((c) =>
        c.id === id ? { ...c, upscaledId: null, descratchedId: null, combinedId: null } : c,
      ),
      compareLeft: "cropped",
      compareRight: "cropped",
    });
  },
  exportCards: async (ids, type) => {
    const cards = get().cards.filter((c) => ids.includes(c.id));
    const zip = new JSZip();
    const folder = zip.folder("images");
    const manifest: unknown[] = [];
    let n = 0;
    for (const card of cards) {
      const artId =
        type === "original"
          ? card.originalId
          : type === "upscaled"
            ? card.upscaledId
            : type === "descratched"
              ? card.descratchedId
              : type === "upscaled_descratched"
                ? card.combinedId
                : card.croppedId;
      const art = artId ? getArtifact(artId) : null;
      if (!art) continue;
      n++;
      const ext = get().settings.exportFormat;
      const name = identityFilename(
        [
          card.identity?.year,
          card.identity?.set,
          card.identity?.player,
          card.identity?.number,
          String(card.sourceIndex + 1).padStart(3, "0"),
          String(card.cardIndex + 1).padStart(2, "0"),
        ],
        type,
        ext,
      );
      let blob = art.blob;
      if (ext !== "png") {
        const img = pixels.get(art.id) ?? (await imageDataFromBlob(art.blob));
        blob = await encodeImage(img, ext, get().settings.exportQuality / 100);
      }
      folder?.file(name, blob);
      manifest.push({
        card_id: card.id,
        source_id: card.sourceId,
        source_filename: card.sourceFilename,
        source_index: card.sourceIndex,
        artifact_type: type,
        output_filename: name,
        original_width: getArtifact(card.originalId)?.width ?? null,
        original_height: getArtifact(card.originalId)?.height ?? null,
        output_width: art.width,
        output_height: art.height,
        orientation: card.orientation,
        detector_confidence: card.detectorConfidence,
        geometry_confidence: card.geometryConfidence,
        geometry_method: card.geometryMethod ?? null,
        upscale_model: art.upscaleModel ?? null,
        upscale_scale: art.upscaleScale ?? null,
        used_real_sr: art.usedRealSr ?? false,
        descratch_level: art.descratchLevel ?? get().settings.descratchLevel,
        descratch_algorithm: art.descratchAlgorithm ?? "telea-lite",
        descratch_mask_coverage: art.maskCoverage ?? card.maskCoverage ?? null,
        warnings: card.warnings,
        status: card.stage,
      });
    }
    zip.file("manifest.json", JSON.stringify({ generated_at: new Date().toISOString(), count: n, cards: manifest }, null, 2));
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `CardEnhance_Export_${Date.now()}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  },
}));

type Get = () => Store;
type Set = (partial: Partial<Store> | ((s: Store) => Partial<Store>)) => void;

async function persistCard(card: CardRecord) {
  try {
    await saveProcessedCard({
      data: {
        id: card.id,
        sourceId: card.sourceId,
        filename: card.sourceFilename,
        player: card.identity?.player ?? null,
        setName: card.identity?.set ?? null,
        manufacturer: card.identity?.manufacturer ?? null,
        year: card.identity?.year ?? null,
        number: card.identity?.number ?? null,
        parallel: card.identity?.parallel ?? null,
        side: card.identity?.side ?? null,
        engine: card.identity?.engine ?? null,
        detector: card.detectorMethod,
        status: card.stage,
      },
    });
    const name = identityLabel(card.identity ?? { player: null, year: null, manufacturer: null, set: null, number: null, parallel: null, side: "unknown", confidence: 0, rawText: "", engine: "ocr" });
    void notifyCardProcessed({
      data: {
        cardName: name || card.sourceFilename,
        detector: card.detectorMethod,
        engine: card.identity?.engine,
      },
    });
  } catch {
    /* persist is optional — processing already succeeded */
  }
}

async function ingestSource(file: File, get: Get, set: Set) {
  const sourceIndex = sourceCursor++;
  const bytes = await file.arrayBuffer();
  const validated = await validateUploadedImage(bytes, file.name, file.type);
  if (!validated.ok) {
    set({
      sources: [
        ...get().sources,
        {
          id: crypto.randomUUID(),
          filename: validated.filename,
          hash: "",
          sourceIndex,
          width: 0,
          height: 0,
          originalArtifactId: "",
          status: "failed",
          error: validated.error,
        },
      ],
    });
    return;
  }
  const hash = await sha256Hex(validated.bytes);
  const sourceId = crypto.randomUUID();
  const origBlob = new Blob([validated.bytes], { type: validated.mime });
  const origPixels = await imageDataFromBlob(origBlob);
  const origArt = storeArtifact({
    id: crypto.randomUUID(),
    cardId: `source-${sourceId}`,
    sourceId,
    artifactType: "original",
    parentArtifact: null,
    width: origPixels.width,
    height: origPixels.height,
    warnings: [],
    blob: origBlob,
  });
  pixels.set(origArt.id, origPixels);
  set({
    sources: [
      ...get().sources,
      {
        id: sourceId,
        filename: validated.filename,
        hash,
        sourceIndex,
        width: origPixels.width,
        height: origPixels.height,
        originalArtifactId: origArt.id,
        status: "detecting",
      },
    ],
    batchStatus: "detecting",
  });
  try {
    const detections = await detectCards(origPixels);
    if (!detections.length) {
      set({
        sources: get().sources.map((s) =>
          s.id === sourceId ? { ...s, status: "failed", error: "No card detected" } : s,
        ),
      });
      return;
    }
    for (const det of detections) {
      if (cancelled) return;
      const cardId = crypto.randomUUID();
      const rectified = rectifyCard(origPixels, det);
      const croppedArt = await createDerivedArtifact({
        cardId,
        sourceId,
        artifactType: "cropped",
        parentArtifact: origArt.id,
        image: rectified,
      });
      pixels.set(croppedArt.id, rectified);
      let oriented = rectified;
      let orientation: 0 | 90 | 180 | 270 = 0;
      let orientationMethod = "layout";
      let identity: CardIdentity | undefined;
      try {
        const idn = await identifyCard(rectified, validated.filename, { vision: false });
        identity = idn.identity;
        if (idn.rotated) {
          oriented = rotateImage(rectified, 180);
          orientation = 180;
          orientationMethod = "ocr";
          const re = await createDerivedArtifact({
            cardId,
            sourceId,
            artifactType: "cropped",
            parentArtifact: croppedArt.id,
            image: oriented,
          });
          pixels.set(re.id, oriented);
          croppedArt.id = re.id;
        }
      } catch {
        /* keep rectified */
      }
      const thumb = URL.createObjectURL(await encodeImage(thumbnail(oriented), "jpg", 0.8));
      const card: CardRecord = {
        id: cardId,
        sourceId,
        sourceFilename: validated.filename,
        sourceIndex,
        cardIndex: det.cardIndex,
        stage: "completed",
        selected: false,
        orientation,
        orientationMethod,
        orientationConfidence: orientation === 180 ? 0.8 : 0.55,
        detectorMethod: det.detectorMethod,
        detectorConfidence: det.confidence,
        geometryConfidence: det.geometryConfidence,
        geometryMethod: det.geometryMethod,
        identity,
        warnings: det.warnings,
        thumbUrl: thumb,
        croppedId: croppedArt.id,
        upscaledId: null,
        descratchedId: null,
        combinedId: null,
        originalId: origArt.id,
      };
      set({
        cards: [...get().cards, card],
        selectedCardId: get().selectedCardId ?? cardId,
        sources: get().sources.map((s) => (s.id === sourceId ? { ...s, status: "completed" } : s)),
      });
      void persistCard(card);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Crop failed";
    set({
      sources: get().sources.map((s) => (s.id === sourceId ? { ...s, status: "failed", error: message } : s)),
    });
  }
}

async function extractOne(
  src: ImageData,
  sourceId: string,
  filename: string,
  sourceIndex: number,
  get: Get,
  set: Set,
  existingId?: string,
) {
  const detections = await detectCards(src);
  if (!detections.length) throw new Error("No card detected");
  const det = detections[0];
  const rectified = rectifyCard(src, det);
  const cardId = existingId ?? crypto.randomUUID();
  const croppedArt = await createDerivedArtifact({
    cardId,
    sourceId,
    artifactType: "cropped",
    parentArtifact: null,
    image: rectified,
  });
  pixels.set(croppedArt.id, rectified);
  const thumb = URL.createObjectURL(await encodeImage(thumbnail(rectified), "jpg", 0.8));
  set({
    cards: get().cards.map((c) =>
      c.id === cardId
        ? {
            ...c,
            stage: "completed",
            error: undefined,
            croppedId: croppedArt.id,
            thumbUrl: thumb,
            warnings: det.warnings,
          }
        : c,
    ),
  });
}

async function runOnCards(
  ids: string[],
  stage: Stage,
  fn: (card: CardRecord) => Promise<void>,
  get: Get,
  set: Set,
) {
  cancelled = false;
  set({ dropPhase: "processing", batchStatus: stage === "upscaling" ? "upscaling" : "descratching" });
  const conc = get().settings.concurrency;
  let i = 0;
  const list = ids.filter(Boolean);
  const run = async () => {
    while (i < list.length && !cancelled) {
      const id = list[i++];
      const card = get().cards.find((c) => c.id === id);
      if (!card) continue;
      set({ cards: get().cards.map((c) => (c.id === id ? { ...c, stage, error: undefined } : c)) });
      try {
        await fn(get().cards.find((c) => c.id === id)!);
        set({
          cards: get().cards.map((c) => (c.id === id ? { ...c, stage: "completed" } : c)),
        });
      } catch (err) {
        const message = humanError(err);
        set({
          cards: get().cards.map((c) => (c.id === id ? { ...c, stage: "failed", error: message } : c)),
        });
      }
    }
  };
  await Promise.all(Array.from({ length: conc }, run));
  const st = nowBatchStatus(get().cards, get().sources);
  set({ batchStatus: st, dropPhase: dropFromBatch(st), updatedAt: Date.now() });
}

function humanError(err: unknown) {
  const msg = err instanceof Error ? err.message : "Processing failed";
  if (/upscale/i.test(msg)) return "Upscale failed";
  if (/descratch|scratch/i.test(msg)) return "Descratch failed";
  if (/crop|rectif/i.test(msg)) return "Crop failed";
  if (/model/i.test(msg)) return "Model unavailable";
  if (/detect/i.test(msg)) return "No card detected";
  return msg;
}

async function upscaleOne(card: CardRecord) {
  const cropped = card.croppedId ? pixels.get(card.croppedId) : null;
  if (!cropped) throw new Error("Crop failed");
  const scale = useBatch.getState().settings.upscaleScale;
  const result = await upscaleCard(cropped, scale);
  const art = await createDerivedArtifact({
    cardId: card.id,
    sourceId: card.sourceId,
    artifactType: "upscaled",
    parentArtifact: card.croppedId,
    image: result.image,
    extra: {
      usedRealSr: result.usedRealSr,
      upscaleScale: result.scale,
      upscaleModel: result.model,
      upscaleMethod: result.method,
      warnings: result.usedRealSr ? [] : ["Interpolation fallback"],
    },
  });
  pixels.set(art.id, result.image);
  useBatch.setState((s) => ({
    cards: s.cards.map((c) =>
      c.id === card.id
        ? { ...c, upscaledId: art.id, usedRealSr: result.usedRealSr, warnings: [...c.warnings, ...(result.usedRealSr ? [] : ["Interpolation fallback"])] }
        : c,
    ),
    compareLeft: "cropped",
    compareRight: "upscaled",
  }));
}

async function descratchOne(card: CardRecord) {
  const cropped = card.croppedId ? pixels.get(card.croppedId) : null;
  if (!cropped) throw new Error("Crop failed");
  const level = useBatch.getState().settings.descratchLevel;
  if (level === "off") {
    const art = await createDerivedArtifact({
      cardId: card.id,
      sourceId: card.sourceId,
      artifactType: "descratched",
      parentArtifact: card.croppedId,
      image: cropped,
      extra: {
        descratchLevel: "off",
        descratchAlgorithm: "none",
        maskCoverage: 0,
        warnings: ["DESCRATCH_SKIPPED"],
      },
    });
    pixels.set(art.id, cropped);
    useBatch.setState((s) => ({
      cards: s.cards.map((c) =>
        c.id === card.id
          ? { ...c, descratchedId: art.id, warnings: [...c.warnings, "DESCRATCH_SKIPPED"] }
          : c,
      ),
      compareLeft: "cropped",
      compareRight: "descratched",
    }));
    return;
  }
  const mask = buildScratchMask(cropped, level);
  const valid = validateScratchMask(mask, level);
  if (!valid.ok) {
    const art = await createDerivedArtifact({
      cardId: card.id,
      sourceId: card.sourceId,
      artifactType: "descratched",
      parentArtifact: card.croppedId,
      image: cropped,
      extra: {
        descratchLevel: level,
        descratchAlgorithm: "none",
        maskCoverage: mask.coverage,
        warnings: [valid.reason, ...mask.warnings],
      },
    });
    pixels.set(art.id, cropped);
    useBatch.setState((s) => ({
      cards: s.cards.map((c) =>
        c.id === card.id
          ? { ...c, descratchedId: art.id, maskCoverage: mask.coverage, warnings: [...c.warnings, valid.reason] }
          : c,
      ),
      compareLeft: "cropped",
      compareRight: "descratched",
    }));
    return;
  }
  const restored = descratchCard(cropped, mask, level);
  const art = await createDerivedArtifact({
    cardId: card.id,
    sourceId: card.sourceId,
    artifactType: "descratched",
    parentArtifact: card.croppedId,
    image: restored,
    extra: {
      descratchLevel: level,
      descratchAlgorithm: "telea-lite",
      maskCoverage: mask.coverage,
      warnings: mask.warnings,
    },
  });
  pixels.set(art.id, restored);
  useBatch.setState((s) => ({
    cards: s.cards.map((c) =>
      c.id === card.id ? { ...c, descratchedId: art.id, maskCoverage: mask.coverage } : c,
    ),
    compareLeft: "cropped",
    compareRight: "descratched",
  }));
}

async function combinedOne(card: CardRecord) {
  await descratchOne(card);
  const latest = useBatch.getState().cards.find((c) => c.id === card.id);
  const srcId = latest?.descratchedId ?? latest?.croppedId;
  const src = srcId ? pixels.get(srcId) : null;
  if (!src) throw new Error("Descratch failed");
  const scale = useBatch.getState().settings.upscaleScale;
  const result = await upscaleCard(src, scale);
  const art = await createDerivedArtifact({
    cardId: card.id,
    sourceId: card.sourceId,
    artifactType: "upscaled_descratched",
    parentArtifact: srcId ?? null,
    image: result.image,
    extra: {
      usedRealSr: result.usedRealSr,
      upscaleScale: result.scale,
      upscaleModel: result.model,
      upscaleMethod: result.method,
      descratchLevel: useBatch.getState().settings.descratchLevel,
      descratchAlgorithm: "telea-lite",
      maskCoverage: latest?.maskCoverage,
    },
  });
  pixels.set(art.id, result.image);
  useBatch.setState((s) => ({
    cards: s.cards.map((c) =>
      c.id === card.id ? { ...c, combinedId: art.id, usedRealSr: result.usedRealSr } : c,
    ),
    compareLeft: "cropped",
    compareRight: "upscaled_descratched",
  }));
}

export function cardUrl(card: CardRecord, type: ArtifactType): string | null {
  const id =
    type === "original"
      ? card.originalId
      : type === "upscaled"
        ? card.upscaledId
        : type === "descratched"
          ? card.descratchedId
          : type === "upscaled_descratched"
            ? card.combinedId
            : card.croppedId;
  return getArtifactUrl(id);
}

export function downloadArtifact(card: CardRecord, type: ArtifactType) {
  const url = cardUrl(card, type);
  if (!url) return;
  const a = document.createElement("a");
  a.href = url;
  a.download = identityFilename(
    [card.identity?.player ?? card.sourceFilename, card.cardIndex + 1],
    type,
    "png",
  );
  a.click();
}

export { identityLabel, getArtifact, artifactOfType };
export type { ArtifactType };
