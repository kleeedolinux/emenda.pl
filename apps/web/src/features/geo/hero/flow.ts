// Geometria e agendamento puros do fluxo de dinheiro do hero (sem DOM).
export type Pt = readonly [number, number];
export interface Quad { p0: Pt; c: Pt; p1: Pt; len: number }
/** Rota de duas pernas: origem (Congresso) -> hub (Brasília no mapa) -> destino (UF). */
export interface Route { a: Quad | null; b: Quad; split: number }

/** Ponto de controle de um arco que sempre sobe; `lift` é fração da corda. */
export function arcControl(p0: Pt, p1: Pt, lift: number): Pt {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
  const chord = Math.hypot(dx, dy);
  return [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2 - chord * lift];
}

export function quadPoint(p0: Pt, c: Pt, p1: Pt, t: number): [number, number] {
  if (t <= 0) return [p0[0], p0[1]];
  if (t >= 1) return [p1[0], p1[1]];
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]];
}

const r1 = (n: number) => Math.round(n * 10) / 10;
export const quadPath = (p0: Pt, c: Pt, p1: Pt) => `M${r1(p0[0])},${r1(p0[1])}Q${r1(c[0])},${r1(c[1])} ${r1(p1[0])},${r1(p1[1])}`;

export function quadLength(p0: Pt, c: Pt, p1: Pt, steps = 24): number {
  let len = 0, prev: Pt = p0;
  for (let i = 1; i <= steps; i++) { const p = quadPoint(p0, c, p1, i / steps); len += Math.hypot(p[0] - prev[0], p[1] - prev[1]); prev = p; }
  return len;
}

const quad = (p0: Pt, p1: Pt, lift: number): Quad => { const c = arcControl(p0, p1, lift); return { p0, c, p1, len: quadLength(p0, c, p1) }; };

export function route(src: Pt | null, hub: Pt, dst: Pt, lift: number): Route {
  const b = quad(hub, dst, lift);
  if (!src) return { a: null, b, split: 0 };
  const a = quad(src, hub, lift * 0.6);
  return { a, b, split: a.len / (a.len + b.len || 1) };
}

/** Ponto em t∈[0,1] ao longo da rota completa (velocidade ~uniforme entre pernas). */
export function routePoint(r: Route, t: number): [number, number] {
  if (r.a && t < r.split) return quadPoint(r.a.p0, r.a.c, r.a.p1, t / r.split);
  const u = r.split >= 1 ? 1 : (t - r.split) / (1 - r.split);
  return quadPoint(r.b.p0, r.b.c, r.b.p1, u);
}

/** Distribui `n` partículas proporcionalmente aos pesos (maiores restos), com `min` por chave de peso > 0. */
export function apportion(weights: Record<string, number>, n: number, min = 0): Record<string, number> {
  const keys = Object.keys(weights).filter((k) => (weights[k] ?? 0) > 0).sort();
  if (!keys.length || n <= 0) return {};
  const out: Record<string, number> = {};
  const base = Math.min(min, Math.floor(n / keys.length));
  let left = n - base * keys.length;
  const total = keys.reduce((a, k) => a + weights[k]!, 0);
  const rema: Array<[string, number]> = [];
  for (const k of keys) {
    const q = (weights[k]! / total) * left;
    out[k] = base + Math.floor(q);
    rema.push([k, q - Math.floor(q)]);
  }
  left = n - Object.values(out).reduce((a, b) => a + b, 0);
  rema.sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1));
  for (let i = 0; i < left; i++) out[rema[i % rema.length]![0]]!++;
  return out;
}

export interface Slot { key: string; phase: number; travel: number; period: number; jitter: number }

/** Slots periódicos: fase pela razão áurea (espalha sem aleatoriedade). */
export function buildSlots(counts: Record<string, number>, { period, travel }: { period: number; travel: number }): Slot[] {
  const out: Slot[] = [];
  let i = 0;
  for (const k of Object.keys(counts).sort()) {
    for (let j = 0; j < counts[k]!; j++, i++) {
      const phase = (i * 0.6180339887498949) % 1;
      const jitter = ((i * 0.7548776662) % 1) - 0.5; // [-0.5, 0.5)
      out.push({ key: k, phase, travel: travel * (1 + jitter * 0.35), period, jitter });
    }
  }
  return out;
}

/** Progresso [0,1] do slot no instante `t` (s), ou -1 se ocioso. */
export function slotAt(s: Slot, t: number): number {
  const local = (((t / s.period + s.phase) % 1) + 1) % 1 * s.period;
  return local <= s.travel ? local / s.travel : -1;
}

/** Chaves que chegaram ao destino no intervalo (t0, t1]. Com `since`, ignora partículas emitidas antes dele. */
export function arrivalsBetween(slots: Slot[], t0: number, t1: number, since = -Infinity): string[] {
  const out: string[] = [];
  for (const s of slots) {
    // Instantes de chegada: t = (k - phase) * period + travel, k inteiro.
    const k0 = Math.floor((t0 - s.travel) / s.period + s.phase);
    for (let k = k0; k <= k0 + 1 + Math.ceil((t1 - t0) / s.period); k++) {
      const ta = (k - s.phase) * s.period + s.travel;
      if (ta > t0 && ta <= t1 && ta - s.travel >= since) out.push(s.key);
    }
  }
  return out;
}
