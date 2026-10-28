import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { AlertTriangle, Zap } from "lucide-react";
import { dataPath, UF_POR_CODIGO, UFS, type Brasil, type Pix, type PixAno, type PixItem, type SiglaUf } from "@emenda/contracts";
import {
  Bars, Card, Choropleth, CountUp, DataTable, ErrorState, ExternalLink, LineArea, Money, NextSteps, PageHeader, Section, Skeleton, Stat, StatGrid, Term,
  externo, ibge, useApi, type Column,
} from "@/ui";
import { formatBRL, formatNumber, formatPct } from "@/lib/format";
import { Campo, inputCls, selectCls } from "@/features/legislativo/components";
import { filtrarPix, opcoesPix, partePix } from "@/features/pix/pix";
import { temaPorSlug } from "@/features/entenda/temas";
import { DiagramaPassos } from "@/features/entenda/Diagrama";

const brl = (n: number) => formatBRL(Math.round(n), true);
const COR = "#e0b800";
const pagoTotal = (t: { pago: number; rapPago: number }) => t.pago + t.rapPago;

export default function PixPage() {
  const pix = useApi<Pix>(dataPath.pix());
  const brasil = useApi<Brasil>(dataPath.brasil());
  const tema = temaPorSlug("emenda-pix")!;
  const p = pix.data;
  const totalBrasil = brasil.data ? pagoTotal(brasil.data.totais) : 0;

  return (
    <>
      <PageHeader
        eyebrow={<span className="inline-flex items-center gap-1"><Zap className="size-3.5" aria-hidden />Transferências especiais</span>}
        title="Emenda Pix"
        subtitle="Dinheiro de emenda que cai direto na conta da prefeitura ou do estado, sem convênio. Veja quanto foi, para onde, quem indicou — e como acompanhar."
        breadcrumbs={[{ label: "Início", to: "/" }, { label: "Emenda Pix" }]}
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card title="O que é, em 4 passos">
          <div className="hidden md:block"><DiagramaPassos passos={tema.passos} cor={COR} /></div>
          <ol className="mt-3 space-y-2 text-sm">{tema.passos.map((s, i) => <li key={s.titulo}><b>{i + 1}. {s.titulo}:</b> {s.texto}</li>)}</ol>
        </Card>
        <Card title={<span className="inline-flex items-center gap-1.5"><AlertTriangle className="size-4 text-amarelo" aria-hidden />Por que é polêmica</span>}>
          <div className="space-y-3 text-sm text-pretty">
            {tema.detalhes?.map((d) => <p key={d}>{d}</p>)}
            <ul className="space-y-1 border-t border-line pt-3 text-xs">
              {tema.fontes.map((f) => <li key={f.href}><ExternalLink href={f.href}>{f.label}</ExternalLink></li>)}
            </ul>
            <Link className="link text-sm" to="/entenda/emenda-pix">Entenda em detalhes →</Link>
          </div>
        </Card>
      </div>

      {pix.isError ? <ErrorState error={pix.error} retry={() => pix.refetch()} /> : !p ? <Skeleton className="h-28" /> : (
        <StatGrid>
          <Stat label="Pago via Pix" tip="emenda pix" value={<CountUp value={pagoTotal(p.totais)} format={brl} />} hint={`desde ${p.anos[0] ?? "—"}, inclui restos a pagar`} />
          <Stat label="Emendas Pix" value={<CountUp value={p.totais.n} />} hint={`${formatNumber(p.municipios.length)}+ municípios no topo`} />
          <Stat label="Parte de todas as emendas pagas" value={totalBrasil ? formatPct(partePix(pagoTotal(p.totais), totalBrasil)) : "…"} hint="no mesmo período disponível" />
          <Stat label="Empenhado" tip="empenhado" value={<CountUp value={p.totais.empenhado} format={brl} />} hint={p.totais.empenhado ? `${formatPct(pagoTotal(p.totais) / p.totais.empenhado)} já pago` : undefined} />
        </StatGrid>
      )}

      {p && (
        <>
          <Section title="Ano a ano" tip="Pago no ano + restos a pagar pagos depois, pelo ano da emenda.">
            <Card><LineArea data={p.porAno.map((a) => ({ x: a.ano, y: pagoTotal(a) }))} format={brl} color={COR} /></Card>
          </Section>

          <Section title="Para onde vai" tip="Estado e município de destino informados no Portal da Transparência.">
            <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
              <Card>
                <MapaPix p={p} />
              </Card>
              <Card title="Municípios que mais receberam">
                <div className="max-h-[560px] overflow-y-auto pr-1">
                  <Bars data={p.municipios.map((m) => ({ label: m.nome || m.ibge, sub: m.uf, value: pagoTotal(m), href: `/municipio/${m.ibge}`, color: COR }))} format={brl} limit={30} />
                </div>
              </Card>
            </div>
          </Section>

          <Section title="Quem mais indicou" tip="Autores com mais Emenda Pix paga (todos os anos).">
            <Card>
              <Bars data={p.autores.map((a) => ({ label: a.nome, value: a.pago, href: `/autor/${a.codigo}`, sub: `${formatNumber(a.n)} emendas` }))} format={brl} limit={20} />
            </Card>
          </Section>

          <Section title="Lista completa" tip="Todas as emendas Pix do ano escolhido. Filtre por estado, autor ou cidade e abra o município para acompanhar.">
            <ListaPix anos={p.anos} />
          </Section>
        </>
      )}

      <NextSteps items={[
        { to: "/ultimas?tipo=pix", label: "Pix pagos recentemente", desc: "Últimos pagamentos, mês a mês." },
        { to: "/entenda/emenda-pix", label: "Entenda a Emenda Pix", desc: "Regras, STF e o que mudou." },
        { to: "/entenda/o-que-esta-aberto", label: "O que está aberto", desc: "Empenhado e ainda não pago." },
      ]} />
    </>
  );
}

