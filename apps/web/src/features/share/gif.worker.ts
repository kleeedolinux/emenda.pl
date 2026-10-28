// Codificador GIF fora da thread principal (gifenc). Paleta global única a partir de uma amostra.
import { GIFEncoder, applyPalette, quantize, snapColorsToPalette, type Encoder, type Palette } from "gifenc";

export type GifIn =
  | { type: "start"; width: number; height: number; sample: Uint8ClampedArray }
  | { type: "frame"; rgba: Uint8ClampedArray; delay: number }
  | { type: "end" };
export type GifOut = { type: "frame"; n: number } | { type: "done"; bytes: Uint8Array };

const BRAND: Palette = [[0, 156, 59], [31, 195, 95], [255, 223, 0], [0, 39, 118], [0, 26, 79], [0, 12, 38], [255, 255, 255], [255, 90, 95]];

let enc: Encoder | null = null;
let palette: Palette = [];
let w = 0, h = 0, n = 0;

self.onmessage = (e: MessageEvent<GifIn>) => {
  const m = e.data;
  if (m.type === "start") {
    w = m.width; h = m.height; n = 0;
    palette = quantize(m.sample, 256);
    snapColorsToPalette(palette, BRAND, 12);
    enc = GIFEncoder();
  } else if (m.type === "frame" && enc) {
    enc.writeFrame(applyPalette(m.rgba, palette), w, h, { palette, delay: m.delay, repeat: 0 });
    (self as unknown as Worker).postMessage({ type: "frame", n: ++n } satisfies GifOut);
  } else if (m.type === "end" && enc) {
    enc.finish();
    const bytes = enc.bytes();
    enc = null;
    (self as unknown as Worker).postMessage({ type: "done", bytes } satisfies GifOut, [bytes.buffer]);
  }
};
