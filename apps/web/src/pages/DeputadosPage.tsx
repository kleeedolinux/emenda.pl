import { CABECALHOS, CabecalhoPagina } from "@/features/linguagem";
import { BuscaUniversal } from "@/features/busca";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { UFS } from "@emenda/contracts";
import {
  Avatar, Bars, Card, DataTable, ErrorState, Money, PageHeader, PartyBadge, Section, Skeleton, Spinner, Stat, StatGrid, Term,
  formatNumber, partyColor, type Column,
} from "@/ui";
import { cam, dedupeDeputados, encontrarAutor, filtrarDeputados, fontes, type DeputadoLista } from "@/features/legislativo/api";
import { useAutores, useCamaraTodas, useCamaraTodasVarias, useLegislaturas } from "@/features/legislativo/hooks";
import { contarLegislaturas, formatDuracao, tempoEstimadoLegislaturas } from "@/features/legislativo/mandatos";
import { Campo, ChipsMandato, Fontes, Segmentado, inputCls, selectCls } from "@/features/legislativo/components";
import { QuemMaisGasta } from "@/features/gastos";

const LEG_HIST = Array.from({ length: 11 }, (_, i) => 47 + i); // 1983 em diante

type Linha = DeputadoLista & { nLeg?: number; dias?: number; atualNaLista: boolean; pago?: number; codigoAutor?: string };

