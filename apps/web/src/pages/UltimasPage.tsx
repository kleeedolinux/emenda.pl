import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { Zap } from "lucide-react";
import { dataPath, TIPOS_EMENDA, type Feed, type FeedMes, type Pagamento, type TipoEmenda } from "@emenda/contracts";
import { EmptyState, ErrorState, Money, NextSteps, PageHeader, Skeleton, Spinner, Tabs, Term, fetchJson, formatNumber, useApi } from "@/ui";
import { nomeTipoCurto } from "@/features/emendas/tipos";
import { Campo, inputCls, selectCls } from "@/features/legislativo/components";
import { agruparPorMes, filtrarPagamentos, mesLongo, opcoesFiltro, proximoMes } from "@/features/feed/feed";
import { PagamentoCard, RankingsRecentes } from "@/features/feed/components";
import { ShareButton } from "@/features/share";

const POR_GRUPO = 60;

export default function UltimasPage() {
  return (
    <>
      <PageHeader
        eyebrow="Atualizado com o Portal da Transparência"
        title="Últimas emendas pagas"
        subtitle={<>Os pagamentos mais recentes de <Term k="emenda">emendas parlamentares</Term>: quem indicou, quem recebeu e onde. Os itens <b>Pix</b> aparecem destacados.</>}
        breadcrumbs={[{ label: "Início", to: "/" }, { label: "Últimas" }]}
        actions={<ShareButton fab kind="pagina" title="Últimas emendas parlamentares pagas" text="💸 Quem mandou dinheiro de emenda para onde, pagamento a pagamento. Veja as últimas emendas pagas:" url="/ultimas" />}
      />
      <Tabs tabs={[
        { id: "feed", label: "Pagamentos recentes", content: <FeedLista /> },
        { id: "rankings", label: "Quem mais enviou", content: <RankingsRecentes /> },
      ]} />
      <NextSteps items={[
        { to: "/pix", label: "Emenda Pix", desc: "O que é e para onde vai." },
        { to: "/entenda/ciclo-do-dinheiro", label: "Ciclo do dinheiro", desc: "Empenho, liquidação e pagamento." },
        { to: "/entenda/o-que-esta-aberto", label: "O que está aberto", desc: "Empenhado e ainda não pago." },
      ]} />
    </>
  );
}

