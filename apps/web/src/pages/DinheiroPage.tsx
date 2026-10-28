import { dataPath, type Brasil } from "@emenda/contracts";
import { useMemo, useState } from "react";
import { buildFluxoSankey } from "@/features/emendas/fluxo";
import { COR_TIPO, nomeTipoCurto } from "@/features/emendas/tipos";
import { TotaisGrid } from "@/features/emendas/Totais";
import { useApi } from "@/lib/data";
import { formatBRL } from "@/lib/format";
import { Bars, NextSteps, Card, Donut, ErrorState, LineArea, PageHeader, Sankey, Section, Skeleton, Term } from "@/ui";
import type { TipoEmenda } from "@emenda/contracts";

export default function DinheiroPage() {
  const q = useApi<Brasil>(dataPath.brasil());
  const [top, setTop] = useState(8);
  const graph = useMemo(() => {
    if (!q.data) return null;
    const g = buildFluxoSankey(q.data.fluxo, { topFuncoes: top, topUfs: top + 2 });
    return { links: g.links, nodes: g.nodes.map((n) => ({ ...n, label: n.group === "tipo" ? nomeTipoCurto(n.id.slice(2)) : n.label, color: n.group === "tipo" ? COR_TIPO[n.id.slice(2) as TipoEmenda] : undefined })) };
  }, [q.data, top]);
  const d = q.data;
  const brl = (n: number) => formatBRL(n, true);

  return (
    <>
      <PageHeader
        eyebrow="Dinheiro"
        title="Fluxo do dinheiro público"
        subtitle={<>Como o dinheiro das emendas sai do Orçamento, passa por cada tipo de emenda, chega a uma área de gasto (<Term k="função orçamentária">função</Term>) e termina em um estado. Valores mostram o que foi <Term k="pago">pago</Term>.</>}
        breadcrumbs={[{ label: "Início", to: "/" }, { label: "Dinheiro" }]}
      />
      {q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : d ? <TotaisGrid t={d.totais} /> : <Skeleton className="h-28" />}

      <Section title="Tipo → função → estado" tip="Cada faixa é proporcional ao valor pago. Passe o mouse sobre um bloco para destacar seu caminho.">
        <Card actions={
          <label className="flex items-center gap-2 text-sm text-muted">
            Detalhe
            <select value={top} onChange={(e) => setTop(Number(e.target.value))} className="rounded-lg border border-line bg-surface px-2 py-1 text-fg">
              <option value={5}>Top 5</option><option value={8}>Top 8</option><option value={12}>Top 12</option><option value={20}>Top 20</option>
            </select>
          </label>
        }>
          {graph ? <Sankey nodes={graph.nodes} links={graph.links} format={brl} /> : <Skeleton className="h-[520px]" />}
          <p className="mt-3 text-xs text-muted">Funções e estados fora do top foram agrupados em “Outras funções” e “Outras UFs”.</p>
        </Card>
      </Section>

      {d && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Card title="Pago por ano" tip="Inclui só pagamentos do próprio ano; restos a pagar aparecem nos totais."><LineArea data={[...d.porAno].sort((a, b) => a.ano - b.ano).map((a) => ({ x: a.ano, y: a.pago }))} format={brl} /></Card>
          <Card title="Por tipo de emenda"><Donut data={d.porTipo.map((t) => ({ label: nomeTipoCurto(t.tipo), value: t.pago, color: COR_TIPO[t.tipo], highlight: t.tipo === "pix" }))} format={brl} centerLabel="Pago" /></Card>
          <Card title="Por área de gasto" tip="função orçamentária" className="lg:col-span-2">
            <Bars data={[...d.porFuncao].sort((a, b) => b.pago - a.pago).map((f) => ({ label: f.funcao, value: f.pago, sub: `empenhado ${brl(f.empenhado)}` }))} format={brl} />
          </Card>
        </div>
      )}

      <Section title="Entenda as etapas">
        <div className="grid gap-3 md:grid-cols-3">
          {(["empenhado", "liquidado", "pago"] as const).map((k) => (
            <Card key={k} title={<Term k={k}>{k[0]!.toUpperCase() + k.slice(1)}</Term>}>
              <p className="text-sm text-muted">{{ empenhado: "Promessa: o governo reserva o valor no Orçamento.", liquidado: "Conferência: a entrega foi verificada.", pago: "Dinheiro na conta de quem recebeu." }[k]}</p>
            </Card>
          ))}
        </div>
      </Section>
      <NextSteps items={[
        { to: "/", label: "Mapa por estado", desc: "Clique no seu estado e depois na sua cidade." },
        { to: "/emendas", label: "Quem indicou", desc: "Ranking de autores de emendas." },
        { to: "/sobre", label: "Metodologia", desc: "De onde vêm e como tratamos os dados." },
      ]} />
    </>
  );
}
