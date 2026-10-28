import { dataPath, UFS, type SiglaUf, type Uf } from "@emenda/contracts";
import { useMemo } from "react";
import { useParams } from "react-router";
import { COR_TIPO, nomeTipoCurto } from "@/features/emendas/tipos";
import { AutoresTable, MunicipiosTable } from "@/features/emendas/tables";
import { TotaisGrid } from "@/features/emendas/Totais";
import { Choropleth } from "@/features/geo/Choropleth";
import { isSiglaUf } from "@/features/geo/malhas";
import { ibge, useApi, useCamara } from "@/lib/data";
import { formatBRL, formatNumber } from "@/lib/format";
import { Avatar, NextSteps, Card, Donut, EmptyState, ErrorState, LineArea, PartyBadge, PageHeader, Section, Skeleton, Tabs } from "@/ui";
import { Link } from "react-router";
import NotFound from "./NotFound";

interface DeputadoCamara { id: number; nome: string; siglaPartido: string; siglaUf: string; urlFoto: string; email?: string }
interface SenadoresLista {
  ListaParlamentarEmExercicio?: { Parlamentares?: { Parlamentar?: Array<{ IdentificacaoParlamentar: { CodigoParlamentar: string; NomeParlamentar: string; SiglaPartidoParlamentar?: string; UfParlamentar?: string; UrlFotoParlamentar?: string } }> } };
}

export default function UfPage() {
  const sigla = (useParams().uf ?? "").toUpperCase();
  if (!isSiglaUf(sigla)) return <NotFound />;
  return <UfView uf={sigla} />;
}

function UfView({ uf }: { uf: SiglaUf }) {
  const q = useApi<Uf>(dataPath.uf(uf));
  const d = q.data;
  const nome = UFS[uf];
  const values = useMemo(() => Object.fromEntries((d?.municipios ?? []).map((m) => [m.ibge, m.pago])), [d]);
  const byIbge = useMemo(() => new Map((d?.municipios ?? []).map((m) => [m.ibge, m])), [d]);
  const mun = useApi<Array<{ id: number; nome: string }>>(`/api/ibge/v1/localidades/estados/${uf}/municipios`);
  const nomeMun = useMemo(() => new Map((mun.data ?? []).map((m) => [String(m.id), m.nome])), [mun.data]);

  return (
    <>
      <PageHeader
        eyebrow="Estado"
        title={nome}
        subtitle={`Emendas parlamentares destinadas a ${nome} e aos seus municípios, com os parlamentares eleitos pelo estado.`}
        breadcrumbs={[{ label: "Início", to: "/" }, { label: "Estados" }, { label: uf }]}
        media={<span className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-verde to-azul font-display text-xl font-bold text-white shadow-lg">{uf}</span>}
      />
      {q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : d ? <TotaisGrid t={d.totais} /> : <Skeleton className="h-28" />}

      <Section title="Mapa por município" tip="Cor mais escura = mais dinheiro pago. Clique em um município para ver cada emenda.">
        <Card>
          <Choropleth
            url={ibge.malhaUF(uf)}
            values={values}
            label={(c) => byIbge.get(c)?.nome ?? nomeMun.get(c) ?? c}
            href={(c) => `/municipio/${c}`}
            format={(n) => formatBRL(n, true)}
            detail={(c) => { const m = byIbge.get(c); return m ? <p className="text-xs text-muted">{formatNumber(m.n)} emendas · empenhado {formatBRL(m.empenhado, true)}</p> : null; }}
            ariaLabel={`Mapa dos municípios de ${nome}`}
          />
        </Card>
      </Section>

      {d && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Card title="Por tipo de emenda" tip="Emenda Pix vai direto para o caixa da prefeitura ou estado, sem finalidade definida antes.">
            <Donut data={d.porTipo.map((t) => ({ label: nomeTipoCurto(t.tipo), value: t.pago, color: COR_TIPO[t.tipo], highlight: t.tipo === "pix" }))} format={(n) => formatBRL(n, true)} centerLabel="Pago" />
          </Card>
          <Card title="Pago por ano" tip="pago">
            <LineArea data={[...d.porAno].sort((a, b) => a.ano - b.ano).map((a) => ({ x: a.ano, y: a.pago }))} format={(n) => formatBRL(n, true)} />
          </Card>
        </div>
      )}

      <Section title="Detalhes">
        <Tabs
          tabs={[
            { id: "municipios", label: "Municípios", count: d?.municipios.length, content: d ? <MunicipiosTable rows={d.municipios} exportName={`emendas-${uf}-municipios`} /> : <Skeleton className="h-64" /> },
            { id: "autores", label: "Autores", count: d?.autores.length, content: d ? <AutoresTable rows={d.autores} exportName={`emendas-${uf}-autores`} /> : <Skeleton className="h-64" /> },
            { id: "deputados", label: "Deputados federais", content: <DeputadosUf uf={uf} /> },
            { id: "senadores", label: "Senadores", content: <SenadoresUf uf={uf} /> },
          ]}
        />
      </Section>
      <NextSteps items={[
        { to: `/deputados?uf=${uf}`, label: `Deputados de ${uf}`, desc: "Votações, gastos e projetos de cada um." },
        { to: `/senadores?uf=${uf}`, label: `Senadores de ${uf}`, desc: "Os três representantes do estado no Senado." },
        { to: "/emendas?tipo=pix", label: "Emendas Pix no Brasil", desc: "Transferências sem finalidade definida." },
        { to: "/dinheiro", label: "Fluxo do dinheiro", desc: "Do tipo de emenda à área de gasto." },
      ]} />
    </>
  );
}

function DeputadosUf({ uf }: { uf: string }) {
  const q = useCamara<DeputadoCamara[]>(`/api/camara/deputados?siglaUf=${uf}&ordem=ASC&ordenarPor=nome`);
  if (q.isPending) return <Skeleton className="h-48" />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (!q.data.length) return <EmptyState title="Nenhum deputado encontrado." />;
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {q.data.map((p) => (
        <li key={p.id}>
          <Link to={`/deputado/${p.id}`} className="card flex items-center gap-3 p-3 transition hover:border-accent">
            <Avatar src={p.urlFoto} name={p.nome} />
            <span className="min-w-0 flex-1 truncate font-medium">{p.nome}</span>
            <PartyBadge sigla={p.siglaPartido} link={false} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function SenadoresUf({ uf }: { uf: string }) {
  const q = useApi<SenadoresLista>("/api/senado/senador/lista/atual");
  if (q.isPending) return <Skeleton className="h-32" />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const list = (q.data.ListaParlamentarEmExercicio?.Parlamentares?.Parlamentar ?? []).map((p) => p.IdentificacaoParlamentar).filter((p) => p.UfParlamentar === uf);
  if (!list.length) return <EmptyState title="Nenhum senador encontrado." />;
  return (
    <ul className="grid gap-2 sm:grid-cols-3">
      {list.map((p) => (
        <li key={p.CodigoParlamentar}>
          <Link to={`/senador/${p.CodigoParlamentar}`} className="card flex items-center gap-3 p-3 transition hover:border-accent">
            <Avatar src={p.UrlFotoParlamentar} name={p.NomeParlamentar} />
            <span className="min-w-0 flex-1 truncate font-medium">{p.NomeParlamentar}</span>
            {p.SiglaPartidoParlamentar && <PartyBadge sigla={p.SiglaPartidoParlamentar} link={false} />}
          </Link>
        </li>
      ))}
    </ul>
  );
}
