// Motor de partículas em canvas 2D: dinheiro saindo do Congresso, passando por Brasília
// e chegando aos estados. Imperativo e sem React: um rAF, nenhuma alocação por partícula.
import { cubicBezier, easing } from "@/ui/motion/tokens";
import { arrivalsBetween, route, routePoint, slotAt, type Pt, type Route, type Slot } from "./flow";

export interface FlowState { key: string; d: string; c: Pt; level: number }
/** Posição atual (px CSS, relativo ao canvas) do mapa (viewBox -> tela) e da origem. */
export interface FlowFrame { map: { x: number; y: number; k: number }; src: Pt | null }
export interface FlowOptions {
  canvas: HTMLCanvasElement;
  /** Canvas estático dos fios (redesenhado só quando o mapa se move): o quadro animado não repinta as trilhas. */
  trails?: HTMLCanvasElement;
  states: FlowState[];
  hub: Pt; // Brasília, coordenadas do viewBox do mapa
  slots: Slot[];
  measure: () => FlowFrame | null;
  dark: () => boolean;
  onArrive?: (key: string) => void;
}

const ease = cubicBezier(...easing.inOut);
const TAIL = 9, TAIL_STEP = 0.016, PULSE = 1.1;
// Estilos da cauda pré-calculados (nenhuma string montada por quadro).
const TAIL_STYLE = Array.from({ length: TAIL + 1 }, (_, i) => {
  const a = 1 - i / (TAIL + 1);
  return { w: 2.4 * a + 0.3, dark: `rgba(255,214,0,${(a * 0.55).toFixed(3)})`, light: `rgba(0,140,55,${(a * 0.6).toFixed(3)})` };
});

function sprite(color: string, glow: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 48;
  const g = c.getContext("2d")!;
  const rg = g.createRadialGradient(24, 24, 0, 24, 24, 24);
  rg.addColorStop(0, "#ffffff");
  rg.addColorStop(0.18, color);
  rg.addColorStop(0.45, glow);
  rg.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = rg;
  g.fillRect(0, 0, 48, 48);
  return c;
}

