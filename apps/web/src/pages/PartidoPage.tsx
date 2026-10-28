import { useMemo } from "react";
import { Link, useParams } from "react-router";
import {
  Avatar, Card, DataTable, EmptyState, ErrorState, ExternalLink, Hemicycle, KeyValue, Money, PageHeader, PartyBadge, Section, Skeleton,
  Stat, StatGrid, formatDate, formatNumber, partyColor, useCamara, type Column,
} from "@/ui";
import { cam, dedupeDeputados, encontrarAutor, fontes, mapSenadores, sen, type DeputadoLista, type Partido, type PartidoDetalhe, type SenadorResumo } from "@/features/legislativo/api";
import { useAutores, useCamaraTodas, useSenado } from "@/features/legislativo/hooks";
import { normPartido } from "@/features/legislativo/votacao";
import { Fontes, Parlamentar } from "@/features/legislativo/components";
import { ShareButton } from "@/features/share";

type Membro = DeputadoLista & { pago?: number; codigoAutor?: string };

export default function PartidoPage() {
  const sigla = decodeURIComponent(useParams().sigla ?? "");
  const busca = useCamara<Partido[]>(sigla ? cam.partidoPorSigla(sigla) : null);
  const ref = busca.data?.find((p) => normPartido(p.sigla) === normPartido(sigla)) ?? busca.data?.[0];
  const det = useCamara<PartidoDetalhe>(ref ? cam.partido(ref.id) : null);
  const membros = useCamaraTodas<DeputadoLista>(ref ? `/partidos/${ref.id}/membros?itens=100` : null);
  const todos = useCamaraTodas<DeputadoLista>("/deputados?ordem=ASC&ordenarPor=nome");
  const sens = useSenado<SenadorResumo[]>(sen.listaAtual(), mapSenadores);
  const autores = useAutores();

  const ms: Membro[] = useMemo(() => dedupeDeputados(membros.data ?? []).map((d) => {
    const a = autores.data ? encontrarAutor(autores.data.idx, [d.nome]) : null;
    return { ...d, pago: a?.pago, codigoAutor: a?.codigo };
  }), [membros.data, autores.data]);
  const senadores = useMemo(() => (sens.data ?? []).filter((s) => normPartido(s.partido) === normPartido(sigla)).map((s) => ({
    ...s, pago: autores.data ? encontrarAutor(autores.data.idx, [s.nome, s.nomeCompleto])?.pago : undefined,
  })), [sens.data, sigla, autores.data]);
  const totalPago = ms.reduce((s, m) => s + (m.pago ?? 0), 0) + senadores.reduce((s, x) => s + (x.pago ?? 0), 0);

  const seats = useMemo(() => {
    const ds = dedupeDeputados(todos.data ?? []);
    const nosso = ds.filter((d) => normPartido(d.siglaPartido) === normPartido(sigla));
    const outros = ds.filter((d) => normPartido(d.siglaPartido) !== normPartido(sigla));
    return [
      ...nosso.map((d) => ({ key: String(d.id), color: partyColor(sigla), group: sigla, label: `${d.nome} (${d.siglaUf})` })),
      ...outros.map((d) => ({ key: String(d.id), color: "#cbd5e1", group: "Demais partidos", label: `${d.nome} (${d.siglaPartido}-${d.siglaUf})` })),
    ];
  }, [todos.data, sigla]);

  if (busca.isError) return <ErrorState error={busca.error} retry={() => busca.refetch()} />;
  if (busca.data && !ref) return <EmptyState title={`Partido “${sigla}” não encontrado na Câmara.`} hint={<Link className="link" to="/partidos">Ver todos os partidos</Link>} />;
  const d = det.data;
  const lider = d?.status.lider;
  const liderId = lider?.uri ? /\/deputados\/(\d+)/.exec(lider.uri)?.[1] : undefined;

  const cols: Column<Membro>[] = [
    { key: "nome", header: "Deputado(a)", sort: true, cell: (r) => <Parlamentar nome={r.nome} foto={r.urlFoto} to={`/deputado/${r.id}`} /> },
    { key: "siglaUf", header: "UF", sort: true },
    { key: "pago", header: "Emendas pagas", align: "right", tip: "pago", sort: (r) => r.pago ?? 0, cell: (r) => (r.pago != null ? <Money centavos={r.pago} compact /> : "—") },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Partido"
        title={d?.nome ?? sigla}
        subtitle={d ? <>Sigla <PartyBadge sigla={d.sigla} link={false} /> · situação {d.status.situacao.toLowerCase()} · dados de {formatDate(d.status.data)}</> : undefined}
        media={<Avatar src={d?.urlLogo} name={sigla} size="lg" />}
        breadcrumbs={[{ label: "Início", to: "/" }, { label: "Partidos", to: "/partidos" }, { label: sigla }]}
        actions={<ShareButton fab kind="partido" title={d?.nome ? `${d.nome} (${sigla})` : sigla} url={`/partido/${sigla}`} ogId={sigla} metric={autores.data ? { value: totalPago, format: "brl", label: "em emendas pagas" } : undefined} />}
      />
      <StatGrid className="mb-6">
        <Stat label="Deputados (membros)" value={membros.data ? formatNumber(ms.length) : "…"} hint={d ? `${d.status.totalPosse} tomaram posse na legislatura` : undefined} tip="Membros atuais segundo a Câmara." />
        <Stat label="Senadores" value={sens.data ? formatNumber(senadores.length) : "…"} />
        <Stat label="Emendas pagas (bancada atual)" tip="pago" value={autores.data ? <Money centavos={totalPago} compact /> : "…"} hint="Soma dos parlamentares que hoje estão no partido" />
        <Stat label="Fatia da Câmara" value={todos.data ? `${((ms.length / 513) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "…"} />
      </StatGrid>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card title="Liderança e contato">
          {det.isPending ? <Skeleton className="h-24" /> : d ? (
            <KeyValue items={[
              ["Líder na Câmara", lider ? <Parlamentar nome={lider.nome} foto={lider.urlFoto} uf={lider.uf} to={liderId ? `/deputado/${liderId}` : undefined} /> : null, "O líder fala em nome da bancada e orienta como seus deputados devem votar."],
              ["Número eleitoral", d.numeroEleitoral],
              ["Site", d.urlWebSite ? <ExternalLink href={d.urlWebSite}>{d.urlWebSite}</ExternalLink> : null],
              ["Facebook", d.urlFacebook ? <ExternalLink href={d.urlFacebook}>{d.urlFacebook}</ExternalLink> : null],
            ]} />
          ) : null}
          {ref && <Fontes items={fontes.partido(ref.id)} />}
        </Card>
        <Card title="Peso na Câmara" tip="Cadeiras do partido em destaque entre os 513 deputados em exercício.">{todos.isPending ? <Skeleton className="h-56" /> : <Hemicycle seats={seats} />}</Card>
      </div>

      <Section title="Deputados do partido">
        <Card>
          {membros.isPending ? <Skeleton className="h-60" /> : <DataTable rows={ms} columns={cols} pageSize={50} rowKey={(r) => r.id} exportName={`membros-${sigla}`} search={(r) => `${r.nome} ${r.siglaUf}`} initialSort={{ key: "pago", dir: "desc" }} />}
          {ref && <Fontes items={[{ label: "Membros (API da Câmara)", href: fontes.camaraApi(`/partidos/${ref.id}/membros`) }]} />}
        </Card>
      </Section>
      <Section title="Senadores do partido">
        <Card>
          {sens.isPending ? <Skeleton className="h-24" /> : senadores.length ? (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {senadores.map((s) => (
                <li key={s.codigo} className="flex items-center justify-between gap-2">
                  <Parlamentar nome={s.nome} foto={s.foto} uf={s.uf} to={`/senador/${s.codigo}`} />
                  {s.pago != null && <span className="text-xs text-muted"><Money centavos={s.pago} compact /></span>}
                </li>
              ))}
            </ul>
          ) : <EmptyState title="Nenhum senador em exercício neste partido." />}
          <Fontes items={[{ label: "Senadores (API do Senado)", href: fontes.senadoApi(sen.listaAtual()) }, ...fontes.emendas()]} />
        </Card>
      </Section>
    </>
  );
}
