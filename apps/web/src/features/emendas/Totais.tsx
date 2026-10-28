import type { Totais } from "@emenda/contracts";
import { formatBRL, formatNumber, formatPct } from "@/lib/format";
import { CountUp } from "@/ui/Money";
import { Stat, StatGrid } from "@/ui/primitives";

/** KPIs padrão de um conjunto de emendas. */
export function TotaisGrid({ t }: { t: Totais }) {
  const brl = (n: number) => formatBRL(Math.round(n), true);
  return (
    <StatGrid>
      <Stat label="Empenhado" tip="empenhado" value={<CountUp value={t.empenhado} format={brl} />} hint={formatBRL(t.empenhado)} />
      <Stat label="Liquidado" tip="liquidado" value={<CountUp value={t.liquidado} format={brl} />} hint={t.empenhado ? `${formatPct(t.liquidado / t.empenhado)} do empenhado` : undefined} />
      <Stat label="Pago" tip="pago" value={<CountUp value={t.pago} format={brl} />} hint={t.empenhado ? `${formatPct(t.pago / t.empenhado)} do empenhado` : undefined} />
      <Stat label="Emendas" tip="emenda" value={<CountUp value={t.n} />} hint={t.rapPago ? `+ ${formatBRL(t.rapPago, true)} em restos a pagar pagos` : `${formatNumber(t.n)} registros`} />
    </StatGrid>
  );
}