export default function DeputadosPage() {
  const [sp, setSp] = useSearchParams();
  const leg = sp.get("leg") ?? "atual";
  const view = sp.get("view") === "tabela" ? "tabela" : sp.get("view") === "gastos" ? "gastos" : "grade";
  const ordem = sp.get("ordem") === "tempo" ? "tempo" : sp.get("ordem") === "emendas" ? "emendas" : "nome";
  const f = { q: sp.get("q") ?? "", uf: sp.get("uf") ?? "", partido: sp.get("partido") ?? "", sexo: sp.get("sexo") ?? "" };
  const [comTempo, setComTempo] = useState(ordem === "tempo");
  const [limite, setLimite] = useState(60);
  const set = (k: string, v: string) => setSp((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: true });

  const pathLista = leg === "atual" ? "/deputados?ordem=ASC&ordenarPor=nome" : cam.deputados({ idLegislatura: Number(leg) });
  const lista = useCamaraTodas<DeputadoLista>(pathLista);
  const mulheres = useCamaraTodas<DeputadoLista>(leg === "atual" ? "/deputados?siglaSexo=F" : `/deputados?siglaSexo=F&idLegislatura=${leg}`);
  const autores = useAutores();
  const legs = useLegislaturas();
  const usarTempo = comTempo || ordem === "tempo";
  const hist = useCamaraTodasVarias<DeputadoLista>(LEG_HIST.map((l) => `/deputados?idLegislatura=${l}`), usarTempo);
  const histPronto = usarTempo && hist.every((h) => h.isSuccess);
  const histCarregados = hist.filter((h) => h.isSuccess).length;

  const sexoPorId = useMemo(() => {
    const m = new Map<number, string>();
    for (const d of lista.data ?? []) m.set(d.id, "M");
    for (const d of mulheres.data ?? []) m.set(d.id, "F");
    return m;
  }, [lista.data, mulheres.data]);

  const contagem = useMemo(() => (histPronto ? contarLegislaturas(hist.flatMap((h) => h.data ?? [])) : null), [histPronto, hist]);

  const todos: Linha[] = useMemo(() => {
    const base = dedupeDeputados(lista.data ?? []);
    return base.map((d) => {
      const ls = contagem?.get(d.id);
      const a = autores.data ? encontrarAutor(autores.data.idx, [d.nome]) : null;
      return {
        ...d, atualNaLista: leg === "atual",
        nLeg: ls?.size, dias: ls && legs.data ? tempoEstimadoLegislaturas(ls, legs.data) : undefined,
        pago: a?.pago, codigoAutor: a?.codigo,
      };
    });
  }, [lista.data, contagem, legs.data, autores.data, leg]);

  const filtrados = useMemo(() => {
    const r = filtrarDeputados(todos, { ...f, sexoPorId }) as Linha[];
    if (ordem === "tempo") return r.slice().sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1));
    if (ordem === "emendas") return r.slice().sort((a, b) => (b.pago ?? -1) - (a.pago ?? -1));
    return r;
  }, [todos, f.q, f.uf, f.partido, f.sexo, sexoPorId, ordem]);

  const partidos = useMemo(() => [...new Set(todos.map((d) => d.siglaPartido))].sort(), [todos]);
  const porPartido = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of filtrados) m.set(d.siglaPartido, (m.get(d.siglaPartido) ?? 0) + 1);
    return [...m].map(([label, value]) => ({ label, value, color: partyColor(label), href: `/partido/${encodeURIComponent(label)}` })).sort((a, b) => b.value - a.value);
  }, [filtrados]);
  const nMulheres = filtrados.filter((d) => sexoPorId.get(d.id) === "F").length;

  const cols: Column<Linha>[] = [
    { key: "nome", header: "Deputado(a)", sort: (r) => r.nome, cell: (r) => (
      <span className="flex items-center gap-2"><Avatar src={r.urlFoto} name={r.nome} size="sm" /><Link className="link font-medium" to={`/deputado/${r.id}`}>{r.nome}</Link></span>
    ) },
    { key: "siglaPartido", header: "Partido", sort: true, cell: (r) => <PartyBadge sigla={r.siglaPartido} /> },
    { key: "siglaUf", header: "UF", sort: true },
    { key: "sexo", header: "Sexo", sort: (r) => sexoPorId.get(r.id) ?? "", cell: (r) => (sexoPorId.get(r.id) === "F" ? "Feminino" : "Masculino") },
    ...(contagem ? [
      { key: "nLeg", header: "Legislaturas", align: "right" as const, sort: (r: Linha) => r.nLeg ?? 0, tip: "Quantas legislaturas (períodos de 4 anos) desde 1983 em que aparece como deputado(a) federal." },
      { key: "dias", header: "Tempo de casa (≈)", align: "right" as const, sort: (r: Linha) => r.dias ?? 0, cell: (r: Linha) => (r.dias ? formatDuracao(r.dias) : "—"), csv: (r: Linha) => r.dias ?? 0 },
    ] : []),
    { key: "pago", header: "Emendas pagas", align: "right", tip: "pago", sort: (r) => r.pago ?? 0, cell: (r) => (r.pago != null ? <Money centavos={r.pago} compact /> : "—") },
  ];

  return (
    <>
      <CabecalhoPagina
        c={CABECALHOS.deputados}
        breadcrumbs={[{ label: "Início", to: "/" }, { label: "Deputados" }]}
      />

      <div className="card mb-6 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="sm:col-span-2"><Campo label="Nome"><BuscaUniversal variante="hero" compacto fixo modoInicial="deputado" ufInicial={f.uf || null} /></Campo></div>
        <Campo label="Estado (UF)">
          <select className={selectCls} value={f.uf} onChange={(e) => set("uf", e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(UFS).map(([s, n]) => <option key={s} value={s}>{s} — {n}</option>)}
          </select>
        </Campo>
        <Campo label="Partido">
          <select className={selectCls} value={f.partido} onChange={(e) => set("partido", e.target.value)}>
            <option value="">Todos</option>
            {partidos.map((p) => <option key={p}>{p}</option>)}
          </select>
        </Campo>
        <Campo label="Sexo">
          <select className={selectCls} value={f.sexo} onChange={(e) => set("sexo", e.target.value)}>
            <option value="">Todos</option><option value="F">Feminino</option><option value="M">Masculino</option>
          </select>
        </Campo>
        <Campo label="Período" tip="“Em exercício” = quem ocupa a cadeira hoje. As legislaturas incluem também suplentes que assumiram em algum momento.">
          <select className={selectCls} value={leg} onChange={(e) => set("leg", e.target.value === "atual" ? "" : e.target.value)}>
            <option value="atual">Em exercício hoje</option>
            <option value="57">57ª legislatura (2023–2027), todos</option>
            <option value="56">56ª legislatura (2019–2023), todos</option>
          </select>
        </Campo>
        <Campo label="Ordenar por" tip="“Tempo de casa” soma as legislaturas em que a pessoa aparece desde 1983 (estimativa; a página de cada deputado mostra as datas exatas).">
          <select className={selectCls} value={ordem} onChange={(e) => { set("ordem", e.target.value === "nome" ? "" : e.target.value); if (e.target.value === "tempo") setComTempo(true); }}>
            <option value="nome">Nome</option><option value="tempo">Tempo de casa</option><option value="emendas">Dinheiro mandado</option>
          </select>
        </Campo>
      </div>

      {lista.isError ? <ErrorState error={lista.error} retry={() => lista.refetch()} /> : (
        <>
          <StatGrid className="mb-6">
            <Stat label="Deputados na seleção" value={lista.isPending ? "…" : formatNumber(filtrados.length)} tip="deputado federal" />
            <Stat label="Mulheres" value={mulheres.isPending ? "…" : formatNumber(nMulheres)} hint={filtrados.length ? `${Math.round((nMulheres / filtrados.length) * 100)}% da seleção` : undefined} />
            <Stat label="Partidos" value={formatNumber(porPartido.length)} />
            <Stat label="Emendas pagas (seleção)" tip="pago" value={autores.data ? <Money centavos={filtrados.reduce((s, d) => s + (d.pago ?? 0), 0)} compact /> : "…"} hint="Cruzamento por nome com o Portal da Transparência" />
          </StatGrid>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <Segmentado label="Visualização" value={view} onChange={(v) => set("view", v === "grade" ? "" : v)} options={[{ value: "grade", label: "Cartões" }, { value: "tabela", label: "Tabela" }, { value: "gastos", label: "Quem mais gasta" }]} />
            {!usarTempo ? (
              <button type="button" onClick={() => setComTempo(true)} className="rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-2">Calcular tempo de casa</button>
            ) : !histPronto ? <Spinner label={`Lendo legislaturas desde 1983… ${histCarregados}/${LEG_HIST.length}`} /> : null}
          </div>

          {view === "gastos" ? <QuemMaisGasta casa="camara" /> : lista.isPending ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div>
          ) : view === "tabela" ? (
            <DataTable rows={filtrados} columns={cols} pageSize={50} exportName={`deputados-${leg}`} rowKey={(r) => r.id} search={(r) => `${r.nome} ${r.siglaPartido} ${r.siglaUf}`} />
          ) : (
            <>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filtrados.slice(0, limite).map((d) => (
                  <li key={d.id}>
                    <Link to={`/deputado/${d.id}`} className="card flex h-full items-center gap-3 p-3 transition hover:shadow-[0_0_0_1px_var(--color-accent)]">
                      <Avatar src={d.urlFoto} name={d.nome} size="lg" />
                      <span className="min-w-0 space-y-1">
                        <span className="block truncate font-semibold">{d.nome}</span>
                        <span className="flex items-center gap-1.5 text-xs text-muted"><PartyBadge sigla={d.siglaPartido} link={false} />{d.siglaUf}</span>
                        {d.nLeg != null && d.dias != null && <ChipsMandato n={d.nLeg} tempo={formatDuracao(d.dias)} atual={leg === "atual"} estimado />}
                        {d.pago != null && <span className="block text-xs text-muted">Dinheiro mandado: <b className="text-fg"><Money centavos={d.pago} compact /></b></span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {filtrados.length > limite && (
                <div className="mt-4 text-center">
                  <button type="button" onClick={() => setLimite((l) => l + 60)} className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-surface-2">
                    Mostrar mais ({formatNumber(filtrados.length - limite)} restantes)
                  </button>
                </div>
              )}
            </>
          )}

          <Section title="Bancadas na seleção" tip="Quantos deputados de cada partido aparecem com os filtros atuais.">
            <Card><Bars data={porPartido} /></Card>
          </Section>
        </>
      )}
      <Fontes items={[
        { label: "API da Câmara — deputados", href: fontes.camaraApi(pathLista) },
        { label: "Lista oficial no site da Câmara", href: "https://www.camara.leg.br/deputados/quem-sao" },
        ...fontes.emendas(),
      ]} />
    </>
  );
}
