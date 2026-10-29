import { dataPath, UFS, type SiglaUf, type Uf } from "@emenda/contracts";
import { useMemo } from "react";
import { useParams } from "react-router";
import { POPULACAO_UF } from "@/features/emendas/populacao";
import { BarraTipos, fraseChegou, ListaVerMais, ModoDetalhado, porMorador, QuemMandou } from "@/features/linguagem";
import { bandeiraUf } from "@/lib/cdn";
import { AutoresTable, MunicipiosTable } from "@/features/emendas/tables";
import { Choropleth } from "@/features/geo/Choropleth";
import { isSiglaUf } from "@/features/geo/malhas";
import { ibge, useApi, useCamara } from "@/lib/data";
import { formatBRL, formatNumber } from "@/lib/format";
import { Avatar, CountUp, NextSteps, Card, EmptyState, ErrorState, LineArea, PartyBadge, PageHeader, Section, Skeleton, Tabs, Tip } from "@/ui";
import { Link } from "react-router";
import NotFound from "./NotFound";
import { ShareButton } from "@/features/share";

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

  const pago = d?.totais.pago ?? 0;
  const pix = d?.porTipo.filter((t) => t.tipo === "pix").reduce((x, t) => x + t.pago, 0) ?? 0;
  const morador = porMorador(pago, POPULACAO_UF[uf]);
  const frase = d ? fraseChegou({ nome, pago, politicos: d.autores.filter((a) => a.pago > 0).length, pctPix: pago ? pix / pago : 0 }) : "";
  const cidades = useMemo(() => [...(d?.municipios ?? [])].sort((a, b) => b.pago - a.pago), [d]);

  return (
    <>
      <PageHeader
        eyebrow="Estado"
        title={nome}
        breadcrumbs={[{ label: "Início", to: "/" }, { label: nome }]}
        actions={<ShareButton fab kind="uf" title={nome} url={`/uf/${uf}`} ogId={uf} text={frase ? `${frase} Veja sua cidade:` : undefined} metric={d ? { value: d.totais.pago, format: "brl", label: "mandados por políticos" } : undefined} bars={d && cidades.slice(0, 5).map((m) => ({ label: nomeMun.get(m.ibge) ?? m.nome, value: m.pago }))} />}
        media={<img src={bandeiraUf(uf)} alt={`Bandeira de ${nome}`} className="h-12 w-auto rounded-md shadow ring-1 ring-line" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
      />
      {q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : !d ? <Skeleton className="h-72 rounded-3xl" /> : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr_1fr]">
          <section aria-labelledby="quanto" className="card p-5 sm:p-6">
            <h2 id="quanto" className="text-sm font-semibold text-muted">Dinheiro que deputados e senadores mandaram para {nome} <Tip content="Emendas parlamentares: parte do Orçamento federal que cada político escolhe para onde vai. Contamos o que de fato foi pago." /></h2>
            <p className="mt-1 font-display text-5xl font-bold tracking-tight tabular sm:text-6xl"><CountUp value={pago} format={(n) => formatBRL(Math.round(n), true)} /></p>
            {morador != null && <p className="mt-1 text-lg"><b className="tabular">R$ {formatNumber(morador)}</b> por morador <span className="text-sm text-muted">· {formatNumber(POPULACAO_UF[uf])} moradores (IBGE, Censo 2022)</span></p>}
            <p className="mt-3 text-pretty text-fg/85">{frase}</p>
            <div className="mt-5"><h3 className="mb-2 text-sm font-semibold">De que jeito chegou</h3><BarraTipos porTipo={d.porTipo} detalhe={(t) => ({ verMais: t === "outra" ? undefined : `/emendas?tipo=${t}&uf=${uf}` })} /></div>
          </section>
          <section aria-labelledby="quem" className="card p-4 sm:p-5">
            <h2 id="quem" className="mb-3 font-display text-lg font-bold">Quem mais mandou</h2>
            <QuemMandou autores={d.autores} inicial={5} />
          </section>
        </div>
      )}

      <Section title="Cidades que mais receberam" tip="Cor mais escura = mais dinheiro. Toque numa cidade para ver quem mandou.">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.2fr]">
          <Card>
            {d ? <ListaVerMais itens={cidades} inicial={8} passo={20} chave={(m) => m.ibge} className="divide-y divide-line" render={(m, i) => (
              <Link to={`/municipio/${m.ibge}`} className="flex items-center gap-3 py-2 hover:text-accent">
                <span className="w-6 text-right text-xs text-muted tabular">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{nomeMun.get(m.ibge) ?? m.nome}</span>
                <b className="tabular">{formatBRL(m.pago, true)}</b>
              </Link>
            )} /> : <Skeleton className="h-64" />}
          </Card>
          <Card>
            <Choropleth
              url={ibge.malhaUF(uf)}
              values={values}
              label={(c) => byIbge.get(c)?.nome ?? nomeMun.get(c) ?? c}
              href={(c) => `/municipio/${c}`}
              format={(n) => formatBRL(n, true)}
              detail={(c) => { const m = byIbge.get(c); return m ? <p className="text-xs text-muted">{formatNumber(m.n)} indicações · toque para abrir</p> : null; }}
              ariaLabel={`Mapa das cidades de ${nome}`}
            />
          </Card>
        </div>
      </Section>

      <Section title={`Quem representa ${nome} em Brasília`}>
        <h3 className="mb-2 text-sm font-semibold text-muted">Senadores</h3>
        <SenadoresUf uf={uf} />
        <h3 className="mb-2 mt-5 text-sm font-semibold text-muted">Deputados federais</h3>
        <DeputadosUf uf={uf} />
      </Section>

      <ModoDetalhado titulo="Ver tudo: todas as cidades, todos os políticos e ano a ano">
        {d && <Card title="Pago por ano" tip="pago"><LineArea data={[...d.porAno].sort((a, b) => a.ano - b.ano).map((a) => ({ x: a.ano, y: a.pago }))} format={(n) => formatBRL(n, true)} /></Card>}
        <div className="mt-4">
          <Tabs tabs={[
            { id: "municipios", label: "Cidades", count: d?.municipios.length, content: d ? <MunicipiosTable rows={d.municipios} exportName={`emendas-${uf}-municipios`} /> : <Skeleton className="h-64" /> },
            { id: "autores", label: "Quem mandou", count: d?.autores.length, content: d ? <AutoresTable rows={d.autores} exportName={`emendas-${uf}-autores`} /> : <Skeleton className="h-64" /> },
          ]} />
        </div>
      </ModoDetalhado>
      <NextSteps items={[
        { to: `/deputados?uf=${uf}`, label: `Deputados de ${nome}`, desc: "Votos, gastos e projetos de cada um." },
        { to: "/pix", label: "Dinheiro sem dizer para quê", desc: "Onde mais isso acontece." },
        { to: "/", label: "Comparar com outros estados", desc: "Toque no mapa da página inicial." },
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
    <ListaVerMais itens={q.data} inicial={6} passo={30} chave={(p) => p.id} className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" render={(p) => (
      <Link to={`/deputado/${p.id}`} className="card flex items-center gap-3 p-3 transition hover:border-accent">
        <Avatar src={p.urlFoto} name={p.nome} />
        <span className="min-w-0 flex-1 truncate font-medium">{p.nome}</span>
        <PartyBadge sigla={p.siglaPartido} link={false} />
      </Link>
    )} />
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
