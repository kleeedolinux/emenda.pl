// Brasil "de vidro": malha real do IBGE (d3-geo), tingida pelo valor pago por UF.
import { formatBRL } from "@/lib/format";
import { CountUp } from "@/ui/motion/numbers";
import { forwardRef, type Ref } from "react";
import type { Pt } from "./flow";

export const MAP = { w: 560, h: 520 } as const;
export interface MapState { key: string; d: string; c: Pt; level: number; dist: number }
export interface Chip { key: string; side: -1 | 1; valor: number }

interface Props { states: MapState[]; outline: string; hub: Pt; chips: Chip[]; chipRef: (key: string) => Ref<HTMLSpanElement>; animate: boolean }

/** SVG do mapa + selos de valor. O canvas de partículas desenha por cima (mesmo viewBox). */
export const GlassMap = forwardRef<SVGSVGElement, Props>(function GlassMap({ states, outline, hub, chips, chipRef, animate }, ref) {
  const byKey = new Map(states.map((s) => [s.key, s]));
  const pct = (p: Pt) => ({ left: `${(p[0] / MAP.w) * 100}%`, top: `${(p[1] / MAP.h) * 100}%` });
  const LEAD = 22;
  return (
    <div className={`absolute inset-0 ${animate ? "map-in" : ""}`}>
      {/* sombra de profundidade (sem filtro: gradiente) */}
      <div className="absolute inset-x-[12%] bottom-[2%] h-[14%] rounded-[50%] bg-[radial-gradient(closest-side,rgb(0_39_118/0.28),transparent)] dark:bg-[radial-gradient(closest-side,rgb(0_0_0/0.6),transparent)]" />
      <svg ref={ref} viewBox={`0 0 ${MAP.w} ${MAP.h}`} className="absolute inset-0 size-full overflow-visible" aria-hidden>
        <defs>
          <linearGradient id="gm-glass" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.72" />
            <stop offset="0.55" stopColor="#fff" stopOpacity="0.28" />
            <stop offset="1" stopColor="#bfe8cf" stopOpacity="0.32" />
          </linearGradient>
          <linearGradient id="gm-tint" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1fc35f" />
            <stop offset="1" stopColor="#009c3b" />
          </linearGradient>
          <linearGradient id="gm-edge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
            <stop offset="0.5" stopColor="#7fd6a2" stopOpacity="0.8" />
            <stop offset="1" stopColor="#002776" stopOpacity="0.6" />
          </linearGradient>
          <linearGradient id="gm-spec" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0.28" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.38" stopColor="#fff" stopOpacity="0.5" />
            <stop offset="0.46" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <clipPath id="gm-clip"><path d={outline} /></clipPath>
        </defs>
        {/* espessura do vidro (extrusão) */}
        <path d={outline} transform="translate(0 7)" fill="#00702b" opacity="0.22" />
        <path d={outline} transform="translate(0 3.5)" fill="#009c3b" opacity="0.18" />
        <g>
          {states.map((s) => <path key={s.key} d={s.d} fill="url(#gm-glass)" />)}
        </g>
        {/* tinta: chega de Brasília para fora (atraso pela distância ao hub) */}
        <g>
          {states.map((s) => (
            <path key={s.key} d={s.d} fill="url(#gm-tint)" fillOpacity={0.1 + 0.62 * s.level} className={animate ? "tint-in" : undefined} style={animate ? { animationDelay: `${0.5 + s.dist * 1.6}s` } : undefined} />
          ))}
        </g>
        <path d={states.map((s) => s.d).join("")} fill="none" stroke="#fff" strokeOpacity="0.75" strokeWidth="0.9" strokeLinejoin="round" />
        <path d={outline} fill="none" stroke="url(#gm-edge)" strokeWidth="2.2" strokeLinejoin="round" />
        {/* reflexo especular + varredura de luz (refração) */}
        <g clipPath="url(#gm-clip)">
          <rect x="0" y="0" width={MAP.w} height={MAP.h} fill="url(#gm-spec)" />
        </g>
        {/* fios até os selos */}
        {chips.map((c) => {
          const s = byKey.get(c.key);
          return s ? (
            <g key={c.key} className={c.key === "CE" ? "max-sm:hidden" : undefined}>
              <path d={`M${s.c[0]},${s.c[1]}h${c.side * LEAD}`} stroke="var(--color-fg)" strokeOpacity="0.45" strokeWidth="1" />
              <circle cx={s.c[0]} cy={s.c[1]} r="2.6" fill="var(--color-fg)" />
            </g>
          ) : null;
        })}
        {/* Brasília (hub) */}
        <g transform={`translate(${hub[0]} ${hub[1]})`}>
          <circle r="5.5" fill="#002776" stroke="#fff" strokeWidth="2" className="dark:[fill:#ffdf00]" />
        </g>
      </svg>
      {animate && (
        <>
          {/* varredura de luz num SVG próprio (só o recorte é repintado) */}
          <svg viewBox={`0 0 ${MAP.w} ${MAP.h}`} className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden>
            <defs><clipPath id="gm-clip-fx"><path d={outline} /></clipPath></defs>
            <g clipPath="url(#gm-clip-fx)">
              <rect className="glass-sweep" x="0" y="0" width="120" height={MAP.h} fill="url(#hs-sweep)" opacity="0.6" transform="skewX(-14)" style={{ animationDelay: "2.4s" }} />
            </g>
          </svg>
          {/* pulso de Brasília em HTML: só transform/opacity (compositor) */}
          <span className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2" style={pct(hub)}>
            <span className="ping-ring absolute inset-0 rounded-full border-2 border-azul dark:border-amarelo" />
          </span>
        </>
      )}
      <span className="pointer-events-none absolute -translate-x-[calc(100%+10px)] -translate-y-[150%] whitespace-nowrap rounded-full bg-azul px-2 py-0.5 font-display text-[11px] font-bold text-white shadow-lg sm:text-xs dark:bg-amarelo dark:text-azul" style={pct(hub)}>
        Brasília
      </span>
      {chips.map((c) => {
        const s = byKey.get(c.key);
        if (!s) return null;
        const at: Pt = [s.c[0] + c.side * (LEAD + 2), s.c[1]];
        return (
          <span key={c.key} className={`pointer-events-none absolute ${c.key === "CE" ? "max-sm:hidden" : ""}`} style={pct(at)}>
            <span className={`block ${c.side < 0 ? "-translate-x-full" : ""} -translate-y-1/2`}>
              <span ref={chipRef(c.key)} className="bob flex items-baseline gap-1.5 whitespace-nowrap rounded-xl border border-white/60 bg-white/90 px-2 py-1 text-[10px] shadow-[0_8px_24px_-10px_rgb(0_39_118/0.45)] sm:px-2.5 sm:text-xs dark:border-white/10 dark:bg-[#0e1714]/90" style={{ animationDelay: `${(c.key.charCodeAt(0) % 5) * 0.4}s` }}>
                <b className="font-display text-azul dark:text-amarelo">{c.key}</b>
                <span className="font-semibold text-fg"><CountUp value={c.valor} format={(n) => formatBRL(Math.round(n), true)} /></span>
              </span>
            </span>
          </span>
        );
      })}
    </div>
  );
});
