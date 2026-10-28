// Agenda de quadros e tempo do mini-reel (puro, testável).

/** Atrasos em ms múltiplos de 10 (GIF usa centésimos) com soma exata; `times` normalizados em [0,1). */
export function frameSchedule(durationMs: number, fps: number): { count: number; delays: number[]; times: number[] } {
  const count = Math.max(1, Math.round((durationMs / 1000) * fps));
  const delays: number[] = [];
  const times: number[] = [];
  let acc = 0;
  for (let i = 0; i < count; i++) {
    times.push(i / count);
    const next = Math.round(((i + 1) * durationMs) / count / 10) * 10;
    delays.push(next - acc);
    acc = next;
  }
  return { count, delays, times };
}

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** Progresso local de `t` no intervalo [a,b]. */
export const phase = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
export const easeOutCubic = (p: number) => 1 - (1 - clamp01(p)) ** 3;
export const easeInOut = (p: number) => { const x = clamp01(p); return x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2; };

/** Fases do reel em fração da duração. */
export const REEL_PHASES = {
  intro: [0, 0.14],
  count: [0.1, 0.55],
  chart: [0.3, 0.72],
  hold: [0.72, 0.84],
  sting: [0.84, 1],
} as const satisfies Record<string, readonly [number, number]>;

export const countUp = (value: number, p: number) => Math.round(value * easeOutCubic(p));

export const REEL_MS = 4000;
export const GIF_MAX_BYTES = 3 * 1024 * 1024;
export interface GifAttempt { width: number; fps: number }
export const GIF_FIRST: GifAttempt = { width: 540, fps: 15 };

/** Próxima tentativa quando o GIF passou do limite do WhatsApp; null = aceitar. */
export function nextGifAttempt(a: GifAttempt, bytes: number): GifAttempt | null {
  if (bytes <= GIF_MAX_BYTES) return null;
  if (a.fps > 10) return { ...a, fps: 10 };
  if (a.width > 432) return { ...a, width: 432 };
  if (a.width > 360) return { ...a, width: 360 };
  return null;
}

const VIDEO_MIMES = ["video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp9", "video/webm"];
export function pickVideoMime(supported: (m: string) => boolean): string | null {
  return VIDEO_MIMES.find(supported) ?? null;
}
