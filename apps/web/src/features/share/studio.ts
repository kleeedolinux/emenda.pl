// Exportadores (PNG, GIF, vídeo) e compartilhamento de arquivos. Carregado sob demanda pelo ShareDialog.
import { absoluteUrl, buildMessage, type ShareData } from "./links";
import { qrMatrix } from "./qr";
import { drawScene, SIZES, STILL_T, type Assets, type Format } from "./scene";
import { frameSchedule, GIF_FIRST, nextGifAttempt, pickVideoMime, REEL_MS, type GifAttempt } from "./timeline";
import type { GifIn, GifOut } from "./gif.worker";

export { SIZES, STILL_T, type Format };

let logoP: Promise<HTMLImageElement | null> | null = null;
function loadLogo(): Promise<HTMLImageElement | null> {
  logoP ??= new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = "/brand/logo-mark.svg";
  });
  return logoP;
}

async function loadFonts() {
  if (typeof document === "undefined" || !document.fonts) return;
  const specs = ['700 80px "Space Grotesk"', "400 32px Inter", "600 32px Inter", "700 32px Inter", "800 120px Inter"];
  await Promise.race([Promise.allSettled(specs.map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 2500))]);
}

export async function loadAssets(d: ShareData): Promise<Assets> {
  const [logo] = await Promise.all([loadLogo(), loadFonts()]);
  return { logo, qr: qrMatrix(absoluteUrl(d.url)) };
}

export function sizeFor(format: Format, width?: number): [number, number] {
  const [W, H] = SIZES[format];
  const w = width ?? W;
  return [w, Math.round((w * H) / W)];
}

export function paint(canvas: HTMLCanvasElement, d: ShareData, t: number, a: Assets) {
  const ctx = canvas.getContext("2d");
  if (ctx) drawScene(ctx, canvas.width, canvas.height, d, t, a);
}

function canvasOf(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

export async function renderStill(d: ShareData, format: Format): Promise<Blob> {
  const a = await loadAssets(d);
  const [w, h] = sizeFor(format);
  const c = canvasOf(w, h);
  paint(c, d, STILL_T, a);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("toBlob falhou"))), "image/png"));
}

export interface Progress { (p: number, note?: string): void }

async function encodeGif(d: ShareData, format: Format, at: GifAttempt, a: Assets, onProgress: Progress, signal?: AbortSignal): Promise<Blob> {
  const [w, h] = sizeFor(format, at.width);
  const c = canvasOf(w, h);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  const grab = (t: number) => { drawScene(ctx, w, h, d, t, a); return ctx.getImageData(0, 0, w, h).data; };
  const sched = frameSchedule(REEL_MS, at.fps);
  const worker = new Worker(new URL("./gif.worker.ts", import.meta.url), { type: "module" });
  try {
    const post = (m: GifIn, tr: Transferable[] = []) => worker.postMessage(m, tr);
    const next = () => new Promise<GifOut>((res, rej) => {
      worker.onmessage = (e: MessageEvent<GifOut>) => res(e.data);
      worker.onerror = (e) => rej(new Error(e.message || "falha no codificador GIF"));
    });
    const s1 = grab(STILL_T), s2 = grab(0.93);
    const sample = new Uint8ClampedArray(s1.length + s2.length);
    sample.set(s1); sample.set(s2, s1.length);
    post({ type: "start", width: w, height: h, sample }, [sample.buffer]);
    for (let i = 0; i < sched.count; i++) {
      if (signal?.aborted) throw new DOMException("cancelado", "AbortError");
      const rgba = grab(sched.times[i]!);
      const ack = next();
      post({ type: "frame", rgba, delay: sched.delays[i]! }, [rgba.buffer]);
      await ack;
      onProgress((i + 1) / sched.count);
    }
    const done = next();
    post({ type: "end" });
    const out = await done;
    if (out.type !== "done") throw new Error("GIF incompleto");
    return new Blob([out.bytes as BlobPart], { type: "image/gif" });
  } finally {
    worker.terminate();
  }
}

/** GIF ≤ 3 MB (limite prático do WhatsApp): reduz fps/largura se preciso. */
export async function renderGif(d: ShareData, format: Format, onProgress: Progress, signal?: AbortSignal): Promise<Blob> {
  const a = await loadAssets(d);
  let at: GifAttempt | null = GIF_FIRST;
  let blob: Blob | null = null;
  while (at) {
    const cur: GifAttempt = at;
    blob = await encodeGif(d, format, cur, a, (p) => onProgress(p, `${cur.width}px · ${cur.fps} fps`), signal);
    at = nextGifAttempt(cur, blob.size);
  }
  return blob!;
}

export const videoMime = () =>
  typeof MediaRecorder !== "undefined" && typeof HTMLCanvasElement.prototype.captureStream === "function"
    ? pickVideoMime((m) => MediaRecorder.isTypeSupported(m))
    : null;

/** Grava o reel em tempo real (MediaRecorder). MP4 quando o navegador suporta; senão WebM. */
export async function recordVideo(d: ShareData, format: Format, onProgress: Progress, signal?: AbortSignal): Promise<Blob> {
  const mime = videoMime();
  if (!mime) throw new Error("Este navegador não grava vídeo a partir de canvas.");
  const a = await loadAssets(d);
  const [w, h] = sizeFor(format, 720);
  const c = canvasOf(w, h);
  paint(c, d, 0, a);
  const stream = c.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 5_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise<void>((r) => { rec.onstop = () => r(); });
  rec.start(250);
  const t0 = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const t = (performance.now() - t0) / REEL_MS;
      if (signal?.aborted || t >= 1) { paint(c, d, 0.999, a); resolve(); return; }
      paint(c, d, t, a);
      onProgress(t);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await new Promise((r) => setTimeout(r, 120));
  rec.stop();
  await stopped;
  stream.getTracks().forEach((t) => t.stop());
  if (signal?.aborted) throw new DOMException("cancelado", "AbortError");
  return new Blob(chunks, { type: mime.split(";")[0] });
}

export const extOf = (b: Blob) => (b.type === "image/gif" ? "gif" : b.type === "image/png" ? "png" : b.type === "video/mp4" ? "mp4" : "webm");

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const canShareFiles = (b: Blob, name: string) => {
  try { return !!navigator.canShare?.({ files: [new File([b], name, { type: b.type })] }); } catch { return false; }
};

/** Web Share com arquivo quando possível; senão baixa. */
export async function shareFile(blob: Blob, name: string, d: ShareData): Promise<"shared" | "downloaded" | "cancelled"> {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: d.title, text: `${buildMessage(d)} ${absoluteUrl(d.url)}` });
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "cancelled";
    }
  }
  download(blob, name);
  return "downloaded";
}
