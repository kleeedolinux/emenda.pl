import { CABECALHOS, CabecalhoPagina } from "@/features/linguagem";
import { FiltroBusca } from "@/features/busca";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { X } from "lucide-react";
import { Badge, Card, DataTable, ErrorState, PageHeader, Section, Skeleton, Term, Tip, formatDate, formatNumber, termo, useCamara, type Column, type Tone } from "@/ui";
import {
  cam, filtrosToApi, filtrosToSearch, fontes, lastPage, parseFiltrosProposicoes, DESDE_PADRAO,
  type FiltrosProposicoes, type ProposicaoDetalhe, type ProposicaoLista, type Referencia,
} from "@/features/legislativo/api";
import { useCamaraPagina } from "@/features/legislativo/hooks";
import { PAUTAS, type Pauta } from "@/features/legislativo/pautas";
import { desfecho, statusLeigo } from "@/features/legislativo/normas";
import { Campo, Fontes, Paginador, inputCls, selectCls } from "@/features/legislativo/components";
import { AutoLink } from "@/features/links";

const TIPOS: { sigla: string; nome: string }[] = [
  { sigla: "PL", nome: "Projeto de Lei" },
  { sigla: "PEC", nome: "Emenda à Constituição" },
  { sigla: "PLP", nome: "Lei Complementar" },
  { sigla: "MPV", nome: "Medida Provisória" },
  { sigla: "PDL", nome: "Decreto Legislativo" },
  { sigla: "PLN", nome: "Lei do Congresso (orçamento)" },
  { sigla: "PRC", nome: "Resolução da Câmara" },
  { sigla: "REQ", nome: "Requerimento" },
  { sigla: "RIC", nome: "Requerimento de Informação" },
  { sigla: "INC", nome: "Indicação" },
];
const ITENS = 50;
const TOM: Record<string, Tone> = { lei: "verde", vetada: "vermelho", rejeitada: "vermelho", arquivada: "neutro", tramitando: "amarelo" };

