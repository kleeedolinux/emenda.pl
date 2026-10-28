import { arc, pie } from "d3-shape";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { corCategoria } from "@/lib/colors";
import { formatNumber, formatPct } from "@/lib/format";

export interface DonutDatum { label: string; value: number; color?: string; highlight?: boolean }

export function Donut({ data, format = (n) => formatNumber(n), centerLabel = "Total" }: { data: DonutDatum[]; format?: (n: number) => string; centerLabel?: string }) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);
  const rows = data.filter((d) => d.value > 0);
  const total = rows.reduce((a, d) => a + d.value, 0);
  const arcs = pie<DonutDatum>().value((d) => d.value).sort(null).padAngle(0.012)(rows);
  const R = 90;
  const a = arc<(typeof arcs)[number]>().innerRadius(R * 0.62).outerRadius(R).cornerRadius(3);
  const aHover = arc<(typeof arcs)[number]>().innerRadius(R * 0.62).outerRadius(R + 5).cornerRadius(3);
  const cur = hover !== null ? rows[hover] : null;
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <svg viewBox="-100 -100 200 200" className="w-48 shrink-0" role="img" aria-label={rows.map((d) => `${d.label}: ${format(d.value)}`).join("; ")}>
        {arcs.map((s, i) => (
          <motion.path
            key={s.data.label}
            d={(hover === i ? aHover : a)(s) ?? ""}
            fill={s.data.color ?? corCategoria(i)}
            initial={reduce ? false : { opacity: 0, scale: 0.85 }}
            animate={{ opacity: hover === null || hover === i ? 1 : 0.45, scale: 1 }}
            transition={{ duration: 0.5, delay: reduce ? 0 : i * 0.05 }}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            stroke={s.data.highlight ? "var(--color-amarelo)" : "none"}
            strokeWidth={s.data.highlight ? 2.5 : 0}
          />
        ))}
        <text textAnchor="middle" y={-6} className="fill-muted text-[10px]">{cur ? cur.label.slice(0, 22) : centerLabel}</text>
        <text textAnchor="middle" y={12} className="fill-fg font-display text-[15px] font-bold">{format(cur ? cur.value : total)}</text>
      </svg>
      <ul className="w-full min-w-0 space-y-1.5 text-sm">
        {rows.map((d, i) => (
          <li key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} className={`flex items-center gap-2 rounded-md px-1.5 py-0.5 ${d.highlight ? "bg-amarelo/15" : ""}`}>
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: d.color ?? corCategoria(i) }} aria-hidden />
            <span className="min-w-0 flex-1 truncate">{d.label}</span>
            <span className="shrink-0 text-xs text-muted tabular">{formatPct(total ? d.value / total : 0)}</span>
            <span className="shrink-0 font-semibold tabular">{format(d.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
