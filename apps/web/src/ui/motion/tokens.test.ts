import { describe, expect, test } from "bun:test";
import { cssEase, cubicBezier, duration, easing, pickMotion, spring, staggerDelay } from "./tokens";

describe("easing tokens", () => {
  test("todas as curvas são cubic-bezier válidas (x em [0,1])", () => {
    for (const e of Object.values(easing)) {
      expect(e).toHaveLength(4);
      expect(e[0]).toBeGreaterThanOrEqual(0); expect(e[0]).toBeLessThanOrEqual(1);
      expect(e[2]).toBeGreaterThanOrEqual(0); expect(e[2]).toBeLessThanOrEqual(1);
    }
  });
  test("cssEase gera string CSS", () => expect(cssEase([0.22, 1, 0.36, 1])).toBe("cubic-bezier(0.22, 1, 0.36, 1)"));
  test("durações crescentes", () => {
    const v = [duration.instant, duration.fast, duration.base, duration.slow, duration.slower, duration.cinematic];
    expect([...v].sort((a, b) => a - b)).toEqual(v);
  });
  test("springs são do tipo spring", () => { for (const s of Object.values(spring)) expect(s.type).toBe("spring"); });
});

describe("cubicBezier", () => {
  test.each([0, 0.1, 0.25, 0.5, 0.75, 0.9, 1])("linear é identidade em %p", (t) => expect(cubicBezier(0, 0, 1, 1)(t)).toBeCloseTo(t, 5));
  test("extremos fixos e monotônica", () => {
    const f = cubicBezier(...easing.out);
    expect(f(0)).toBe(0); expect(f(1)).toBe(1);
    let prev = 0;
    for (let i = 1; i <= 100; i++) { const y = f(i / 100); expect(y).toBeGreaterThanOrEqual(prev - 1e-9); prev = y; }
  });
  test("ease-out adianta o meio", () => expect(cubicBezier(...easing.out)(0.5)).toBeGreaterThan(0.8));
  test("ease (CSS) bate com referência", () => expect(cubicBezier(0.25, 0.1, 0.25, 1)(0.5)).toBeCloseTo(0.8024, 3));
  test("t fora de [0,1] é limitado", () => { const f = cubicBezier(...easing.inOut); expect(f(-1)).toBe(0); expect(f(2)).toBe(1); });
});

describe("staggerDelay", () => {
  test.each([
    [0, 0.05, 1, 0],
    [3, 0.05, 1, 0.15],
    [100, 0.05, 0.6, 0.6],
  ])("i=%p passo=%p max=%p -> %p", (i, step, max, out) => expect(staggerDelay(i, step, max)).toBeCloseTo(out, 6));
});

describe("pickMotion (reduced-motion)", () => {
  test.each([
    [true, "estatico"],
    [false, "animado"],
    [null, "animado"],
  ] as const)("reduce=%p -> %p", (reduce, out) => expect(pickMotion(reduce, "animado", "estatico")).toBe(out));
});
