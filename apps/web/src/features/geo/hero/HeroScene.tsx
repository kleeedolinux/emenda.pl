// Cena do hero (chunk lazy): Brasília em camadas com parallax + Brasil de vidro + fluxo de partículas.
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useEffect, useMemo, useRef, type Ref } from "react";
import { createPortal } from "react-dom";
import { useActive } from "@/ui/motion/useActive";
import { createFlow, type FlowFrame } from "./FlowCanvas";
import { apportion, buildSlots, type Pt } from "./flow";
import { GlassMap, MAP, type Chip, type MapState } from "./GlassMap";
import { HERO_UF } from "./paths";
import { LayerFar, LayerFront, LayerFrontFx, LayerMid, LayerMidFx } from "./Skyline";

export interface HeroSceneProps {
  section: HTMLElement;
  anchor: HTMLElement | null;
  /** Valor pago por UF (sigla -> centavos), de brasil.json. */
  pesoPorUf?: Record<string, number>;
  /** Clique num estado (mapa ou selo). */
  onUf?: (uf: string) => void;
  nomeUf?: (uf: string) => string;
}

const CHIPS: Array<[string, -1 | 1]> = [["SP", -1], ["RJ", 1], ["BA", 1], ["CE", 1]];
/** Tema escuro, lido só quando muda (nada de matchMedia por quadro). */
function themeWatcher() {
  const mq = matchMedia("(prefers-color-scheme: dark)");
  const read = () => { const t = document.documentElement.dataset.theme; return t ? t === "dark" : mq.matches; };
  let dark = read();
  const on = () => { dark = read(); };
  const mo = new MutationObserver(on);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  mq.addEventListener("change", on);
  return { dark: () => dark, stop: () => { mo.disconnect(); mq.removeEventListener("change", on); } };
}
/** Folga (px) para o parallax e a entrada do mapa não saírem do canvas. */
const PAD = 48;

