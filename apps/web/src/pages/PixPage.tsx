import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { AlertTriangle, Zap } from "lucide-react";
import { dataPath, UF_POR_CODIGO, UFS, type Brasil, type Pix, type PixAno, type PixItem, type SiglaUf } from "@emenda/contracts";
import {
  Card, Choropleth, CountUp, DataTable, ErrorState, ExternalLink, LineArea, Money, NextSteps, PageHeader, Section, Skeleton, Stat, StatGrid, Term,
  externo, ibge, useApi, type Column,
} from "@/ui";
import { formatBRL, formatNumber, formatPct } from "@/lib/format";
import { Campo, inputCls, selectCls } from "@/features/legislativo/components";
import { filtrarPix, opcoesPix, partePix } from "@/features/pix/pix";
import { temaPorSlug } from "@/features/entenda/temas";
import { BuscaUniversal, FiltroBusca, abrirBusca } from "@/features/busca";
import { ListaVerMais, ModoDetalhado, QuemMandou, CABECALHOS, CabecalhoPagina } from "@/features/linguagem";
import { ShareButton } from "@/features/share";

const brl = (n: number) => formatBRL(Math.round(n), true);
const COR = "#e0b800";
const pagoTotal = (t: { pago: number; rapPago: number }) => t.pago + t.rapPago;

export default function PixPage() {
  const pix = useApi<Pix>(dataPath.pix());
  const brasil = useApi<Brasil>(dataPath.brasil());
  const tema = temaPorSlug("emenda-pix")!;
  const p = pix.data;
  const totalBrasil = brasil.data ? pagoTotal(brasil.data.totais) : 0;

  const total = p ? pagoTotal(p.totais) : 0;
  const parte = totalBrasil && p ? partePix(total, totalBrasil) : null;

  return (
    <>
      <CabecalhoPagina
        c={CABECALHOS.pix}
        breadcrumbs={[{ label: "Início", to: "/" }, { label: "Sem dizer para quê" }]}
        actions={p ? <ShareButton fab kind="pagina" title="Dinheiro mandado sem dizer para quê" text={`${brl(total)} foram mandados por políticos direto para prefeituras, sem dizer para quê. Veja se sua cidade recebeu:`} url="/pix" /> : undefined}
      />

      {pix.isError ? <ErrorState error={pix.error} retry={() => pix.refetch()} /> : !p ? <Skeleton className="h-64 rounded-3xl" /> : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr_1fr]">
          <section className="card p-5 sm:p-6">
            <p className="text-sm font-semibold text-muted">Mandado assim desde {p.anos[0] ?? "—"}</p>
            <p className="mt-1 font-display text-5xl font-bold tabular sm:text-6xl" style={{ color: "#a36f00" }}><CountUp value={total} format={brl} /></p>
            {parte != null && <p className="mt-1 text-lg"><b>{Math.round(parte * 100)}%</b> de todo o dinheiro mandado por políticos</p>}
            <h2 className="mb-2 mt-6 font-semibold">Sua cidade recebeu assim?</h2>
            <BuscaUniversal variante="hero" fixo modoInicial="cidade" onFocoMovel={(q, m) => abrirBusca(q, m)} />
            <details className="mt-5 text-sm">
              <summary className="cursor-pointer font-semibold text-accent"><AlertTriangle className="mr-1 inline size-4 text-amarelo" aria-hidden />Por que isso é polêmico?</summary>
              <div className="mt-2 space-y-2 text-pretty">
                {tema.detalhes?.map((d) => <p key={d}>{d}</p>)}
                <ul className="space-y-1 border-t border-line pt-2 text-xs">{tema.fontes.map((f) => <li key={f.href}><ExternalLink href={f.href}>{f.label}</ExternalLink></li>)}</ul>
              </div>
            </details>
          </section>
          <section className="card p-4 sm:p-5">
            <h2 className="mb-3 font-display text-lg font-bold">Quem mais mandou assim</h2>
            <QuemMandou autores={p.autores} inicial={5} />
          </section>
        </div>
      )}

      {p && (
        <>
          <Section title="Cidades que mais receberam assim" tip="Toque numa cidade para ver quem mandou e no que diz ter gasto.">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.3fr]">
              <Card>
                <ListaVerMais itens={p.municipios} inicial={8} passo={20} chave={(m) => m.ibge} className="divide-y divide-line" render={(m, i) => (
                  <Link to={`/municipio/${m.ibge}`} className="flex items-center gap-3 py-2 hover:text-accent">
                    <span className="w-6 text-right text-xs text-muted tabular">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{m.nome || m.ibge} <span className="text-xs text-muted">{m.uf}</span></span>
                    <b className="tabular">{brl(pagoTotal(m))}</b>
                  </Link>
                )} />
              </Card>
              <Card><MapaPix p={p} /></Card>
            </div>
          </Section>

          <Section title="Ano a ano" tip="Pago no ano + o que ficou para pagar depois, pelo ano da indicação.">
            <Card><LineArea data={p.porAno.map((a) => ({ x: a.ano, y: pagoTotal(a) }))} format={brl} color={COR} /></Card>
          </Section>

          <ModoDetalhado titulo="Ver tudo: cada repasse, com filtros por ano, estado e político">
            <StatGrid>
              <Stat label="Pago" tip="emenda pix" value={<CountUp value={total} format={brl} />} hint="inclui restos a pagar" />
              <Stat label="Indicações" value={<CountUp value={p.totais.n} />} />
              <Stat label="Prometido (empenhado)" tip="empenhado" value={<CountUp value={p.totais.empenhado} format={brl} />} hint={p.totais.empenhado ? `${formatPct(total / p.totais.empenhado)} já pago` : undefined} />
            </StatGrid>
            <div className="mt-4"><ListaPix anos={p.anos} /></div>
          </ModoDetalhado>
        </>
      )}

      <NextSteps items={[
        { to: "/ultimas?tipo=pix", label: "Pagos recentemente", desc: "Últimos repasses, mês a mês." },
        { to: "/entenda/emenda-pix", label: "Entenda as regras", desc: "STF, prazos e o que mudou." },
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
        <Campo label="Cidade">
          <FiltroBusca valor={f.q} onValor={(v) => set("q", v)} modoInicial="cidade" />
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
