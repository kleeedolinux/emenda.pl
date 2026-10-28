import { area, curveMonotoneX, line } from "d3-shape";
import { scaleLinear, scalePoint } from "d3-scale";
import { motion, useReducedMotion } from "motion/react";
import { useId, useState } from "react";
import { formatNumber } from "@/lib/format";

export interface XY { x: string | number; y: number }

/** Linha com área para séries curtas (ex.: por ano). */
export function LineArea({ data, format = (n) => formatNumber(n), color = "#009c3b", height = 220 }: { data: XY[]; format?: (n: number) => string; color?: string; height?: number }) {
  const reduce = useReducedMotion();
  const gid = useId().replace(/:/g, "");
  const [hi, setHi] = useState<number | null>(null);
  const W = 600, H = height, P = { l: 8, r: 8, t: 24, b: 26 };
  if (!data.length) return null;
  const x = scalePoint<string>().domain(data.map((d) => String(d.x))).range([P.l + 20, W - P.r - 20]);
  const y = scaleLinear().domain([0, Math.max(1, ...data.map((d) => d.y))]).nice().range([H - P.b, P.t]);
  const X = (d: XY) => x(String(d.x)) ?? 0;
  const ln = line<XY>().x(X).y((d) => y(d.y)).curve(curveMonotoneX)(data) ?? "";
  const ar = area<XY>().x(X).y0(H - P.b).y1((d) => y(d.y)).curve(curveMonotoneX)(data) ?? "";
  const cur = hi !== null ? data[hi] : null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" role="img" aria-label={data.map((d) => `${d.x}: ${format(d.y)}`).join("; ")} onMouseLeave={() => setHi(null)}>
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {y.ticks(4).map((t) => (
        <g key={t}>
          <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeDasharray="3 4" />
          <text x={P.l} y={y(t) - 4} className="fill-muted text-[10px] tabular">{format(t)}</text>
        </g>
      ))}
      <motion.path d={ar} fill={`url(#${gid})`} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }} />
      <motion.path d={ln} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1, ease: "easeOut" }} />
      {data.map((d, i) => (
        <g key={String(d.x)}>
          <rect x={X(d) - 24} y={P.t} width={48} height={H - P.t - P.b} fill="transparent" onMouseEnter={() => setHi(i)} onFocus={() => setHi(i)} tabIndex={0} aria-label={`${d.x}: ${format(d.y)}`} />
          <circle cx={X(d)} cy={y(d.y)} r={hi === i ? 5.5 : 3.5} fill="var(--color-surface)" stroke={color} strokeWidth={2} pointerEvents="none" />
          <text x={X(d)} y={H - 6} textAnchor="middle" className="fill-muted text-[11px] tabular">{d.x}</text>
        </g>
      ))}
      {cur && (
        <g pointerEvents="none">
          <line x1={X(cur)} x2={X(cur)} y1={P.t} y2={H - P.b} stroke={color} strokeOpacity={0.4} />
          <text x={Math.min(Math.max(X(cur), 60), W - 60)} y={14} textAnchor="middle" className="fill-fg text-[12px] font-bold tabular">{`${cur.x}: ${format(cur.y)}`}</text>
        </g>
      )}
    </svg>
  );
}