export default function HeroScene({ section, anchor, pesoPorUf, onUf, nomeUf }: HeroSceneProps) {
  const reduce = !!useReducedMotion();
  const secRef = useRef<HTMLElement | null>(section);
  secRef.current = section;
  const active = useActive(secRef);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trailsRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<SVGSVGElement>(null);
  const towerRef = useRef<SVGCircleElement>(null);
  const chipEls = useRef(new Map<string, HTMLSpanElement>());

  // ---------- geometria do mapa ----------
  // Caminhos pré-projetados (scripts/hero-paths.ts): sem download da malha nem d3 no primeiro quadro.
  const geo = useMemo(() => {
    const raw = HERO_UF;
    const hub: Pt = raw.find((s) => s.key === "DF")?.c ?? [MAP.w * 0.62, MAP.h * 0.55];
    const vals = raw.map((s) => pesoPorUf?.[s.key] ?? 0);
    const max = Math.max(1, ...vals);
    const far = Math.max(...raw.map((s) => Math.hypot(s.c[0] - hub[0], s.c[1] - hub[1])));
    const states: MapState[] = raw.map((s, i) => ({ ...s, level: Math.sqrt(vals[i]! / max), dist: Math.hypot(s.c[0] - hub[0], s.c[1] - hub[1]) / far, valor: vals[i] || undefined }));
    return { states, hub, outline: states.map((s) => s.d).join("") };
  }, [pesoPorUf]);

  const chips: Chip[] = useMemo(() => (pesoPorUf ? CHIPS.filter(([k]) => pesoPorUf[k]).map(([key, side]) => ({ key, side, valor: pesoPorUf[key]! })) : []), [pesoPorUf]);

  // ---------- parallax (ponteiro + rolagem), só transform ----------
  const px = useMotionValue(0), py = useMotionValue(0);
  const spx = useSpring(px, { stiffness: 60, damping: 20 }), spy = useSpring(py, { stiffness: 60, damping: 20 });
  // Progresso de rolagem do hero (0 no topo, 1 quando sai): listener passivo + 1 leitura por evento.
  const scrollYProgress = useMotionValue(0);
  useEffect(() => {
    if (reduce) return;
    let h = section.offsetHeight, top = section.getBoundingClientRect().top + window.scrollY;
    const onResize = () => { h = section.offsetHeight; top = section.getBoundingClientRect().top + window.scrollY; };
    const onScroll = () => scrollYProgress.set(Math.min(1, Math.max(0, (window.scrollY - top) / Math.max(1, h))));
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    onScroll();
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onResize); };
  }, [section, reduce, scrollYProgress]);
  const far = { x: useTransform(spx, (v) => v * -5), y: useTransform(scrollYProgress, [0, 1], [0, 30]) };
  const mid = { x: useTransform(spx, (v) => v * -10), y: useTransform(scrollYProgress, [0, 1], [0, 70]) };
  const front = { x: useTransform(spx, (v) => v * -22), y: useTransform(scrollYProgress, [0, 1], [0, 120]) };
  const mapX = useTransform(spx, (v) => v * 10), mapY = useTransform(spy, (v) => v * 8);
  useEffect(() => {
    if (reduce || !matchMedia("(pointer: fine)").matches) return;
    const on = (e: PointerEvent) => {
      const r = section.getBoundingClientRect();
      px.set(((e.clientX - r.left) / r.width - 0.5) * 2);
      py.set(((e.clientY - r.top) / r.height - 0.5) * 2);
    };
    const off = () => { px.set(0); py.set(0); };
    section.addEventListener("pointermove", on, { passive: true });
    section.addEventListener("pointerleave", off);
    return () => { section.removeEventListener("pointermove", on); section.removeEventListener("pointerleave", off); };
  }, [section, reduce, px, py]);

  // ---------- partículas ----------
  const flowRef = useRef<ReturnType<typeof createFlow> | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current, trails = trailsRef.current;
    if (!geo || !canvas) return;
    const theme = themeWatcher();
    // Canvas só do tamanho da área do mapa (+ torre no desktop): menos pixels por quadro para pintar e compor.
    const fit = () => {
      const m = mapRef.current?.getBoundingClientRect();
      if (!m || !m.width) return;
      const sr = section.getBoundingClientRect();
      let l = m.left, t = m.top, r = m.right, b = m.bottom;
      const tw = towerRef.current?.getBoundingClientRect();
      if (tw && tw.width > 0 && sr.width >= 1024) { l = Math.min(l, tw.left); t = Math.min(t, tw.top); r = Math.max(r, tw.right); b = Math.max(b, tw.bottom); }
      l = Math.max(sr.left, l - PAD); t = Math.max(sr.top, t - PAD); r = Math.min(sr.right, r + PAD); b = Math.min(sr.bottom, b + PAD);
      for (const c of trails ? [canvas, trails] : [canvas]) Object.assign(c.style, { left: `${l - sr.left}px`, top: `${t - sr.top}px`, width: `${r - l}px`, height: `${b - t}px` });
    };
    fit();
    const dests: Record<string, number> = {};
    for (const s of geo.states) if (s.key !== "DF") dests[s.key] = pesoPorUf?.[s.key] ?? 1;
    const n = section.clientWidth < 640 ? 40 : 84;
    const slots = buildSlots(apportion(dests, n, 1), { period: 7, travel: 3.4 });
    const measureNow = (): FlowFrame | null => {
      const m = mapRef.current;
      if (!m) return null;
      const cr = canvas.getBoundingClientRect(), mr = m.getBoundingClientRect();
      const k = mr.width / MAP.w;
      let src: Pt | null = null;
      const t = towerRef.current?.getBoundingClientRect();
      if (t && t.width > 0 && cr.width >= 1024 && t.left > cr.left && t.right < cr.right) src = [t.left + t.width / 2 - cr.left, t.top + t.height / 2 - cr.top];
      return { map: { x: mr.left - cr.left, y: mr.top - cr.top, k }, src };
    };
    let cache: FlowFrame | null = null, dirty = true;
    const settleAt = performance.now() + 2600;
    const markDirty = () => { dirty = true; };
    const unsubs = [spx.on("change", markDirty), spy.on("change", markDirty), scrollYProgress.on("change", markDirty)];
    window.addEventListener("resize", markDirty);
    const flow = createFlow({
      canvas,
      trails: trails ?? undefined,
      states: geo.states.map((s) => ({ key: s.key, d: s.d, c: s.c, level: s.level })),
      hub: geo.hub,
      slots,
      dark: theme.dark,
      // Medir força layout: só quando algo mudou (parallax, resize) ou durante a entrada do mapa.
      measure: () => {
        if (!dirty && cache && performance.now() > settleAt) return cache;
        dirty = false;
        cache = measureNow();
        return cache;
      },
      onArrive: (k) => {
        const el = chipEls.current.get(k);
        el?.animate([{ transform: "scale(1)" }, { transform: "scale(1.12)", boxShadow: "0 0 0 3px rgb(255 223 0 / 0.55)" }, { transform: "scale(1)" }], { duration: 520, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
      },
    });
    flowRef.current = flow;
    const ro = new ResizeObserver(() => { fit(); markDirty(); flow.resize(); if (reduce) requestAnimationFrame(() => flow.still()); });
    // A entrada do mapa (map-in) muda o tamanho medido: reajusta quando termina.
    const refit = window.setTimeout(() => { fit(); markDirty(); flow.resize(); }, 1500);
    ro.observe(section);
    flow.resize();
    if (reduce) requestAnimationFrame(() => flow.still());
    return () => { ro.disconnect(); clearTimeout(refit); theme.stop(); flow.destroy(); flowRef.current = null; unsubs.forEach((u) => u()); window.removeEventListener("resize", markDirty); };
  }, [geo, pesoPorUf, reduce, section, spx, spy, scrollYProgress]);

  useEffect(() => {
    const f = flowRef.current;
    if (!f || reduce) return;
    if (active) { f.start(); delete section.dataset.paused; } else { f.stop(); section.dataset.paused = ""; }
  }, [active, reduce, section, geo]);

  const chipRef = (key: string): Ref<HTMLSpanElement> => (el) => { if (el) chipEls.current.set(key, el); else chipEls.current.delete(key); };
  const st = (v: { x: unknown; y: unknown }) => (reduce ? undefined : (v as never));

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[200px] sm:h-[300px] lg:h-[360px]" aria-hidden>
        <motion.div className="absolute inset-y-0 -inset-x-[3%]" style={st(far)}><LayerFar /></motion.div>
        <motion.div className="absolute inset-y-0 -inset-x-[3%]" style={st(mid)}><LayerMid ref={towerRef} />{!reduce && <LayerMidFx />}</motion.div>
        <motion.div className="absolute inset-y-0 -inset-x-[3%]" style={st(front)}><LayerFront />{!reduce && <LayerFrontFx />}</motion.div>
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-bg" />
      </div>
      <canvas ref={trailsRef} className="pointer-events-none absolute inset-0 z-20 size-full" aria-hidden />
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-20 size-full" aria-hidden />
      {anchor && geo && createPortal(
        <motion.div className="absolute inset-0" style={reduce ? undefined : { x: mapX, y: mapY }}>
          <GlassMap ref={mapRef} states={geo.states} outline={geo.outline} hub={geo.hub} chips={chips} chipRef={chipRef} animate={!reduce} onUf={onUf} nomeUf={nomeUf} />
        </motion.div>,
        anchor,
      )}
    </>
  );
}