export default function ProposicoesPage() {
  const [sp, setSp] = useSearchParams();
  const f = useMemo(() => parseFiltrosProposicoes(sp), [sp]);
  const update = (patch: Partial<FiltrosProposicoes>) =>
    setSp(filtrosToSearch({ ...f, pagina: 1, ...patch }), { replace: true, preventScrollReset: true });

  // campos de texto com atraso para não disparar uma busca a cada tecla
  const [q, setQ] = useState(f.q);
  const [autor, setAutor] = useState(f.autor);
  useEffect(() => { setQ(f.q); setAutor(f.autor); }, [f.q, f.autor]);
  useEffect(() => {
    const t = setTimeout(() => { if (q !== f.q || autor !== f.autor) update({ q, autor }); }, 500);
    return () => clearTimeout(t);
  }, [q, autor]); // eslint-disable-line react-hooks/exhaustive-deps

  const path = filtrosToApi(f, ITENS);
  const res = useCamaraPagina<ProposicaoLista>(path);
  const temas = useCamara<Referencia[]>(cam.temasRef());
  const total = lastPage(res.data?.links);
  const temaNome = temas.data?.find((t) => t.cod === f.tema)?.nome;

  const chips: { label: string; clear: Partial<FiltrosProposicoes> }[] = [
    ...f.tipos.map((t) => ({ label: t, clear: { tipos: f.tipos.filter((x) => x !== t) } })),
    ...(f.numero ? [{ label: `nº ${f.numero}`, clear: { numero: "" } }] : []),
    ...(f.ano ? [{ label: `ano ${f.ano}`, clear: { ano: "" } }] : []),
    ...(!f.ano && !f.numero && f.desde !== DESDE_PADRAO ? [{ label: `desde ${formatDate(f.desde)}`, clear: { desde: DESDE_PADRAO } }] : []),
    ...(f.q ? [{ label: `“${f.q}”`, clear: { q: "" } }] : []),
    ...(f.autor ? [{ label: `autor: ${f.autor}`, clear: { autor: "" } }] : []),
    ...(f.tema ? [{ label: `tema: ${temaNome ?? f.tema}`, clear: { tema: "" } }] : []),
  ];

  const cols: Column<ProposicaoLista>[] = [
    { key: "siglaTipo", header: "Tipo", cell: (r) => <Badge tone="azul"><Term k={r.siglaTipo}>{r.siglaTipo}</Term></Badge> },
    { key: "numero", header: "Nº/Ano", cell: (r) => <Link className="link tabular font-medium" to={`/proposicao/${r.id}`}>{r.numero}/{r.ano}</Link> },
    { key: "ementa", header: "Ementa", cell: (r) => <AutoLink className="line-clamp-3" text={r.ementa} /> },
    { key: "dataApresentacao", header: "Apresentada", cell: (r) => formatDate(r.dataApresentacao) },
  ];

  return (
    <>
      <CabecalhoPagina
        c={CABECALHOS.proposicoes}
        breadcrumbs={[{ label: "Início", to: "/" }, { label: "Proposições" }]}
      />

      <FaixaPautas />

      <div className="card mb-4 space-y-4 p-4">
        <fieldset>
          <legend className="mb-2 text-xs font-medium text-muted">Tipo</legend>
          <div className="flex flex-wrap gap-1.5">
            {TIPOS.map((t) => {
              const on = f.tipos.includes(t.sigla);
              return (
                <span key={t.sigla} className="inline-flex items-center">
                  <button type="button" aria-pressed={on} onClick={() => update({ tipos: on ? f.tipos.filter((x) => x !== t.sigla) : [...f.tipos, t.sigla] })}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${on ? "border-verde bg-verde text-white" : "border-line bg-surface text-muted hover:text-fg"}`}>
                    {t.sigla} <span className="font-normal opacity-80">· {t.nome}</span>
                  </button>
                  {termo(t.sigla) && <Tip content={termo(t.sigla)} />}
                </span>
              );
            })}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Campo label="Palavras-chave" tip="Procura na ementa e na indexação. Ex.: saúde, combustível, escola."><input className={inputCls} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ex.: vacina" /></Campo>
          <Campo label="Quem propôs" tip="Deputado ou senador que apresentou a proposta."><FiltroBusca valor={autor} onValor={setAutor} modoInicial="deputado" /></Campo>
          <Campo label="Número"><input className={inputCls} inputMode="numeric" value={f.numero} onChange={(e) => update({ numero: e.target.value.replace(/\D/g, "") })} placeholder="ex.: 2630" /></Campo>
          <Campo label="Ano" tip="Ano de apresentação. Sem ano, buscamos desde a data abaixo.">
            <select className={selectCls} value={f.ano} onChange={(e) => update({ ano: e.target.value })}>
              <option value="">Qualquer</option>
              {Array.from({ length: new Date().getFullYear() - 1987 }, (_, i) => new Date().getFullYear() - i).map((a) => <option key={a}>{a}</option>)}
            </select>
          </Campo>
          <Campo label="Apresentadas desde" tip="A API da Câmara exige um período quando não há ano nem número. Padrão: 2022.">
            <input className={inputCls} type="date" value={f.desde} disabled={!!f.ano || !!f.numero} onChange={(e) => update({ desde: e.target.value || DESDE_PADRAO })} />
          </Campo>
          <Campo label="Tema">
            <select className={selectCls} value={f.tema} onChange={(e) => update({ tema: e.target.value })}>
              <option value="">Todos</option>
              {(temas.data ?? []).map((t) => <option key={t.cod} value={t.cod}>{t.nome}</option>)}
            </select>
          </Campo>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Campo label="Ordenar por">
            <select className={selectCls} value={f.ordenarPor} onChange={(e) => update({ ordenarPor: e.target.value as FiltrosProposicoes["ordenarPor"] })}>
              <option value="id">Mais recentes no sistema</option><option value="ano">Ano</option><option value="numero">Número</option><option value="siglaTipo">Tipo</option>
            </select>
          </Campo>
          <Campo label="Ordem">
            <select className={selectCls} value={f.ordem} onChange={(e) => update({ ordem: e.target.value as "ASC" | "DESC" })}>
              <option value="DESC">Decrescente</option><option value="ASC">Crescente</option>
            </select>
          </Campo>
          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {chips.map((c) => (
                <button key={c.label} type="button" onClick={() => update(c.clear)} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium hover:bg-line" aria-label={`Remover filtro ${c.label}`}>
                  {c.label}<X className="size-3" aria-hidden />
                </button>
              ))}
              <button type="button" onClick={() => setSp(new URLSearchParams(), { replace: true })} className="text-xs font-medium text-link underline">limpar tudo</button>
            </div>
          )}
        </div>
      </div>

      {res.isError ? <ErrorState error={res.error} retry={() => res.refetch()} /> : (
        <Card title={res.data ? `Resultados${total > 1 ? ` — cerca de ${formatNumber(total * ITENS)}` : ` — ${formatNumber(res.data.dados.length)}`}` : "Resultados"}>
          {res.isPending ? <Skeleton className="h-80" /> : (
            <DataTable rows={res.data!.dados} columns={cols} pageSize={ITENS} rowKey={(r) => r.id} exportName={`proposicoes-p${f.pagina}`} empty="Nenhuma proposição com esses filtros." />
          )}
          <Paginador pagina={f.pagina} total={total} onChange={(p) => setSp(filtrosToSearch({ ...f, pagina: p }), { replace: false })} carregando={res.isFetching} />
          <Fontes items={[{ label: "Esta busca na API da Câmara", href: fontes.camaraApi(path) }, { label: "Busca no site da Câmara", href: "https://www.camara.leg.br/busca-portal/proposicoes/pesquisa-simplificada" }]} />
        </Card>
      )}

      <Section id="pautas" title="Pautas de grande repercussão" tip="Seleção de propostas muito debatidas, com descrição neutra. O desfecho e os votos vêm direto das APIs oficiais.">
        <HubPautas />
      </Section>
    </>
  );
}

function StatusPauta({ id }: { id: number }) {
  const q = useCamara<ProposicaoDetalhe>(cam.proposicao(id));
  if (!q.data) return <Skeleton className="h-5 w-24" />;
  const d = desfecho({ situacaoCamara: q.data.statusProposicao.descricaoSituacao });
  return <Badge tone={TOM[d.tipo]}>{statusLeigo(q.data.statusProposicao.descricaoSituacao)}</Badge>;
}

function CardPauta({ p }: { p: Pauta }) {
  return (
    <Link to={`/proposicao/${p.camaraId}`} className="card flex h-full flex-col gap-2 p-4 transition hover:shadow-[0_0_0_1px_var(--color-accent)]">
      <span className="text-xs font-semibold uppercase tracking-wide text-accent">{p.sigla} {p.numero}/{p.ano}</span>
      <span className="font-bold leading-snug">{p.apelido}</span>
      <span className="line-clamp-3 text-sm text-muted">{p.resumo}</span>
      <span className="mt-auto"><StatusPauta id={p.camaraId} /></span>
    </Link>
  );
}

function FaixaPautas() {
  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Em destaque</h2>
        <a href="#pautas" className="link text-sm">ver todas as pautas</a>
      </div>
      <ul className="flex snap-x gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
        {PAUTAS.slice(0, 8).map((p) => <li key={p.camaraId} className="w-64 shrink-0 snap-start"><CardPauta p={p} /></li>)}
      </ul>
    </div>
  );
}

function HubPautas() {
  const temas = [...new Set(PAUTAS.map((p) => p.tema))];
  return (
    <div className="space-y-6">
      {temas.map((t) => (
        <div key={t}>
          <h3 className="mb-2 font-semibold">{t}</h3>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PAUTAS.filter((p) => p.tema === t).map((p) => <li key={p.camaraId}><CardPauta p={p} /></li>)}
          </ul>
        </div>
      ))}
      <p className="text-xs text-muted">Curadoria editorial: a escolha das pautas não implica posição sobre o mérito. Sugestões são bem-vindas no repositório do projeto.</p>
    </div>
  );
}
