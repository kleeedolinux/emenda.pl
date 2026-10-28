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

/** Compat: `CountUp` vive em `@/ui/motion`. */
export { CountUp } from "./motion/numbers";
