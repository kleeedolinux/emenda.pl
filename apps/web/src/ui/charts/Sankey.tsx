import { sankey, sankeyLinkHorizontal, sankeyJustify } from "d3-sankey";
import { motion, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";
import { corCategoria } from "@/lib/colors";
import { formatNumber } from "@/lib/format";
import { duration, easing } from "../motion/tokens";

export interface SankeyNode { label: string; color?: string; group?: string; id?: string }
export interface SankeyLink { source: number; target: number; value: number }

type N = SankeyNode & { index?: number; x0?: number; x1?: number; y0?: number; y1?: number; value?: number };
type L = { source: N; target: N; value: number; width?: number; index?: number };

/** Diagrama de Sankey (fluxo). Nós por índice. */
export function Sankey({ nodes, links, format = (n) => formatNumber(n), height = 520 }: { nodes: SankeyNode[]; links: SankeyLink[]; format?: (n: number) => string; height?: number }) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);
  const W = 960, H = height;
  const g = useMemo(() => {
    if (!nodes.length || !links.length) return null;
    const groups = [...new Set(nodes.map((n) => n.group ?? ""))];
    return sankey<N, L>()
      .nodeWidth(12).nodePadding(10).nodeAlign(sankeyJustify)
      .extent([[1, 8], [W - 1, H - 8]])({
        nodes: nodes.map((n, i) => ({ ...n, color: n.color ?? corCategoria(groups.length > 1 && n.group === groups[0] ? i : i + 3) })),
        links: links.map((l) => ({ ...l })) as unknown as L[],
      });
  }, [nodes, links, H]);
  if (!g) return null;
  const linked = (l: L) => hover === null || l.source.index === hover || l.target.index === hover;
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[720px]" role="img" aria-label="Fluxo do dinheiro">
        <g fill="none">
          {g.links.map((l, i) => (
            <motion.path
              key={i}
              d={sankeyLinkHorizontal()(l as never) ?? ""}
              stroke={l.source.color}
              strokeWidth={Math.max(1, l.width ?? 1)}
              initial={reduce ? false : { pathLength: 0, opacity: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true }}
              animate={{ opacity: linked(l) ? 0.42 : 0.07 }}
              transition={{ pathLength: { duration: duration.cinematic, ease: easing.inOut, delay: reduce ? 0 : Math.min(i * 0.004, 0.6) }, opacity: { duration: duration.base } }}
            >
              <title>{`${l.source.label} → ${l.target.label}: ${format(l.value)}`}</title>
            </motion.path>
          ))}
        </g>
        {/* Fluxo: traço animado nos vínculos do nó em foco (CSS stroke-dashoffset). */}
        {hover !== null && !reduce && (
          <g fill="none" pointerEvents="none">
            {g.links.filter(linked).map((l, i) => (
              <path key={i} d={sankeyLinkHorizontal()(l as never) ?? ""} stroke="#fff" strokeOpacity={0.55} strokeWidth={Math.max(1, Math.min(4, (l.width ?? 1) * 0.35))} strokeLinecap="round" className="sankey-flow" />
            ))}
          </g>
        )}
        {g.nodes.map((n) => {
          const left = (n.x0 ?? 0) < W / 2;
          return (
            <g key={n.index} onMouseEnter={() => setHover(n.index ?? null)} onMouseLeave={() => setHover(null)} className="cursor-default">
              <motion.rect
                x={n.x0} y={n.y0} width={(n.x1 ?? 0) - (n.x0 ?? 0)} height={Math.max(1, (n.y1 ?? 0) - (n.y0 ?? 0))} fill={n.color} rx={2}
                style={{ transformBox: "fill-box", transformOrigin: "center" }}
                initial={reduce ? false : { scaleY: 0 }}
                whileInView={{ scaleY: 1 }}
                viewport={{ once: true }}
                transition={{ duration: duration.slow, ease: easing.expo }}
              >
                <title>{`${n.label}: ${format(n.value ?? 0)}`}</title>
              </motion.rect>
              {(n.y1 ?? 0) - (n.y0 ?? 0) > 9 && (
                <text x={left ? (n.x1 ?? 0) + 6 : (n.x0 ?? 0) - 6} y={((n.y0 ?? 0) + (n.y1 ?? 0)) / 2} dy="0.35em" textAnchor={left ? "start" : "end"} className="fill-fg text-[12px] font-medium">
                  {n.label.length > 30 ? n.label.slice(0, 29) + "…" : n.label}
                  <tspan className="fill-muted tabular" dx={6}>{format(n.value ?? 0)}</tspan>
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
