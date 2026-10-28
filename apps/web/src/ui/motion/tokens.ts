// Tokens de movimento do emenda.online. Puro: sem React, usável em CSS, motion e canvas.
export type Bezier = readonly [number, number, number, number];

/** Durações em segundos. */
export const duration = {
  instant: 0.12,
  fast: 0.2,
  base: 0.35,
  slow: 0.6,
  slower: 0.9,
  cinematic: 1.4,
} as const;

/** Curvas cubic-bezier. `out` é a padrão da marca. */
export const easing = {
  out: [0.22, 1, 0.36, 1],
  expo: [0.16, 1, 0.3, 1],
  inOut: [0.65, 0, 0.35, 1],
  emphasized: [0.2, 0, 0, 1],
  in: [0.55, 0, 1, 0.45],
} as const satisfies Record<string, Bezier>;

/** Molas (motion). `snappy` p/ press, `lift` p/ hover, `soft` p/ layout, `bouncy` p/ tooltips. */
export const spring = {
  snappy: { type: "spring", stiffness: 520, damping: 34, mass: 0.8 },
  lift: { type: "spring", stiffness: 380, damping: 26 },
  soft: { type: "spring", stiffness: 170, damping: 24 },
  bouncy: { type: "spring", stiffness: 420, damping: 18, mass: 0.7 },
} as const;

/** Passos de cascata (s). */
export const staggerStep = { tight: 0.025, base: 0.06, loose: 0.1 } as const;

export const cssEase = (e: Bezier) => `cubic-bezier(${e.join(", ")})`;

/** Atraso em cascata limitado (listas longas não demoram a aparecer). */
export const staggerDelay = (i: number, step: number = staggerStep.base, max = 0.6) => Math.min(i * step, max);

/** Escolhe a variante reduzida quando o usuário pede menos movimento. */
export function pickMotion<T>(reduce: boolean | null | undefined, full: T, reduced: T): T {
  return reduce ? reduced : full;
}

/** Avalia cubic-bezier CSS (x->y). Newton + bisseção; usado no canvas do hero. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (u: number) => ((ax * u + bx) * u + cx) * u;
  const sy = (u: number) => ((ay * u + by) * u + cy) * u;
  const dx = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  const solve = (x: number) => {
    let u = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(u) - x;
      if (Math.abs(e) < 1e-7) return u;
      const d = dx(u);
      if (Math.abs(d) < 1e-6) break;
      u -= e / d;
    }
    let lo = 0, hi = 1;
    u = x;
    while (hi - lo > 1e-7) { if (sx(u) < x) lo = u; else hi = u; u = (lo + hi) / 2; }
    return u;
  };
  return (t) => (t <= 0 ? 0 : t >= 1 ? 1 : sy(solve(t)));
}
