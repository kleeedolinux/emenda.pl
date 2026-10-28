// Números reais (dados do emenda.online) para cada tema do Entenda.
import { Link } from "react-router";
import { dataPath, type Abertas, type Brasil, type TipoEmenda } from "@emenda/contracts";
import { Bars, Card, CountUp, ErrorState, Skeleton, Stat, StatGrid, useApi } from "@/ui";
import { formatBRL, formatNumber, formatPct } from "@/lib/format";
import { COR_TIPO, nomeTipoCurto } from "@/features/emendas/tipos";
import { BarraPartes } from "./Diagrama";
import type { Tema } from "./temas";

const brl = (n: number) => formatBRL(Math.round(n), true);

export function NumerosTema({ numeros }: { numeros: NonNullable<Tema["numeros"]> }) {
  if (numeros === "abertas") return <NumerosAbertas />;
  return <NumerosBrasil modo={numeros} />;
}

function NumerosBrasil({ modo }: { modo: Exclude<NonNullable<Tema["numeros"]>, "abertas"> }) {
  const q = useApi<Brasil>(dataPath.brasil());
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (!q.data) return <Skeleton className="h-28" />;
  const b = q.data;
  if (modo === "brasil") {
    return (
      <Card title="Na prática, com os dados do Portal">
        <StatGrid>
          <Stat label="Emendas registradas" tip="emenda" value={<CountUp value={b.totais.n} />} />
          <Stat label="Empenhado" tip="empenhado" value={<CountUp value={b.totais.empenhado} format={brl} />} />
          <Stat label="Pago" tip="pago" value={<CountUp value={b.totais.pago} format={brl} />} />
          <Stat label="Restos a pagar pagos" tip="restos a pagar" value={<CountUp value={b.totais.rapPago} format={brl} />} />
        </StatGrid>
        <div className="mt-5"><Bars data={b.porTipo.map((t) => ({ label: nomeTipoCurto(t.tipo), value: t.pago + t.rapPago, color: COR_TIPO[t.tipo], href: `/entenda/${slugTipo(t.tipo)}` }))} format={brl} /></div>
      </Card>
    );
  }
  if (modo === "ciclo") {
    const t = b.totais;
    return (
      <Card title="Para onde foi o dinheiro empenhado" tip="Somatório de todos os anos disponíveis no Portal da Transparência.">
        <BarraPartes format={brl} partes={[
          { label: "Pago no ano", valor: t.pago, cor: "#009c3b" },
          { label: "Pago depois (restos a pagar)", valor: t.rapPago, cor: "#2f80ed" },
          { label: "Ainda não pago ou cancelado", valor: t.empenhado - t.pago - t.rapPago, cor: "#e0b800" },
        ]} />
        <p className="mt-3 text-sm text-muted">Liquidado: {brl(t.liquidado)} ({t.empenhado ? formatPct(t.liquidado / t.empenhado) : "—"} do empenhado).</p>
      </Card>
    );
  }
  const tipo: TipoEmenda = modo.tipo;
  const t = b.porTipo.find((x) => x.tipo === tipo);
  const total = b.porTipo.reduce((s, x) => s + x.pago + x.rapPago, 0);
  const anos = b.porAno.length ? `${b.porAno[0]!.ano}–${b.porAno[b.porAno.length - 1]!.ano}` : "";
  return (
    <Card title={`${nomeTipoCurto(tipo)} em números`} tip={`Todos os anos disponíveis no Portal (${anos}).`}>
      {t ? (
        <StatGrid>
          <Stat label="Emendas" value={<CountUp value={t.n} />} />
          <Stat label="Empenhado" tip="empenhado" value={<CountUp value={t.empenhado} format={brl} />} />
          <Stat label="Pago (inclui restos a pagar)" tip="pago" value={<CountUp value={t.pago + t.rapPago} format={brl} />} />
          <Stat label="Parte de todas as emendas pagas" value={total ? formatPct((t.pago + t.rapPago) / total) : "—"} />
        </StatGrid>
      ) : <p className="text-sm text-muted">Sem registros desse tipo nos dados atuais.</p>}
    </Card>
  );
}

const slugTipo = (t: TipoEmenda) =>
  ({ pix: "emenda-pix", individual: "emenda-individual", bancada: "emenda-de-bancada", comissao: "emenda-de-comissao", relator: "emenda-de-relator", outra: "o-que-e-emenda" })[t];

export function NumerosAbertas() {
  const q = useApi<Abertas>(dataPath.abertas());
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (!q.data) return <Skeleton className="h-64" />;
  const a = q.data;
  return (
    <div className="space-y-4">
      <Card title="Quanto está em aberto agora" tip="Empenhado − pago − restos a pagar pagos − restos a pagar cancelados, emenda por emenda (nunca negativo).">
        <StatGrid>
          <Stat label="Em aberto" value={<CountUp value={a.totais.aberto} format={brl} />} hint={`${formatNumber(a.totais.n)} emendas com saldo`} />
          <Stat label="Empenhado (total)" tip="empenhado" value={brl(a.totais.empenhado)} />
          <Stat label="Pago + restos pagos" tip="pago" value={brl(a.totais.pago + a.totais.rapPago)} />
          <Stat label="Restos a pagar cancelados" tip="restos a pagar" value={brl(a.totais.rapCancelado)} />
        </StatGrid>
        <div className="mt-5">
          <BarraPartes format={brl} partes={[
            { label: "Pago no ano", valor: a.totais.pago, cor: "#009c3b" },
            { label: "Restos a pagar pagos", valor: a.totais.rapPago, cor: "#2f80ed" },
            { label: "Cancelado", valor: a.totais.rapCancelado, cor: "#94a3b8" },
            { label: "Em aberto", valor: a.totais.aberto, cor: "#e0b800" },
          ]} />
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Por tipo"><Bars data={a.porTipo.map((t) => ({ label: nomeTipoCurto(t.tipo), value: t.aberto, color: COR_TIPO[t.tipo], sub: `${formatNumber(t.n)}` }))} format={brl} /></Card>
        <Card title="Por ano da emenda"><Bars data={[...a.porAno].reverse().map((t) => ({ label: String(t.ano), value: t.aberto, sub: `${formatNumber(t.n)}` }))} format={brl} limit={12} /></Card>
        <Card title="Por estado"><div className="max-h-96 overflow-y-auto pr-1"><Bars data={a.porUf.map((t) => ({ label: t.nome, value: t.aberto, href: `/uf/${t.uf}` }))} format={brl} /></div></Card>
      </div>
      <Card title="Maiores saldos em aberto">
        <ol className="divide-y divide-line text-sm">
          {a.top.slice(0, 15).map((e) => (
            <li key={e.codigo + e.localidade} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
              <span className="min-w-0">
                <b>{nomeTipoCurto(e.tipo)} {e.ano}</b> · {/^[A-Za-z0-9]+$/.test(e.autor.codigo) ? <Link className="link" to={`/autor/${e.autor.codigo}`}>{e.autor.nome}</Link> : e.autor.nome}
                <span className="block text-xs text-muted">{e.ibge ? <Link className="hover:underline" to={`/municipio/${e.ibge}`}>{e.localidade}</Link> : e.localidade} · {e.funcao}</span>
              </span>
              <span className="tabular font-semibold">{brl(e.aberto)} <span className="text-xs font-normal text-muted">de {brl(e.empenhado)}</span></span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
