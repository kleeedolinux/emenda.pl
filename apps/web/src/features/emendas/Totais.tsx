import type { Totais } from "@emenda/contracts";
import { formatBRL, formatNumber, formatPct } from "@/lib/format";
import { CountUp } from "@/ui/Money";
import { Stat, StatGrid } from "@/ui/primitives";

/** KPIs padrão de um conjunto de emendas. */
export function TotaisGrid({ t }: { t: Totais }) {
  const brl = (n: number) => formatBRL(Math.round(n), true);
  return (
    <StatGrid>
      <Stat label="Reservado no Orçamento" tip="empenhado" value={<CountUp value={t.empenhado} format={brl} />} hint={formatBRL(t.empenhado)} />
      <Stat label="Serviço entregue" tip="liquidado" value={<CountUp value={t.liquidado} format={brl} />} hint={t.empenhado ? `${formatPct(t.liquidado / t.empenhado)} do reservado` : undefined} />
      <Stat label="Pago de fato" tip="pago" value={<CountUp value={t.pago} format={brl} />} hint={t.empenhado ? `${formatPct(t.pago / t.empenhado)} do reservado` : undefined} />
      <Stat label="Pedidos de dinheiro" tip="emenda" value={<CountUp value={t.n} />} hint={t.rapPago ? `+ ${formatBRL(t.rapPago, true)} pagos de anos anteriores` : `${formatNumber(t.n)} registros`} />
    </StatGrid>
  );
}