export function createFlow(o: FlowOptions) {
  const ctx = o.canvas.getContext("2d", { alpha: true })!;
  const tctx = o.trails?.getContext("2d", { alpha: true }) ?? null;
  let trailsDark: boolean | null = null;
  const paths = new Map(o.states.map((s) => [s.key, new Path2D(s.d)]));
  const byKey = new Map(o.states.map((s) => [s.key, s]));
  const pulses = new Map<string, number>(); // chave -> instante da última chegada
  const sprites = { light: sprite("#ffc400", "rgba(0,156,59,0.35)"), dark: sprite("#ffe14d", "rgba(255,200,0,0.35)") };
  let raf = 0, t0 = 0, last = 0, w = 0, h = 0, dpr = 1;
  let routes = new Map<string, Route>();
  const pts = new Float32Array(o.slots.length * (TAIL + 1) * 2), sizes = new Float32Array(o.slots.length);
  let frameSig = "";

  function resize() {
    const r = o.canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, r.width < 640 ? 1.5 : 2);
    w = r.width; h = r.height;
    for (const c of o.trails ? [o.canvas, o.trails] : [o.canvas]) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    frameSig = "";
  }

  function rebuild(f: FlowFrame) {
    const sig = `${f.map.x | 0},${f.map.y | 0},${(f.map.k * 1000) | 0},${f.src ? `${f.src[0] | 0},${f.src[1] | 0}` : "-"}`;
    if (sig === frameSig) return;
    frameSig = sig;
    const P = (p: Pt): Pt => [f.map.x + p[0] * f.map.k, f.map.y + p[1] * f.map.k];
    const hub = P(o.hub);
    routes = new Map(o.states.map((s) => [s.key, route(f.src, hub, P(s.c), 0.32)]));
    trailsDark = null;
  }

  // Fios de luz tênues. Num canvas próprio, só quando as rotas ou o tema mudam.
  function strokeTrails(g: CanvasRenderingContext2D, dark: boolean) {
    g.lineCap = "round";
    g.lineWidth = 1;
    g.strokeStyle = dark ? "rgba(255,223,0,0.10)" : "rgba(0,112,43,0.13)";
    g.beginPath();
    for (const r of routes.values()) {
      if (r.a) { g.moveTo(r.a.p0[0], r.a.p0[1]); g.quadraticCurveTo(r.a.c[0], r.a.c[1], r.a.p1[0], r.a.p1[1]); }
      g.moveTo(r.b.p0[0], r.b.p0[1]); g.quadraticCurveTo(r.b.c[0], r.b.c[1], r.b.p1[0], r.b.p1[1]);
    }
    g.stroke();
  }

  function draw(t: number, animate: boolean) {
    const f = o.measure();
    if (!f || !w) return;
    rebuild(f);
    const dark = o.dark();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // 1. trilhas fixas (fios de luz)
    if (tctx) {
      if (trailsDark !== dark) { trailsDark = dark; tctx.setTransform(dpr, 0, 0, dpr, 0, 0); tctx.clearRect(0, 0, w, h); strokeTrails(tctx, dark); }
    } else strokeTrails(ctx, dark);
    ctx.lineCap = "round";

    // 2. pulsos dos estados que receberam dinheiro (Path2D no espaço do viewBox)
    ctx.save();
    ctx.setTransform(dpr * f.map.k, 0, 0, dpr * f.map.k, dpr * f.map.x, dpr * f.map.y);
    for (const [k, at] of pulses) {
      const age = (t - at) / PULSE;
      if (age >= 1 || age < 0) { if (age >= 1) pulses.delete(k); continue; }
      const p = paths.get(k), s = byKey.get(k);
      if (!p || !s) continue;
      ctx.globalAlpha = (1 - age) * (1 - age) * (0.14 + 0.3 * s.level);
      ctx.fillStyle = dark ? "#ffd400" : "#ffd23a";
      ctx.fill(p);
    }
    ctx.restore();

    // 3. partículas com cauda. Cauda em lotes: um stroke por segmento (TAIL strokes/quadro, não N×TAIL).
    const spr = dark ? sprites.dark : sprites.light;
    let n = 0;
    for (const s of o.slots) {
      const p = slotAt(s, t);
      if (p < 0) continue;
      if (animate && t - p * s.travel < 0) continue; // ainda não emitida (entrada gradual)
      const r = routes.get(s.key);
      if (!r) continue;
      const e = ease(p);
      const base = n * (TAIL + 1) * 2;
      for (let i = 0; i <= TAIL; i++) {
        const [x, y] = routePoint(r, Math.max(0, e - i * TAIL_STEP));
        pts[base + i * 2] = x; pts[base + i * 2 + 1] = y;
      }
      sizes[n] = 13 + 5 * Math.sin(p * Math.PI);
      n++;
    }
    ctx.globalCompositeOperation = dark ? "lighter" : "source-over";
    for (let i = 1; i <= TAIL; i++) {
      const st = TAIL_STYLE[i]!;
      ctx.strokeStyle = dark ? st.dark : st.light;
      ctx.lineWidth = st.w;
      ctx.beginPath();
      for (let k = 0; k < n; k++) {
        const b = k * (TAIL + 1) * 2;
        ctx.moveTo(pts[b + (i - 1) * 2]!, pts[b + (i - 1) * 2 + 1]!);
        ctx.lineTo(pts[b + i * 2]!, pts[b + i * 2 + 1]!);
      }
      ctx.stroke();
    }
    for (let k = 0; k < n; k++) {
      const b = k * (TAIL + 1) * 2, sz = sizes[k]!;
      ctx.drawImage(spr, pts[b]! - sz / 2, pts[b + 1]! - sz / 2, sz, sz);
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function frame(now: number) {
    const t = (now - t0) / 1000;
    if (last) for (const k of arrivalsBetween(o.slots, last, t, 0)) { pulses.set(k, t); o.onArrive?.(k); }
    last = t;
    draw(t, true);
    raf = requestAnimationFrame(frame);
  }

  return {
    resize,
    /** Inicia/retoma o loop (o relógio continua de onde parou). */
    start() {
      if (raf) return;
      const now = performance.now();
      t0 = last ? now - last * 1000 : now;
      raf = requestAnimationFrame(frame);
    },
    stop() { cancelAnimationFrame(raf); raf = 0; },
    /** Quadro estático (reduced-motion): partículas congeladas em meio voo. */
    still() { draw(2.6, false); },
    destroy() { cancelAnimationFrame(raf); raf = 0; },
  };
}
