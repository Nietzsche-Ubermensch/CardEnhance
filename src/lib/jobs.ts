import { create } from "zustand";
import {
  defaultSettings,
  type CardImage,
  type EnhancementSettings,
  type ProcessingJob,
} from "./types";
import { autoCropCard, rotate180 } from "./detect";
import { identifyCard } from "./identify";
import { cnnRestore } from "./cnn";
import {
  createEnhancePool,
  expandFiles,
  fileToImageData,
  imageDataToUrl,
} from "./pipeline";

type StudioState = {
  settings: EnhancementSettings;
  jobs: ProcessingJob[];
  activeTab: string;
  selectedJobId: string | null;
  busy: boolean;
  setSettings: (next: EnhancementSettings) => void;
  setTab: (tab: string) => void;
  selectJob: (id: string | null) => void;
  removeJob: (id: string) => void;
  startJob: (files: File[]) => Promise<void>;
};

function newId() {
  return crypto.randomUUID();
}

function revokeObjectUrl(url: string | undefined) {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}

export const useStudio = create<StudioState>((set, get) => ({
  settings: defaultSettings,
  jobs: [],
  activeTab: "upload",
  selectedJobId: null,
  busy: false,
  setSettings: (next) => set({ settings: next }),
  setTab: (tab) => set({ activeTab: tab }),
  selectJob: (id) => set({ selectedJobId: id, activeTab: id ? "preview" : get().activeTab }),
  removeJob: (id) =>
    set((state) => {
      const removed = state.jobs.find((job) => job.id === id);
      removed?.images.forEach((image) => {
        revokeObjectUrl(image.originalUrl);
        revokeObjectUrl(image.enhancedUrl);
      });
      return {
        jobs: state.jobs.filter((j) => j.id !== id),
        selectedJobId: state.selectedJobId === id ? null : state.selectedJobId,
      };
    }),
  startJob: async (files) => {
    const settings = { ...get().settings };
    const expanded = await expandFiles(files);
    if (expanded.length === 0) throw new Error("No images found in the selection");

    const jobId = newId();
    const images: CardImage[] = expanded.map((file) => ({
      id: newId(),
      name: file.name,
      originalUrl: URL.createObjectURL(file),
      blemishCount: 0,
      width: 0,
      height: 0,
      cropped: false,
      status: "queued",
    }));

    const job: ProcessingJob = {
      id: jobId,
      createdAt: Date.now(),
      status: "processing",
      progress: 0,
      settings,
      images,
    };

    set((state) => ({
      jobs: [job, ...state.jobs],
      activeTab: "jobs",
      busy: true,
    }));

    const pool = createEnhancePool(settings.concurrency);
    const total = expanded.length;
    let finished = 0;
    let cursor = 0;

    const processOne = async (index: number) => {
      const file = expanded[index];
      const imageId = images[index].id;
      set((state) => ({
        jobs: state.jobs.map((j) =>
          j.id !== jobId
            ? j
            : {
                ...j,
                images: j.images.map((img) =>
                  img.id === imageId ? { ...img, status: "processing" } : img,
                ),
              },
        ),
      }));

      try {
        let pixels = await fileToImageData(file);
        let cropped = false;
        let cropEngine: CardImage["cropEngine"] = null;
        if (settings.autoCrop) {
          const crop = await autoCropCard(pixels);
          pixels = crop.image;
          cropped = crop.cropped;
          cropEngine = crop.engine;
        }

        let identity = images[index].identity;
        if (settings.identifyCards) {
          try {
            const result = await identifyCard(pixels, file.name, { vision: settings.visionOcr });
            identity = result.identity;
            if (result.rotated) pixels = rotate180(pixels);
          } catch {
            identity = undefined;
          }
        }

        const alignedOriginal = await imageDataToUrl(pixels, {
          ...settings,
          upscaling: false,
          outputFormat: "jpg",
          outputQuality: 88,
        });
        const classical = await pool.enhance(pixels, settings);
        let image = classical.image;
        let blemishCount = classical.blemishCount;
        let cnn = false;
        if (settings.cnnRestore || settings.upscaling) {
          const restored = await cnnRestore(image, settings);
          image = restored.image;
          cnn = restored.used;
        }
        const enhancedUrl = await imageDataToUrl(image, {
          ...settings,
          upscaling: settings.upscaling && !cnn,
        });
        const factor = settings.upscaling && !cnn ? settings.upscaleFactor : 1;
        finished += 1;
        set((state) => ({
          jobs: state.jobs.map((j) =>
            j.id !== jobId
              ? j
              : {
                  ...j,
                  progress: Math.round((finished / total) * 100),
                  images: j.images.map((img) => {
                    if (img.id !== imageId) return img;
                    revokeObjectUrl(img.originalUrl);
                    return {
                      ...img,
                      originalUrl: alignedOriginal,
                      enhancedUrl,
                      blemishCount,
                      width: image.width * factor,
                      height: image.height * factor,
                      cropped,
                      cropEngine,
                      cnn,
                      identity,
                      status: "completed" as const,
                    };
                  }),
                },
          ),
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Enhancement failed";
        finished += 1;
        set((state) => ({
          jobs: state.jobs.map((j) =>
            j.id !== jobId
              ? j
              : {
                  ...j,
                  progress: Math.round((finished / total) * 100),
                  images: j.images.map((img) =>
                    img.id === imageId ? { ...img, status: "failed", error: message } : img,
                  ),
                },
          ),
        }));
      }
    };

    try {
      const workers = Array.from({ length: Math.min(pool.size, total) }, async () => {
        while (true) {
          const index = cursor++;
          if (index >= total) return;
          await processOne(index);
        }
      });
      await Promise.all(workers);

      set((state) => {
        const current = state.jobs.find((j) => j.id === jobId);
        const failed = current?.images.every((img) => img.status === "failed");
        return {
          jobs: state.jobs.map((j) =>
            j.id !== jobId
              ? j
              : {
                  ...j,
                  status: failed ? "failed" : "completed",
                  progress: 100,
                },
          ),
          busy: false,
          selectedJobId: failed ? state.selectedJobId : jobId,
          activeTab: failed ? "jobs" : "preview",
        };
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Job failed";
      set((state) => ({
        jobs: state.jobs.map((j) =>
          j.id === jobId ? { ...j, status: "failed", error: message } : j,
        ),
        busy: false,
      }));
      throw err;
    } finally {
      pool.terminate();
    }
  },
}));
