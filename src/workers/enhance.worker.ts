import { processPixels } from "../lib/enhance";
import type { EnhancementSettings } from "../lib/types";

type InMsg = {
  id: string;
  width: number;
  height: number;
  buffer: ArrayBuffer;
  settings: EnhancementSettings;
};

const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<InMsg>) => void) | null;
  postMessage: (message: unknown, transfer: Transferable[]) => void;
};

ctx.onmessage = (event: MessageEvent<InMsg>) => {
  const { id, width, height, buffer, settings } = event.data;
  const src = new Uint8ClampedArray(buffer);
  const { data, blemishCount } = processPixels(src, width, height, settings);
  ctx.postMessage(
    {
      id,
      width,
      height,
      buffer: data.buffer,
      blemishCount,
    },
    [data.buffer],
  );
};
