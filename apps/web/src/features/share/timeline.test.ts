import { describe, expect, test } from "bun:test";
import { countUp, easeOutCubic, frameSchedule, nextGifAttempt, phase, pickVideoMime, REEL_PHASES, GIF_MAX_BYTES } from "./timeline";

describe("frameSchedule", () => {
  test.each([
    [4000, 15, 60],
    [5000, 15, 75],
    [3000, 10, 30],
  ])("%pms @ %pfps", (ms, fps, n) => {
    const s = frameSchedule(ms, fps);
    expect(s.count).toBe(n);
    expect(s.times.length).toBe(n);
    expect(s.delays.length).toBe(n);
    // GIF só aceita centésimos: atrasos múltiplos de 10 ms e soma exata.
    for (const d of s.delays) expect(d % 10).toBe(0);
    expect(s.delays.reduce((a, b) => a + b, 0)).toBe(ms);
    expect(s.times[0]).toBe(0);
    expect(s.times.at(-1)!).toBeLessThan(1);
    for (let i = 1; i < n; i++) expect(s.times[i]!).toBeGreaterThan(s.times[i - 1]!);
  });
  test("15 fps alterna 60/70 ms", () => {
    expect(new Set(frameSchedule(4000, 15).delays)).toEqual(new Set([60, 70]));
  });
});

describe("phase", () => {
  test.each([
    [0, 0.2, 0.6, 0],
    [0.2, 0.2, 0.6, 0],
    [0.4, 0.2, 0.6, 0.5],
    [0.6, 0.2, 0.6, 1],
    [0.9, 0.2, 0.6, 1],
  ])("t=%p [%p,%p] -> %p", (t, a, b, out) => expect(phase(t, a, b)).toBeCloseTo(out, 6));
  test("fases do reel cobrem 0..1 em ordem", () => {
    const ps = Object.values(REEL_PHASES);
    for (const [a, b] of ps) { expect(a).toBeGreaterThanOrEqual(0); expect(b).toBeLessThanOrEqual(1); expect(b).toBeGreaterThan(a); }
  });
});

describe("easing e contagem", () => {
  test("easeOutCubic limites", () => { expect(easeOutCubic(0)).toBe(0); expect(easeOutCubic(1)).toBe(1); expect(easeOutCubic(0.5)).toBeGreaterThan(0.5); });
  test.each([[0, 0], [1, 1000], [0.5, 875]])("countUp(1000, %p) = %p", (p, out) => expect(countUp(1000, p)).toBe(out));
  test("monotônica", () => {
    let prev = -1;
    for (let i = 0; i <= 20; i++) { const v = countUp(98765, i / 20); expect(v).toBeGreaterThanOrEqual(prev); prev = v; }
  });
});

describe("nextGifAttempt", () => {
  test("dentro do limite: para", () => expect(nextGifAttempt({ width: 540, fps: 15 }, GIF_MAX_BYTES - 1)).toBeNull());
  test("acima: reduz fps, depois largura, depois desiste", () => {
    let a = nextGifAttempt({ width: 540, fps: 15 }, GIF_MAX_BYTES + 1);
    expect(a).toEqual({ width: 540, fps: 10 });
    a = nextGifAttempt(a!, GIF_MAX_BYTES * 2);
    expect(a).toEqual({ width: 432, fps: 10 });
    a = nextGifAttempt(a!, GIF_MAX_BYTES * 2);
    expect(a).toEqual({ width: 360, fps: 10 });
    expect(nextGifAttempt(a!, GIF_MAX_BYTES * 2)).toBeNull();
  });
});

describe("pickVideoMime", () => {
  test("prefere MP4", () => expect(pickVideoMime(() => true)).toBe("video/mp4;codecs=avc1.42E01E"));
  test("cai para WebM", () => expect(pickVideoMime((m) => m.startsWith("video/webm"))).toBe("video/webm;codecs=vp9"));
  test("sem suporte", () => expect(pickVideoMime(() => false)).toBeNull());
});
