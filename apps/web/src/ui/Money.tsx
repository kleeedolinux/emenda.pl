import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { formatBRL, formatNumber } from "@/lib/format";

/** Valor em reais a partir de centavos. Compacto mostra o valor completo no title. */
export function Money({ centavos, compact, className }: { centavos: number | null | undefined; compact?: boolean; className?: string }) {
  if (centavos === null || centavos === undefined) return <span className={className}>—</span>;
  return (
    <span className={`tabular whitespace-nowrap ${className ?? ""}`} title={compact ? formatBRL(centavos) : undefined}>
      {formatBRL(centavos, compact)}
    </span>
  );
}

export function NumberFmt({ value, compact }: { value: number | null | undefined; compact?: boolean }) {
  if (value === null || value === undefined) return <span>—</span>;
  return <span className="tabular" title={compact ? formatNumber(value) : undefined}>{formatNumber(value, compact)}</span>;
}

/** Número que conta de 0 até `value` quando aparece na tela. */
export function CountUp({ value, format = (n) => formatNumber(Math.round(n)), duration = 1.1 }: { value: number; format?: (n: number) => string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const [v, setV] = useState(reduce ? value : 0);
  useEffect(() => {
    if (reduce) return setV(value);
    if (!inView) return;
    const c = animate(0, value, { duration, ease: [0.16, 1, 0.3, 1], onUpdate: setV });
    return () => c.stop();
  }, [inView, value, reduce, duration]);
  return (
    <span ref={ref} className="tabular" aria-label={format(value)}>
      <span aria-hidden>{format(v)}</span>
    </span>
  );
}
