import { arc, pie } from "d3-shape";
import { motion, useReducedMotion } from "motion/react";
import { useId, useState } from "react";
import { duration, easing } from "../motion/tokens";
import { corCategoria } from "@/lib/colors";
import { formatNumber, formatPct } from "@/lib/format";

export interface DonutDatum { label: string; value: number; color?: string; highlight?: boolean }

/** Fonte do valor central: cabe no furo do donut (≈ 100 unidades) seja qual for o comprimento. */
export const centerSize = (s: string) => Math.min(15, 100 / Math.max(1, s.length * 0.6));

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
  const centerText = format(cur ? cur.value : total);
  const mid = R * 0.81, mask = `dn-${useId().replace(/:/g, "")}`;
  return (
    <div className="@container"><div className="flex flex-col items-center gap-5 @md:flex-row @md:items-center">
      <svg viewBox="-100 -100 200 200" className="w-48 shrink-0" role="img" aria-label={rows.map((d) => `${d.label}: ${format(d.value)}`).join("; ")}>
        {/* Varredura: máscara circular desenhada via pathLength (sentido horário a partir do topo). */}
        <mask id={mask}>
          <motion.circle
            r={mid} fill="none" stroke="#fff" strokeWidth={R * 0.5} transform="rotate(-90)"
            initial={reduce ? false : { pathLength: 0 }}
            whileInView={{ pathLength: 1.001 }}
            viewport={{ once: true }}
            transition={{ duration: duration.cinematic, ease: easing.inOut }}
          />
        </mask>
        <g mask={`url(#${mask})`}>
        {arcs.map((s, i) => (
          <motion.path
            key={s.data.label}
            d={(hover === i ? aHover : a)(s) ?? ""}
            fill={s.data.color ?? corCategoria(i)}
            animate={{ opacity: hover === null || hover === i ? 1 : 0.45 }}
            transition={{ duration: duration.fast }}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            stroke={s.data.highlight ? "var(--color-amarelo)" : "none"}
            strokeWidth={s.data.highlight ? 2.5 : 0}
          />
        ))}
        </g>
        <text textAnchor="middle" y={-6} className="fill-muted text-[10px]">{cur ? cur.label.slice(0, 22) : centerLabel}</text>
        <text textAnchor="middle" y={12} className="fill-fg font-display font-bold tabular" fontSize={centerSize(centerText)}>{centerText}</text>
      </svg>
      <ul className="w-full min-w-0 space-y-1.5 text-sm">
        {rows.map((d, i) => (
          <li key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} className={`flex items-baseline gap-2 rounded-md px-1.5 py-0.5 ${d.highlight ? "bg-amarelo/15" : ""}`}>
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: d.color ?? corCategoria(i) }} aria-hidden />
            <span className="min-w-0 flex-1 break-words">{d.label}</span>
            <span data-num className="shrink-0 whitespace-nowrap text-xs text-muted tabular">{formatPct(total ? d.value / total : 0)}</span>
            <span data-num className="shrink-0 whitespace-nowrap font-semibold tabular">{format(d.value)}</span>
          </li>
        ))}
      </ul>
    </div></div>
  );
}
