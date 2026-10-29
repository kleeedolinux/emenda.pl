import { formatBRL, formatNumber } from "@/lib/format";

/**
 * Valor em reais a partir de centavos. Atômico: nunca quebra linha nem trunca.
 * Compacto mostra e anuncia o valor completo (title + aria-label).
 */
export function Money({ centavos, compact, className }: { centavos: number | null | undefined; compact?: boolean; className?: string }) {
  if (centavos === null || centavos === undefined) return <span className={className} aria-label="sem valor">—</span>;
  const full = formatBRL(centavos);
  return (
    <span
      data-num
      className={`tabular whitespace-nowrap ${className ?? ""}`}
      title={compact ? full : undefined}
      aria-label={compact ? full : undefined}
      role={compact ? "text" : undefined}
    >
      {formatBRL(centavos, compact)}
    </span>
  );
}

export function NumberFmt({ value, compact, className }: { value: number | null | undefined; compact?: boolean; className?: string }) {
  if (value === null || value === undefined) return <span className={className} aria-label="sem valor">—</span>;
  const full = formatNumber(value);
  return (
    <span
      data-num
      className={`tabular whitespace-nowrap ${className ?? ""}`}
      title={compact ? full : undefined}
      aria-label={compact ? full : undefined}
      role={compact ? "text" : undefined}
    >
      {formatNumber(value, compact)}
    </span>
  );
}

/** Compat: `CountUp` vive em `@/ui/motion`. */
export { CountUp } from "./motion/numbers";