function MapaPix({ p }: { p: Pix }) {
  const byUf = useMemo(() => new Map(p.porUf.map((u) => [u.uf, u])), [p.porUf]);
  const values: Record<string, number | undefined> = {};
  for (const [cod, uf] of Object.entries(UF_POR_CODIGO)) { const u = byUf.get(uf); values[cod] = u ? pagoTotal(u) : undefined; }
  return (
    <Choropleth url={ibge.malhaBrasilUF()} values={values}
      label={(c) => UFS[UF_POR_CODIGO[c] as SiglaUf] ?? c}
      href={(c) => (UF_POR_CODIGO[c] ? `/uf/${UF_POR_CODIGO[c]}` : null)}
      format={brl}
      detail={(c) => { const u = byUf.get(UF_POR_CODIGO[c] ?? ""); return u ? <p className="text-xs text-muted">{formatNumber(u.n)} emendas Pix</p> : null; }}
      ariaLabel="Mapa do Brasil: valor pago via Emenda Pix por estado de destino." />
  );
}

function ListaPix({ anos }: { anos: number[] }) {
  const [sp, setSp] = useSearchParams();
  const ultimo = anos[anos.length - 1] ?? new Date().getFullYear();
  const ano = Number(sp.get("ano")) || ultimo;
  const set = (k: string, v: string) => setSp((x) => { const n = new URLSearchParams(x); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: true, preventScrollReset: true });
  const f = { uf: sp.get("uf") ?? "", autor: sp.get("autor") ?? "", q: sp.get("q") ?? "" };
  const q = useApi<PixAno>(anos.includes(ano) ? dataPath.pixAno(ano) : null);
  const op = useMemo(() => opcoesPix(q.data?.itens ?? []), [q.data]);
  const rows = useMemo(() => filtrarPix(q.data?.itens ?? [], f), [q.data, f.uf, f.autor, f.q]); // eslint-disable-line react-hooks/exhaustive-deps
  const soma = rows.reduce((s, r) => s + pagoTotal(r), 0);
  const cols: Column<PixItem>[] = [
    { key: "localidade", header: "Destino", sort: true, cell: (r) => (r.ibge ? <Link className="link font-medium" to={`/municipio/${r.ibge}`}>{r.localidade}</Link> : r.localidade) },
    { key: "autor", header: "Autor", sort: (r) => r.autor.nome, cell: (r) => <Link className="link" to={`/autor/${r.autor.codigo}`}>{r.autor.nome}</Link>, csv: (r) => r.autor.nome },
    { key: "empenhado", header: "Empenhado", tip: "empenhado", align: "right", sort: true, cell: (r) => <Money centavos={r.empenhado} /> },
    { key: "pago", header: "Pago", tip: "pago", align: "right", sort: (r) => pagoTotal(r), cell: (r) => <Money centavos={pagoTotal(r)} />, csv: (r) => pagoTotal(r) / 100 },
    { key: "codigo", header: "Portal", cell: (r) => <ExternalLink href={externo.emenda(r.codigo)}>{r.codigo}</ExternalLink> },
  ];
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Campo label="Ano da emenda">
          <select className={selectCls} value={ano} onChange={(e) => set("ano", e.target.value === String(ultimo) ? "" : e.target.value)}>
            {[...anos].reverse().map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </Campo>
        <Campo label="UF de destino">
          <select className={selectCls} value={f.uf} onChange={(e) => set("uf", e.target.value)}>
            <option value="">Todas</option>{op.ufs.map((u) => <option key={u}>{u}</option>)}
          </select>
        </Campo>
        <Campo label="Autor">
          <select className={selectCls} value={f.autor} onChange={(e) => set("autor", e.target.value)}>
            <option value="">Todos</option>{op.autores.map((a) => <option key={a.codigo} value={a.codigo}>{a.nome}</option>)}
          </select>
        </Campo>
        <Campo label="Buscar">
          <input className={inputCls} value={f.q} placeholder="Cidade, autor ou código" onChange={(e) => set("q", e.target.value)} />
        </Campo>
      </div>
      {q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : !q.data ? <Skeleton className="h-64" /> : (
        <>
          <p className="mb-3 text-sm text-muted">{formatNumber(rows.length)} emendas Pix de {ano} · pago <b className="text-fg">{brl(soma)}</b>. <Term k="restos a pagar">Inclui restos a pagar pagos.</Term></p>
          <DataTable rows={rows} columns={cols} pageSize={25} rowKey={(r, i) => `${r.codigo}-${i}`} exportName={`emenda-pix-${ano}`} initialSort={{ key: "pago", dir: "desc" }} empty="Nenhuma emenda Pix com esses filtros." />
        </>
      )}
    </Card>
  );
}
