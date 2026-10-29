import { CABECALHOS, CabecalhoPagina } from "@/features/linguagem";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { UFS, type SiglaUf } from "@emenda/contracts";
import { Bars, Card, ErrorState, PageHeader, Section, Skeleton, Spinner, Term, Tip, formatNumber, partyColor } from "@/ui";
import { cam, dedupeDeputados, fontes, mapSenadores, sen, type DeputadoLista, type SenadorResumo } from "@/features/legislativo/api";
import { useCamaraTodas, useSenado } from "@/features/legislativo/hooks";
import { Campo, Fontes, inputCls, selectCls } from "@/features/legislativo/components";
import { ShareButton } from "@/features/share";
import { BANCADAS_TEMATICAS, bancadaPorId } from "@/features/bancadas/catalogo";
import { bancadasPorUf, buscarFrentes, composicao, ordenarFrentes } from "@/features/bancadas/bancadas";
import { CardBancada, hrefBancada } from "@/features/bancadas/components";
import { LEGISLATURA, pathFrentes, pathMembros, useFrentes, useMembrosVarias, useTamanhos } from "@/features/bancadas/hooks";

const IDS = BANCADAS_TEMATICAS.map((b) => b.id);

export default function BancadasPage() {
  const membros = useMembrosVarias(IDS);
  const tematicas = useMemo(() => BANCADAS_TEMATICAS
    .map((b, i) => ({ b, membros: membros[i]?.data, carregando: membros[i]?.isPending ?? true }))
    .sort((x, y) => (y.membros?.length ?? -1) - (x.membros?.length ?? -1)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [membros.map((m) => m.dataUpdatedAt).join()]);

  return (
    <>
      <CabecalhoPagina
        c={CABECALHOS.bancadas}
        breadcrumbs={[{ label: "Início", to: "/" }, { label: "Bancadas" }]}
        actions={<ShareButton kind="pagina" title="Bancadas temáticas do Congresso" url="/bancadas" subtitle="Membros, partidos e votos de cada bancada" />}
      />

      <Card className="mb-8 border-l-4 border-l-verde">
        <p className="text-pretty">
          <b>“Bancada” temática</b> é o nome popular das <Term k="frente parlamentar">frentes parlamentares</Term>: associações de deputados e senadores de vários partidos
          em torno de um tema, registradas na Câmara (Ato da Mesa nº 69/2005) com a assinatura de pelo menos um terço do Congresso. Um parlamentar pode participar de várias frentes.
          Participar não obriga a votar de um jeito: os números abaixo mostram o que de fato aconteceu.
        </p>
        <p className="mt-2 text-xs text-muted">
          A lista de membros publicada pela Câmara traz só deputados federais. As descrições resumem a finalidade declarada no estatuto ou requerimento de cada frente, sem avaliação nossa.
        </p>
      </Card>

      <Section title="Principais bancadas temáticas" tip="Seleção das frentes mais citadas no debate público, ordenadas pelo número de deputados membros. Os dados de membros e coordenação vêm ao vivo da Câmara.">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {tematicas.map(({ b, membros: ms, carregando }) => <CardBancada key={b.id} b={b} membros={ms} carregando={carregando} />)}
        </div>
      </Section>

      <TodasFrentes />
      <BancadasEstadoPartido />

      <Fontes className="mt-10" items={[
        { label: "Frentes da 57ª legislatura (API da Câmara)", href: fontes.camaraApi(pathFrentes) },
        { label: "Membros de uma frente (exemplo)", href: fontes.camaraApi(pathMembros(IDS[0]!)) },
        { label: "Frentes parlamentares no site da Câmara", href: "https://www.camara.leg.br/deputados/frentes-e-grupos-parlamentares" },
      ]} />
    </>
  );
}

function TodasFrentes() {
  const [sp, setSp] = useSearchParams();
  const q = sp.get("q") ?? "";
  const ordem = sp.get("ordem") === "tamanho" ? "tamanho" : "nome";
  const set = (k: string, v: string) => setSp((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: true });
  const frentes = useFrentes();
  const lista = frentes.data ?? [];
  const tam = useTamanhos(lista.map((f) => f.id), ordem === "tamanho");
  const filtradas = useMemo(() => ordenarFrentes(buscarFrentes(lista, q), ordem, tam.mapa), [lista, q, ordem, tam.mapa]);
  const [limite, setLimite] = useState(30);

  return (
    <Section id="todas" title={<>Todas as frentes parlamentares {frentes.data && <span className="text-base font-normal text-muted">({formatNumber(lista.length)})</span>}</>}
      tip="Todas as frentes registradas na Câmara nesta legislatura. Ordenar por tamanho consulta a lista de membros de cada uma (pode levar alguns segundos).">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Campo label="Buscar"><input className={`${inputCls} sm:w-80`} placeholder="Ex.: evangélica, agro, saúde, mulher…" value={q} onChange={(e) => set("q", e.target.value)} /></Campo>
        <Campo label="Ordenar por">
          <select className={selectCls} value={ordem} onChange={(e) => set("ordem", e.target.value === "tamanho" ? "tamanho" : "")}>
            <option value="nome">Nome</option><option value="tamanho">Nº de membros</option>
          </select>
        </Campo>
        {ordem === "tamanho" && !tam.pronto && <Spinner label={`Contando membros ${tam.feitos}/${tam.total}…`} />}
      </div>
      {frentes.isError ? <ErrorState error={frentes.error} retry={() => frentes.refetch()} /> : frentes.isPending ? <Skeleton className="h-60" /> : (
        <>
          <ul className="grid overflow-hidden rounded-2xl border border-line bg-surface lg:grid-cols-2">
            {filtradas.slice(0, limite).map((f) => {
              const b = bancadaPorId(f.id);
              const n = tam.mapa.get(f.id);
              return (
                <li key={f.id} className="-mb-px flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 text-sm lg:odd:border-r">
                  <span className="min-w-0">
                    <Link className="link font-medium" to={b ? hrefBancada(b) : `/bancada/${f.id}`}>{f.titulo}</Link>
                    {b && <span className="ml-2 text-xs font-semibold text-accent">{b.apelido}</span>}
                  </span>
                  {n != null && <span className="shrink-0 text-sm tabular text-muted">{formatNumber(n)} membros</span>}
                </li>
              );
            })}
          </ul>
          {filtradas.length === 0 && <p className="mt-3 text-sm text-muted">Nenhuma frente encontrada.</p>}
          {filtradas.length > limite && (
            <button type="button" className="press mt-3 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-surface-2" onClick={() => setLimite((l) => l + 80)}>
              Mostrar mais ({formatNumber(filtradas.length - limite)} restantes)
            </button>
          )}
        </>
      )}
    </Section>
  );
}

function BancadasEstadoPartido() {
  const deps = useCamaraTodas<DeputadoLista>(cam.deputados({}));
  const sens = useSenado<SenadorResumo[]>(sen.listaAtual(), mapSenadores);
  const porUf = useMemo(() => bancadasPorUf(dedupeDeputados(deps.data ?? []), sens.data ?? []), [deps.data, sens.data]);
  const porPartido = useMemo(() => composicao([
    ...dedupeDeputados(deps.data ?? []).map((d) => d.siglaPartido),
    ...(sens.data ?? []).map((s) => s.partido),
  ], (x) => x), [deps.data, sens.data]);
  const carregando = deps.isPending || sens.isPending;
  return (
    <>
      <Section id="estados" title="Bancada de cada estado" tip="Bancada estadual: deputados federais e senadores em exercício eleitos pelo estado. Cada estado tem 3 senadores; o número de deputados varia com a população (de 8 a 70).">
        {carregando ? <Skeleton className="h-48" /> : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7">
            {porUf.map((u) => (
              <li key={u.uf}>
                <Link to={`/uf/${u.uf}`} className="card block p-3 transition hover:-translate-y-0.5">
                  <span className="flex items-baseline justify-between"><b className="text-lg">{u.uf}</b><span className="text-sm font-semibold tabular">{u.total}</span></span>
                  <span className="block truncate text-xs text-muted">{UFS[u.uf as SiglaUf] ?? u.uf}</span>
                  <span className="mt-1 block text-[11px] text-muted">{u.deputados} dep. · {u.senadores} sen.</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section id="partidos" title="Bancada de cada partido" tip="Deputados federais e senadores em exercício por partido atual. Clique para ver o partido.">
        {carregando ? <Skeleton className="h-64" /> : (
          <Card>
            <Bars data={porPartido.map((p) => ({ label: p.label, value: p.value, href: `/partido/${encodeURIComponent(p.label)}`, color: partyColor(p.label) }))} limit={30} />
            <p className="mt-3 flex items-center gap-1 text-xs text-muted">Soma de deputados (Câmara) e senadores (Senado) em exercício.<Tip content="Federações partidárias aparecem separadas por partido." /></p>
          </Card>
        )}
        <Fontes items={[
          { label: "Deputados em exercício (API da Câmara)", href: fontes.camaraApi(cam.deputados({})) },
          { label: "Senadores em exercício (API do Senado)", href: fontes.senadoApi(sen.listaAtual()) },
        ]} />
      </Section>
      <p className="mt-6 text-xs text-muted">Legislatura {LEGISLATURA}. Dados lidos ao vivo das APIs oficiais.</p>
    </>
  );
}
