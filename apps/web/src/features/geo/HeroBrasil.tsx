// Cena do hero: Brasil "de vidro" com partículas de dinheiro saindo de Brasília
// e acendendo os estados, sobre o skyline do Congresso Nacional. SVG + SMIL + motion.
import { UF_POR_CODIGO } from "@emenda/contracts";
import { geoMercator, geoPath } from "d3-geo";
import { motion, useReducedMotion } from "motion/react";
import { useMemo } from "react";
import { ibge, useApi } from "@/lib/data";
import type { GeoFC } from "./Choropleth";

const W = 560, H = 520, CYCLE = 4.2;

/** Seleção determinística de destinos ponderada por valor (sem Math.random: SSR/teste estáveis). */
export function pickTargets(weights: Record<string, number>, n: number): string[] {
  const entries = Object.entries(weights).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return [];
  const total = entries.reduce((a, [, v]) => a + v, 0);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    let t = ((i * 0.6180339887) % 1) * total;
    for (const [k, v] of entries) { if ((t -= v) <= 0) { out.push(k); break; } }
  }
  return out;
}

export function HeroBrasil({ pesoPorUf }: { pesoPorUf?: Record<string, number> }) {
  const reduce = useReducedMotion();
  const q = useApi<GeoFC>(ibge.malhaBrasilUF());

  const geo = useMemo(() => {
    if (!q.data?.features?.length) return null;
    const fc = q.data as unknown as Parameters<ReturnType<typeof geoMercator>["fitSize"]>[1];
    const proj = geoMercator().fitExtent([[10, 10], [W - 10, H - 10]], fc);
    const gp = geoPath(proj);
    const states = q.data.features.map((f) => {
      const g = f as unknown as Parameters<typeof gp>[0];
      return { code: String(f.properties.codarea), d: gp(g) ?? "", c: gp.centroid(g) as [number, number] };
    });
    return { states, df: states.find((s) => s.code === "53")?.c ?? [W * 0.62, H * 0.55] as [number, number] };
  }, [q.data]);

  const weights = useMemo(() => {
    const w: Record<string, number> = {};
    for (const [cod, uf] of Object.entries(UF_POR_CODIGO)) if (cod !== "53") w[cod] = pesoPorUf?.[uf] ?? 1;
    return w;
  }, [pesoPorUf]);
  const targets = useMemo(() => [...new Set(pickTargets(weights, 22))].slice(0, 16), [weights]);

  return (
    <div className="relative mx-auto aspect-[560/520] w-full max-w-xl" aria-hidden>
      <div className="absolute inset-[12%] rounded-full bg-verde/25 blur-3xl dark:bg-verde/20" />
      <svg viewBox={`0 0 ${W} ${H}`} className="relative size-full overflow-visible">
        <defs>
          <linearGradient id="hb-glass" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
            <stop offset="1" stopColor="#009c3b" stopOpacity="0.18" />
          </linearGradient>
          <radialGradient id="hb-coin"><stop offset="0" stopColor="#fff7b0" /><stop offset="1" stopColor="#ffdf00" /></radialGradient>
          <filter id="hb-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" /><feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>

        {geo && (
          <motion.g initial={reduce ? false : { opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} style={{ transformOrigin: "50% 50%" }}>
            {geo.states.map((s) => (
              <path key={s.code} d={s.d} fill="url(#hb-glass)" stroke="var(--color-verde)" strokeOpacity={0.55} strokeWidth={0.8} />
            ))}
            {!reduce && targets.map((code, i) => {
              const s = geo.states.find((x) => x.code === code);
              return s ? (
                <path key={`lit-${code}`} d={s.d} fill="#ffdf00" opacity={0} pointerEvents="none">
                  <animate attributeName="opacity" values="0;0;0.7;0" keyTimes="0;0.4;0.5;1" dur={`${CYCLE}s`} begin={`${(i * CYCLE) / targets.length}s`} repeatCount="indefinite" />
                </path>
              ) : null;
            })}
            {!reduce && targets.map((code, i) => {
              const t = geo.states.find((s) => s.code === code);
              if (!t) return null;
              const [x0, y0] = geo.df, [x1, y1] = t.c;
              const mx = (x0 + x1) / 2, my = Math.min(y0, y1) - 40 - Math.abs(x1 - x0) * 0.15;
              const d = `M${x0},${y0} Q${mx},${my} ${x1},${y1}`;
              const begin = `${(i * CYCLE) / targets.length}s`;
              return (
                <g key={code}>
                  <path d={d} fill="none" stroke="#ffdf00" strokeOpacity={0.18} strokeWidth={1} strokeDasharray="2 4" />
                  <circle r={3.2} fill="url(#hb-coin)" filter="url(#hb-glow)" opacity={0}>
                    <animateMotion path={d} dur={`${CYCLE}s`} begin={begin} repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;0.42;1" calcMode="linear" />
                    <animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.04;0.38;0.44;1" dur={`${CYCLE}s`} begin={begin} repeatCount="indefinite" />
                  </circle>
                </g>
              );
            })}
            <g transform={`translate(${geo.df[0]},${geo.df[1]})`}>
              {!reduce && (
                <circle r={6} fill="none" stroke="#002776" strokeWidth={2}>
                  <animate attributeName="r" values="5;18" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.8;0" dur="2s" repeatCount="indefinite" />
                </circle>
              )}
              <circle r={5} fill="#002776" stroke="#fff" strokeWidth={2} />
              <text x={9} y={-8} className="fill-fg font-display text-[12px] font-bold">Brasília</text>
            </g>
          </motion.g>
        )}
      </svg>
    </div>
  );
}

/** Skyline do Congresso Nacional + Esplanada (desenho original). */
export function CongressoSkyline({ className = "" }: { className?: string }) {
  const reduce = useReducedMotion();
  const draw = (delay: number) => (reduce ? {} : { initial: { pathLength: 0, opacity: 0 }, animate: { pathLength: 1, opacity: 1 }, transition: { duration: 1.6, delay, ease: "easeInOut" as const } });
  return (
    <svg viewBox="0 0 1200 220" preserveAspectRatio="xMidYMax meet" className={className} aria-hidden>
      <defs>
        <linearGradient id="cs-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-azul)" stopOpacity="0.16" />
          <stop offset="1" stopColor="var(--color-azul)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <g stroke="var(--color-azul)" strokeOpacity="0.55" strokeWidth="1.6" fill="url(#cs-fill)" className="dark:[stroke:#8fb4ff]">
        {/* Esplanada: blocos dos ministérios em perspectiva */}
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <motion.rect key={`l${i}`} x={40 + i * 62} y={150 - i * 3} width={44 - i * 3} height={52 + i * 3} rx={1} {...draw(0.1 + i * 0.05)} />
        ))}
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <motion.rect key={`r${i}`} x={1116 - i * 62} y={150 - i * 3} width={44 - i * 3} height={52 + i * 3} rx={1} {...draw(0.1 + i * 0.05)} />
        ))}
        {/* Plataforma */}
        <motion.path d="M380 202 H820 V186 H380 Z" {...draw(0.3)} />
        {/* Senado: cúpula convexa */}
        <motion.path d="M430 186 Q480 136 530 186 Z" {...draw(0.6)} />
        {/* Câmara: cúpula côncava (bacia) */}
        <motion.path d="M660 160 Q720 204 780 160 L774 186 H666 Z" {...draw(0.7)} />
        {/* Torres gêmeas com passarela */}
        <motion.path d="M580 186 V40 H596 V186 Z" {...draw(0.9)} />
        <motion.path d="M604 186 V40 H620 V186 Z" {...draw(0.95)} />
        <motion.path d="M596 92 H604 V100 H596 Z" {...draw(1.2)} />
      </g>
      <line x1="0" y1="203" x2="1200" y2="203" stroke="var(--color-line)" strokeWidth="2" />
      {!reduce && (
        <circle cx="600" cy="30" r="3" fill="#ffdf00">
          <animate attributeName="opacity" values="1;0.2;1" dur="1.8s" repeatCount="indefinite" />
        </circle>
      )}
    </svg>
  );
}
