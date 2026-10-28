import { motion, useReducedMotion } from "motion/react";
import { Link } from "react-router";
import { formatNumber } from "@/lib/format";
import { corCategoria } from "@/lib/colors";

export interface BarDatum { label: string; value: number; href?: string; color?: string; sub?: string }

/** Barras horizontais animadas, ordenadas como recebidas. */
export function Bars({ data, format = (n) => formatNumber(n), max: maxProp, limit }: { data: BarDatum[]; format?: (n: number) => string; max?: number; limit?: number }) {
  const reduce = useReducedMotion();
  const rows = limit ? data.slice(0, limit) : data;
  const max = maxProp ?? Math.max(1, ...rows.map((d) => d.value));
  return (
    <ul className="space-y-2.5" role="list">
      {rows.map((d, i) => {
        const pct = Math.max(0.5, (d.value / max) * 100);
        const label = (
          <span className="flex min-w-0 items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium">{d.label}{d.sub && <span className="ml-1.5 text-xs font-normal text-muted">{d.sub}</span>}</span>
            <span className="shrink-0 font-semibold tabular">{format(d.value)}</span>
          </span>
        );
        const bar = (
          <span className="mt-1 block h-2.5 overflow-hidden rounded-full bg-surface-2">
            <motion.span
              className="block h-full rounded-full"
              style={{ background: d.color ?? `linear-gradient(90deg, ${corCategoria(0)}, #2fb35d)` }}
              initial={reduce ? false : { width: 0 }}
              whileInView={{ width: `${pct}%` }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: Math.min(i, 12) * 0.035, ease: [0.22, 1, 0.36, 1] }}
            />
          </span>
        );
        return (
          <li key={`${d.label}-${i}`}>
            {d.href ? (
              <Link to={d.href} className="group block rounded-lg outline-offset-4 hover:[&_span.font-medium]:text-accent">{label}{bar}</Link>
            ) : (<div>{label}{bar}</div>)}
          </li>
        );
      })}
    </ul>
  );
}
