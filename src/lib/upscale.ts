import { resampleImage } from "./image-ops";
import { cnnRestore } from "./cnn";
import type { EnhancementSettings } from "./types";

export type UpscaleResult = {
  image: ImageData;
  usedRealSr: boolean;
  model: string;
  method: "realesrgan" | "interpolation";
  scale: 2 | 4;
  width: number;
  height: number;
};

const BASE: EnhancementSettings = {
  blemishRemoval: false,
  blemishSensitivity: 0.7,
  descratch: false,
  sharpening: true,
  sharpeningAmount: 0.35,
  colorCorrection: false,
  colorTemperature: 0,
  saturation: 1,
  contrastEnhancement: false,
  contrastAmount: 0,
  noiseReduction: true,
  noiseReductionStrength: 0.25,
  upscaling: true,
  upscaleFactor: 2,
  preserveHolographic: true,
  autoCrop: false,
  identifyCards: false,
  visionOcr: false,
  cnnRestore: true,
  concurrency: 1,
  outputFormat: "png",
  outputQuality: 95,
};

export async function upscaleCard(src: ImageData, scale: 2 | 4): Promise<UpscaleResult> {
  const settings: EnhancementSettings = { ...BASE, upscaleFactor: scale, upscaling: true, cnnRestore: true };
  const restored = await cnnRestore(src, settings);
  if (restored.used) {
    return {
      image: restored.image,
      usedRealSr: true,
      model: "realesr-general-x4v3",
      method: "realesrgan",
      scale,
      width: restored.image.width,
      height: restored.image.height,
    };
  }
  const image = resampleImage(src, src.width * scale, src.height * scale);
  return {
    image,
    usedRealSr: false,
    model: "bicubic",
    method: "interpolation",
    scale,
    width: image.width,
    height: image.height,
  };
}
