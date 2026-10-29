import { CABECALHOS, CabecalhoPagina } from "@/features/linguagem";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useLocation, useSearchParams } from "react-router";
import { ArrowUp, Rss } from "lucide-react";
import { novidadesPath, type NovidadesMes, type NovidadesRecentes, type TipoNovidade } from "@emenda/contracts";
import { EmptyState, ErrorState, NextSteps, PageHeader, Spinner, fetchJson } from "@/ui";
import { ShareButton } from "@/features/share";
import { FiltroTipos, NovidadeCard, NovidadeSkeleton } from "@/features/novidades";
import {
  agruparPorDia, filtrar, gravarVisto, lerVisto, mesclar, parseTipos, proximoArquivo, serializeTipos,
} from "@/features/novidades/novidades";

const POR_PAGINA = 40;
const CINCO_MIN = 5 * 60_000;

export default function NovidadesPage() {
  return (
    <>
      <CabecalhoPagina
        c={CABECALHOS.novidades}
        breadcrumbs={[{ label: "Início", to: "/" }, { label: "Novidades" }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <a href="/rss/novidades.xml" className="press inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-muted ring-1 ring-inset ring-line transition hover:text-fg">
              <Rss className="size-4" aria-hidden />RSS
            </a>
            <ShareButton fab kind="pagina" title="Novidades do Congresso e das emendas" text="🗞️ O que mudou hoje no Congresso e nas emendas parlamentares, com fonte oficial em cada item:" url="/novidades" />
          </div>
        }
      />
      <Feed />
      <NextSteps items={[
        { to: "/agenda", label: "Agenda", desc: "O que o Congresso vota nos próximos dias." },
        { to: "/ultimas", label: "Últimas emendas pagas", desc: "Pagamento a pagamento." },
        { to: "/proposicoes", label: "Proposições", desc: "Busque projetos de lei e PECs." },
      ]} />
    </>
  );
}

function Feed() {
  const [sp, setSp] = useSearchParams();
  const { hash } = useLocation();
  const tipos = useMemo(() => parseTipos(sp.get("tipo")), [sp]);
  const alta = sp.get("alta") === "1";
  const setParam = (k: string, v: string) =>
    setSp((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: true, preventScrollReset: true });
  const toggle = (t: TipoNovidade) => { const s = new Set(tipos); if (s.has(t)) s.delete(t); else s.add(t); setParam("tipo", serializeTipos(s)); };

  // rolante (últimos 500); revalida a cada 5 min para o aviso de itens novos
  const q = useQuery({
    queryKey: ["json", novidadesPath.recentes()],
    queryFn: ({ signal }) => fetchJson<NovidadesRecentes>(novidadesPath.recentes(), signal),
    refetchInterval: CINCO_MIN,
    refetchIntervalInBackground: false,
  });

  // itens exibidos: congelados na 1ª carga; novos entram só ao tocar no aviso
  const [base, setBase] = useState<Set<string> | null>(null);
  useEffect(() => { if (q.data && !base) setBase(new Set(q.data.itens.map((i) => i.id))); }, [q.data, base]);
  const chegaram = base && q.data ? q.data.itens.filter((i) => !base.has(i.id)).length : 0;

  // última visita: marca "novo" e grava ao sair
  const [visto] = useState(lerVisto);
  useEffect(() => () => gravarVisto(new Date().toISOString()), []);
  const vistoMs = visto ? Date.parse(visto) : null;

  // arquivos mensais (scroll infinito)
  const [meses, setMeses] = useState<number[]>([]);
  const arquivos = useQueries({
    queries: meses.map((m) => ({
      queryKey: ["json", novidadesPath.mes(m)],
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchJson<NovidadesMes>(novidadesPath.mes(m), signal),
      staleTime: 3_600_000,
    })),
  });
  const rolante = useMemo(() => (q.data?.itens ?? []).filter((i) => !base || base.has(i.id)), [q.data, base]);
  const todos = useMemo(() => mesclar(rolante, ...arquivos.map((a) => a.data?.itens ?? [])), [rolante, arquivos]);
  const visiveis = useMemo(() => filtrar(todos, { tipos, alta }), [todos, tipos, alta]);
  const contagem = useMemo(() => {
    const c: Partial<Record<TipoNovidade, number>> = {};
    for (const i of filtrar(todos, { tipos: new Set(), alta })) c[i.tipo] = (c[i.tipo] ?? 0) + 1;
    return c;
  }, [todos, alta]);
  const [limite, setLimite] = useState(POR_PAGINA);
  useEffect(() => setLimite(POR_PAGINA), [tipos, alta]);
  const proximo = q.data ? proximoArquivo(q.data.meses, rolante, meses) : null;
  const carregandoMes = arquivos.some((a) => a.isPending);
  const temMais = limite < visiveis.length || proximo !== null;

  const sentinela = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinela.current;
    if (!el || !temMais) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting || carregandoMes) return;
      if (limite < visiveis.length) setLimite((l) => l + POR_PAGINA);
      else if (proximo !== null) setMeses((m) => (m.includes(proximo) ? m : [...m, proximo]));
    }, { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [temMais, limite, visiveis.length, proximo, carregandoMes]);

  // link permanente (#id): rola até o item quando ele existir
  const alvo = hash.slice(1);
  useEffect(() => {
    if (!alvo || !todos.some((i) => i.id === alvo)) return;
    const idx = visiveis.findIndex((i) => i.id === alvo);
    if (idx >= limite) setLimite(idx + 5);
    requestAnimationFrame(() => document.getElementById(alvo)?.scrollIntoView({ block: "center" }));
  }, [alvo, todos.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const agora = Date.now();
  const grupos = useMemo(() => agruparPorDia(visiveis.slice(0, limite), agora), [visiveis, limite]); // eslint-disable-line react-hooks/exhaustive-deps

  if (q.isError) return <ErrorState error={q.error} retry={() => void q.refetch()} />;

  const mostrarNovos = () => {
    setBase(new Set(q.data?.itens.map((i) => i.id)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="mx-auto max-w-2xl">
      {chegaram > 0 && (
        <div className="pointer-events-none sticky top-20 z-30 flex justify-center">
          <button type="button" onClick={mostrarNovos}
            className="press pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-verde px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgb(0_156_59/0.7)]">
            <ArrowUp className="size-4" aria-hidden />{chegaram === 1 ? "1 novidade" : `${chegaram} novidades`}
          </button>
        </div>
      )}

      <div className="sticky top-16 z-20 -mx-4 mb-4 space-y-2 bg-bg/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:px-0">
        <FiltroTipos ativos={tipos} contagem={contagem} onToggle={toggle} onLimpar={() => setParam("tipo", "")} />
        <div className="flex items-center justify-between gap-3 text-xs text-muted">
          <label className="inline-flex cursor-pointer items-center gap-2 font-medium text-fg">
            <input type="checkbox" role="switch" checked={alta} onChange={(e) => setParam("alta", e.target.checked ? "1" : "")}
              className="peer sr-only" />
            <span aria-hidden className="relative h-5 w-9 rounded-full bg-line transition peer-checked:bg-verde peer-focus-visible:ring-2 peer-focus-visible:ring-ring after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4" />
            Só alta relevância
          </label>
          {q.data && <span>Atualizado <time dateTime={q.data.geradoEm}>{new Date(q.data.geradoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })}</time></span>}
        </div>
      </div>

      {q.isPending ? (
        <div className="space-y-3">{Array.from({ length: 4 }, (_, k) => <NovidadeSkeleton key={k} />)}</div>
      ) : !visiveis.length && !proximo ? (
        <EmptyState title="Nada por aqui com esses filtros" hint="Tente outros tipos ou desligue “Só alta relevância”." />
      ) : (
        <ol className="space-y-6">
          {grupos.map((g) => (
            <li key={g.dia}>
              <h2 className="mb-2 font-display text-sm font-bold uppercase tracking-wide text-muted">{g.rotulo}</h2>
              <ol className="space-y-3">
                {g.itens.map((n, i) => (
                  <li key={n.id}>
                    <NovidadeCard n={n} i={i} agora={agora} destaque={n.id === alvo}
                      novo={vistoMs !== null && Date.parse(n.data) > vistoMs} />
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      )}

      <div ref={sentinela} className="py-6 text-center text-xs text-muted" aria-live="polite">
        {carregandoMes ? <Spinner label="Carregando mês anterior…" /> : !temMais && visiveis.length > 0 ? "Fim do arquivo." : null}
      </div>
      <p className="pb-4 text-xs text-muted">
        Relevância de 0 a 100 por regra pública (tipo de proposição, placar, valor). Textos gerados automaticamente a partir de Câmara, Senado e Portal da Transparência.
      </p>
    </div>
  );
}
