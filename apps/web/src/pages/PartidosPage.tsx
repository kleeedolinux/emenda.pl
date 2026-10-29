import { CABECALHOS, CabecalhoPagina } from "@/features/linguagem";
import { useMemo } from "react";
import { Link } from "react-router";
import { Bars, Card, DataTable, ErrorState, Hemicycle, Money, PageHeader, PartyBadge, Section, Skeleton, Stat, StatGrid, formatNumber, partyColor, type Column } from "@/ui";
import { cam, dedupeDeputados, encontrarAutor, fontes, mapSenadores, sen, type DeputadoLista, type Partido, type SenadorResumo } from "@/features/legislativo/api";
import { useAutores, useCamaraTodas, useSenado } from "@/features/legislativo/hooks";
import { normPartido } from "@/features/legislativo/votacao";
import { Fontes } from "@/features/legislativo/components";

type Linha = Partido & { deputados: number; senadores: number; pago: number };

export default function PartidosPage() {
  const partidos = useCamaraTodas<Partido>(cam.partidos(57));
  const deps = useCamaraTodas<DeputadoLista>("/deputados?ordem=ASC&ordenarPor=nome");
  const sens = useSenado<SenadorResumo[]>(sen.listaAtual(), mapSenadores);
  const autores = useAutores();

  const linhas: Linha[] = useMemo(() => {
    const ds = dedupeDeputados(deps.data ?? []);
    const m = new Map<string, Linha>();
    for (const p of partidos.data ?? []) m.set(normPartido(p.sigla), { ...p, deputados: 0, senadores: 0, pago: 0 });
    const get = (s: string) => m.get(normPartido(s)) ?? m.set(normPartido(s), { id: 0, sigla: s, nome: s, deputados: 0, senadores: 0, pago: 0 }).get(normPartido(s))!;
    for (const d of ds) {
      const l = get(d.siglaPartido);
      l.deputados++;
      if (autores.data) l.pago += encontrarAutor(autores.data.idx, [d.nome])?.pago ?? 0;
    }
    for (const s of sens.data ?? []) {
      const l = get(s.partido);
      l.senadores++;
      if (autores.data) l.pago += encontrarAutor(autores.data.idx, [s.nome, s.nomeCompleto])?.pago ?? 0;
    }
    return [...m.values()].sort((a, b) => b.deputados + b.senadores - (a.deputados + a.senadores) || a.sigla.localeCompare(b.sigla));
  }, [partidos.data, deps.data, sens.data, autores.data]);

  const seats = useMemo(() => {
    const ds = dedupeDeputados(deps.data ?? []);
    return linhas.flatMap((l) => ds.filter((d) => normPartido(d.siglaPartido) === normPartido(l.sigla)).map((d) => ({ key: String(d.id), color: partyColor(l.sigla), group: l.sigla, label: `${d.nome} (${d.siglaUf})` })));
  }, [linhas, deps.data]);

  const cols: Column<Linha>[] = [
    { key: "sigla", header: "Partido", sort: true, cell: (r) => <PartyBadge sigla={r.sigla} /> },
    { key: "nome", header: "Nome", sort: true, cell: (r) => <Link className="link" to={`/partido/${encodeURIComponent(r.sigla)}`}>{r.nome}</Link> },
    { key: "deputados", header: "Deputados", align: "right", sort: true, tip: "Deputados federais em exercício hoje." },
    { key: "senadores", header: "Senadores", align: "right", sort: true },
    { key: "pago", header: "Emendas pagas (bancada atual)", align: "right", sort: true, tip: "Soma do que já foi pago em emendas indicadas pelos parlamentares que hoje estão no partido (cruzamento por nome).", cell: (r) => (autores.data ? <Money centavos={r.pago} compact /> : "…") },
  ];

  return (
    <>
      <CabecalhoPagina c={CABECALHOS.partidos}
        breadcrumbs={[{ label: "Início", to: "/" }, { label: "Partidos" }]} />
      {partidos.isError ? <ErrorState error={partidos.error} retry={() => partidos.refetch()} /> : (
        <>
          <StatGrid className="mb-6">
            <Stat label="Partidos com registro na legislatura" value={partidos.data ? formatNumber(partidos.data.length) : "…"} tip="legislatura" />
            <Stat label="Com deputados hoje" value={formatNumber(linhas.filter((l) => l.deputados).length)} />
            <Stat label="Com senadores hoje" value={formatNumber(linhas.filter((l) => l.senadores).length)} />
            <Stat label="Maior bancada na Câmara" value={linhas[0] ? `${linhas.slice().sort((a, b) => b.deputados - a.deputados)[0]!.sigla}` : "…"} />
          </StatGrid>
          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <Card title="Câmara hoje" tip="Cada ponto é uma das 513 cadeiras, colorida pelo partido atual.">{deps.isPending ? <Skeleton className="h-64" /> : <Hemicycle seats={seats} />}</Card>
            <Card title="Emendas pagas por bancada atual" tip="pago">
              {autores.data ? <Bars data={linhas.filter((l) => l.pago > 0).sort((a, b) => b.pago - a.pago).slice(0, 15).map((l) => ({ label: l.sigla, value: l.pago, color: partyColor(l.sigla), href: `/partido/${encodeURIComponent(l.sigla)}` }))} format={(n) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact" }).format(n / 100)} /> : <Skeleton className="h-64" />}
            </Card>
          </div>
          <Section title="Todos os partidos">
            <Card>{partidos.isPending ? <Skeleton className="h-60" /> : <DataTable rows={linhas} columns={cols} pageSize={40} rowKey={(r) => r.sigla} exportName="partidos" search={(r) => `${r.sigla} ${r.nome}`} />}</Card>
          </Section>
        </>
      )}
      <Fontes items={[
        { label: "Partidos (API da Câmara)", href: fontes.camaraApi(cam.partidos(57)) },
        { label: "Deputados em exercício (API)", href: fontes.camaraApi("/deputados") },
        { label: "Senadores (API do Senado)", href: fontes.senadoApi(sen.listaAtual()) },
        ...fontes.emendas(),
      ]} />
    </>
  );
}
