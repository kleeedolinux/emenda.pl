import { motion, useReducedMotion } from "motion/react";
import { formatNumber } from "@/lib/format";
import { corCategoria } from "@/lib/colors";
import { TransitionLink } from "../motion/transition";
import { duration, easing, staggerDelay, staggerStep } from "../motion/tokens";

export interface BarDatum { label: string; value: number; href?: string; color?: string; sub?: string }

/** Barras horizontais: crescem (scaleX, GPU) em cascata ao entrar na tela. */
export function Bars({ data, format = (n) => formatNumber(n), max: maxProp, limit }: { data: BarDatum[]; format?: (n: number) => string; max?: number; limit?: number }) {
  const reduce = useReducedMotion();
  const rows = limit ? data.slice(0, limit) : data;
  const max = maxProp ?? Math.max(1, ...rows.map((d) => d.value));
  return (
    <ul className="space-y-2.5" role="list">
      {rows.map((d, i) => {
        const frac = Math.max(0.005, Math.min(1, d.value / max || 0));
        const delay = staggerDelay(i, staggerStep.tight * 1.4, 0.5);
        const label = (
          <span className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 text-sm">
            <span className="min-w-0 flex-[1_1_9rem] font-medium break-words transition-colors">
              <span data-shared-source>{d.label}</span>
              {d.sub && <span className="ml-1.5 inline-block whitespace-nowrap text-xs font-normal text-muted">{d.sub}</span>}
            </span>
            <motion.span
              data-num
              className="ml-auto shrink-0 whitespace-nowrap font-semibold tabular"
              initial={reduce ? false : { opacity: 0, x: -6 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: duration.base, delay: delay + 0.25, ease: easing.out }}
            >
              {format(d.value)}
            </motion.span>
          </span>
        );
        const bar = (
          <span className="mt-1 block h-2.5 overflow-hidden rounded-full bg-surface-2">
            <motion.span
              className="bar-fill block h-full origin-left rounded-full will-change-transform"
              style={{ background: d.color ?? `linear-gradient(90deg, ${corCategoria(0)}, #2fb35d)`, width: `${frac * 100}%` }}
              initial={reduce ? false : { scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true }}
              transition={{ duration: duration.slower, delay, ease: easing.expo }}
            />
          </span>
        );
        return (
          <li key={`${d.label}-${i}`}>
            {d.href ? (
              <TransitionLink to={d.href} className="group block rounded-lg outline-offset-4 transition-transform duration-200 hover:translate-x-0.5 hover:[&_span.font-medium]:text-accent hover:[&_.bar-fill]:brightness-110">{label}{bar}</TransitionLink>
            ) : (<div>{label}{bar}</div>)}
          </li>
        );
      })}
    </ul>
  );
}