function FeedLista() {
  const feed = useApi<Feed>(dataPath.feed());
  const [sp, setSp] = useSearchParams();
  const f = { tipo: (sp.get("tipo") ?? "") as TipoEmenda | "", uf: sp.get("uf") ?? "", autor: sp.get("autor") ?? "" };
  const set = (k: string, v: string) => setSp((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: true, preventScrollReset: true });

  // meses extras (além dos 6 do feed.json) carregados sob demanda
  const [extras, setExtras] = useState<number[]>([]);
  const extrasQ = useQueries({
    queries: extras.map((m) => ({ queryKey: ["json", dataPath.feedMes(m)], queryFn: ({ signal }: { signal: AbortSignal }) => fetchJson<FeedMes>(dataPath.feedMes(m), signal), staleTime: 3_600_000 })),
  });
  const todos = useMemo<Pagamento[]>(() => [...(feed.data?.itens ?? []), ...extrasQ.flatMap((q) => q.data?.itens ?? [])], [feed.data, extrasQ]);
  const carregados = useMemo(() => [...new Set((feed.data?.itens ?? []).map((p) => p.mes)), ...extras], [feed.data, extras]);
  const proximo = feed.data ? proximoMes(feed.data.meses, carregados) : null;
  const carregando = extrasQ.some((q) => q.isPending);
  const grupos = useMemo(() => agruparPorMes(filtrarPagamentos(todos, f)), [todos, f.tipo, f.uf, f.autor]); // eslint-disable-line react-hooks/exhaustive-deps
  const opcoes = useMemo(() => opcoesFiltro(todos), [todos]);
  const resumoMes = new Map((feed.data?.meses ?? []).map((m) => [m.mes, m]));

  // scroll infinito: sentinela no fim carrega o próximo mês
  const sentinela = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinela.current;
    if (!el || !proximo || carregando) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setExtras((x) => (x.includes(proximo) ? x : [...x, proximo])); }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [proximo, carregando]);

  if (feed.isError) return <ErrorState error={feed.error} retry={() => feed.refetch()} />;
  if (!feed.data) return <Skeleton className="h-96" />;
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <Campo label="Tipo">
          <select className={selectCls} value={f.tipo} onChange={(e) => set("tipo", e.target.value)}>
            <option value="">Todos</option>
            {(Object.keys(TIPOS_EMENDA) as TipoEmenda[]).map((t) => <option key={t} value={t}>{nomeTipoCurto(t)}</option>)}
          </select>
        </Campo>
        <Campo label="UF">
          <select className={selectCls} value={f.uf} onChange={(e) => set("uf", e.target.value)}>
            <option value="">Todas</option>
            {opcoes.ufs.map((u) => <option key={u}>{u}</option>)}
          </select>
        </Campo>
        <Campo label="Autor" tip="Parte do nome do parlamentar, bancada ou comissão.">
          <input className={inputCls} list="feed-autores" value={f.autor} placeholder="Ex.: Silva" onChange={(e) => set("autor", e.target.value)} />
          <datalist id="feed-autores">{opcoes.autores.slice(0, 500).map((a) => <option key={a} value={a} />)}</datalist>
        </Campo>
        {f.tipo !== "pix" && (
          <button type="button" onClick={() => set("tipo", "pix")} className="press inline-flex items-center gap-1.5 rounded-xl border border-amarelo/70 px-3 py-2 text-sm font-semibold">
            <Zap className="size-4 text-amarelo" aria-hidden />Só Emenda Pix
          </button>
        )}
      </div>
      <p className="mb-4 text-xs text-muted">Mostramos os maiores pagamentos de cada mês ({formatNumber(500)} nos últimos 6 meses; mais ao rolar). Pagamentos repetidos da mesma emenda ao mesmo favorecido no mês foram somados.</p>

      {grupos.length === 0 && !carregando && <EmptyState title="Nenhum pagamento com esses filtros nos meses carregados." hint={proximo ? "Role para carregar meses anteriores." : undefined} />}
      {grupos.map((g) => {
        const r = resumoMes.get(g.mes);
        return (
          <section key={g.mes} className="mb-10" aria-labelledby={`mes-${g.mes}`}>
            <header className="sticky top-16 z-10 -mx-2 mb-3 flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-bg/85 px-2 py-2 backdrop-blur">
              <h2 id={`mes-${g.mes}`} className="text-xl font-bold capitalize">{mesLongo(g.mes)}</h2>
              <p className="text-sm text-muted">
                {r ? <>Total do mês: <b className="text-fg"><Money centavos={r.valor} compact /></b> em {formatNumber(r.n)} pagamentos</> : null}
                {f.tipo || f.uf || f.autor ? <> · filtrado: <Money centavos={g.total} compact /></> : null}
              </p>
            </header>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {g.itens.slice(0, POR_GRUPO).map((p, i) => <PagamentoCard key={`${p.codigoEmenda}-${p.favorecido.documento}-${p.mes}`} p={p} i={i} />)}
            </ul>
            {g.itens.length > POR_GRUPO && <MaisDoMes itens={g.itens.slice(POR_GRUPO)} />}
          </section>
        );
      })}
      <div ref={sentinela} className="flex justify-center py-6">
        {carregando ? <Spinner label="Carregando mês anterior…" /> : proximo ? (
          <button type="button" className="press rounded-xl border border-line px-4 py-2 text-sm" onClick={() => setExtras((x) => [...x, proximo])}>Carregar {mesLongo(proximo)}</button>
        ) : <p className="text-sm text-muted">Fim dos últimos 24 meses publicados.</p>}
      </div>
    </div>
  );
}

function MaisDoMes({ itens }: { itens: Pagamento[] }) {
  const [n, setN] = useState(0);
  return (
    <>
      {n > 0 && <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{itens.slice(0, n).map((p) => <PagamentoCard key={`${p.codigoEmenda}-${p.favorecido.documento}-${p.mes}`} p={p} />)}</ul>}
      {n < itens.length && (
        <button type="button" className="press mt-3 rounded-xl border border-line px-4 py-2 text-sm" onClick={() => setN((x) => x + 60)}>
          Ver mais {formatNumber(Math.min(60, itens.length - n))} deste mês
        </button>
      )}
    </>
  );
}
