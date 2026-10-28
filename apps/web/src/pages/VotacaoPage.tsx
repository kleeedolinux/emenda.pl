import { useMemo } from "react";
import { Link, useParams } from "react-router";
import {
  Badge, Card, DataTable, EmptyState, ErrorState, KeyValue, PageHeader, PartyBadge, Section, Skeleton, Stat, StatGrid, Term, VoteBadge,
  formatDate, formatNumber, useCamara, type Column,
} from "@/ui";
import { cam, fontes, type VotacaoDetalhe } from "@/features/legislativo/api";
import { categoriaVoto, mapaOrientacoes, normPartido, placar, porPartido, porUf, type LinhaGrupo, type Orientacao, type VotoCamara } from "@/features/legislativo/votacao";
import { Fontes, Parlamentar } from "@/features/legislativo/components";
import { AutoLink, OrgaoLink } from "@/features/links";
import { VotacaoInterativa } from "@/features/legislativo/VotacaoInterativa";
import { ShareButton, ShareVoto, VotoDestaque } from "@/features/share";

export default function VotacaoPage() {
  const id = useParams().id ?? "";
  const valido = /^\d+-\d+$/.test(id);
  const det = useCamara<VotacaoDetalhe>(valido ? cam.votacao(id) : null);
  const vq = useCamara<VotoCamara[]>(valido ? cam.votos(id) : null);
  const oq = useCamara<Orientacao[]>(valido ? cam.orientacoes(id) : null);
  const votos = vq.data ?? [];
  const ori = oq.data ?? [];
  const p = useMemo(() => placar(votos), [votos]);
  const partidos = useMemo(() => porPartido(votos, ori), [votos, ori]);
  const ufs = useMemo(() => porUf(votos), [votos]);
  const mapa = useMemo(() => mapaOrientacoes(ori), [ori]);
  const votosShare = { sim: p.sim, nao: p.nao, outros: p.total - p.sim - p.nao };
  const contraSet = useMemo(() => new Set(partidos.flatMap((r) => r.contraIds)), [partidos]);

  if (!valido) return <EmptyState title="Identificador de votação inválido." hint="O formato é parecido com 2196833-395." />;
  if (det.isError) return <ErrorState error={det.error} retry={() => det.refetch()} />;
  const d = det.data;
  const plenario = d?.siglaOrgao === "PLEN";
  const props = [...(d?.proposicoesAfetadas ?? []), ...(d?.objetosPossiveis ?? [])].filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i);

  const colsGrupo = (nome: string, comOrient: boolean): Column<LinhaGrupo>[] => [
    { key: "grupo", header: nome, sort: true, cell: (r) => (comOrient ? <PartyBadge sigla={r.grupo} /> : <Link className="link" to={`/uf/${r.grupo}`}>{r.grupo}</Link>) },
    { key: "total", header: "Votos", align: "right", sort: true },
    { key: "sim", header: "Sim", align: "right", sort: true },
    { key: "nao", header: "Não", align: "right", sort: true },
    { key: "abstencao", header: "Abst.", align: "right", sort: true },
    { key: "obstrucao", header: "Obstr.", align: "right", sort: true },
    { key: "outro", header: "Outros", align: "right", sort: true },
    ...(comOrient ? [
      { key: "orientacao", header: "Orientação", tip: "orientação de bancada", sort: (r: LinhaGrupo) => r.orientacao ?? "", cell: (r: LinhaGrupo) => (r.orientacao ? <VoteBadge voto={r.orientacao} /> : "—") },
      { key: "contra", header: "Contra a orientação", align: "right" as const, sort: true, tip: "Quantos deputados do partido votaram diferente do que o líder orientou (Sim, Não, Abstenção ou Obstrução). “Liberado” não conta.",
        cell: (r: LinhaGrupo) => (r.contra ? <Badge tone="amarelo">{r.contra}</Badge> : "0") },
    ] : []),
  ];

  const colsVotos: Column<VotoCamara>[] = [
    { key: "nome", header: "Deputado(a)", sort: (r) => r.deputado_.nome, csv: (r) => r.deputado_.nome,
      cell: (r) => <Parlamentar nome={r.deputado_.nome} foto={r.deputado_.urlFoto} to={`/deputado/${r.deputado_.id}`} /> },
    { key: "partido", header: "Partido", sort: (r) => r.deputado_.siglaPartido, csv: (r) => r.deputado_.siglaPartido, cell: (r) => <PartyBadge sigla={r.deputado_.siglaPartido} /> },
    { key: "uf", header: "UF", sort: (r) => r.deputado_.siglaUf, csv: (r) => r.deputado_.siglaUf, cell: (r) => r.deputado_.siglaUf },
    { key: "tipoVoto", header: "Voto", sort: true, cell: (r) => <VoteBadge voto={r.tipoVoto} /> },
    { key: "orient", header: "Orientação do partido", sort: (r) => mapa.partidos.get(normPartido(r.deputado_.siglaPartido)) ?? "", csv: (r) => mapa.partidos.get(normPartido(r.deputado_.siglaPartido)) ?? "",
      cell: (r) => { const o = mapa.partidos.get(normPartido(r.deputado_.siglaPartido)); return o ? <VoteBadge voto={o} /> : "—"; } },
    { key: "contra", header: "Contra orientação?", sort: (r) => (contraSet.has(r.deputado_.id) ? 1 : 0), csv: (r) => (contraSet.has(r.deputado_.id) ? "sim" : ""),
      cell: (r) => (contraSet.has(r.deputado_.id) ? <Badge tone="amarelo">votou contra</Badge> : "") },
    { key: "share", header: "", csv: () => "", cell: (r) => <ShareVoto votacaoId={id} titulo={d ? d.descUltimaAberturaVotacao || d.descricao : `Votação ${id}`} v={r} placar={votosShare} /> },
  ];

  return (
    <>
      <PageHeader
        eyebrow={<>Votação na Câmara · <Term k="votação nominal" /></>}
        title={d ? (d.descUltimaAberturaVotacao || d.descricao) : <Skeleton className="h-9 w-2/3" />}
        subtitle={d ? <>{formatDate(d.data)} · <OrgaoLink sigla={d.siglaOrgao} uri={d.idOrgao} />{d.descUltimaAberturaVotacao ? <> · <AutoLink text={d.descricao} /></> : null}</> : undefined}
        breadcrumbs={[{ label: "Início", to: "/" }, { label: "Proposições", to: "/proposicoes" }, { label: `Votação ${id}` }]}
        actions={d && <>{d.aprovacao === 1 ? <Badge tone="verde">Aprovada</Badge> : d.aprovacao === 0 ? <Badge tone="vermelho">Rejeitada</Badge> : <Badge>Resultado no texto</Badge>}<ShareButton fab kind="votacao" title={d.descUltimaAberturaVotacao || d.descricao} subtitle={formatDate(d.data)} url={`/votacao/${id}`} ogId={id} votes={votos.length ? votosShare : undefined} /></>}
      />


      {vq.isError ? <ErrorState error={vq.error} retry={() => vq.refetch()} /> : vq.isPending ? <Skeleton className="h-80" /> : votos.length === 0 ? (
        <EmptyState title="Esta votação não tem votos individuais registrados." hint="Votações simbólicas (por aclamação) não registram como cada deputado votou." />
      ) : (
        <>
          <VotoDestaque votacaoId={id} titulo={d ? d.descUltimaAberturaVotacao || d.descricao : `Votação ${id}`} votos={votos} placar={votosShare} />
          <StatGrid className="mb-6">
            <Stat label="Sim" value={formatNumber(p.sim)} />
            <Stat label="Não" value={formatNumber(p.nao)} />
            <Stat label="Abstenção / obstrução" value={formatNumber(p.abstencao + p.obstrucao)} tip="Abstenção: presente, mas sem tomar lado. Obstrução: estratégia para atrasar ou derrubar a votação, geralmente negando quórum." />
            <Stat label="Votaram contra o partido" value={formatNumber(contraSet.size)} tip="orientação de bancada" />
          </StatGrid>

          <Section title="Quem votou como" tip="Cada ponto é uma cadeira; o partido é o do dia da votação. Passe o mouse ou use Tab nos cartões para ver voto e orientação do partido.">
            <Card>
              <VotacaoInterativa votos={votos} orientacoes={ori} cadeiras={plenario ? 513 : votos.length} perfil={(i) => `/deputado/${i}`} quem="deputado(a)"
                extra={mapa.gerais.length > 0 && (
                  <p className="mt-3 flex flex-wrap items-center justify-center gap-2 text-sm">
                    <span className="text-muted">Orientações gerais:</span>
                    {mapa.gerais.map((g) => <span key={g.lideranca} className="inline-flex items-center gap-1">{g.lideranca} <VoteBadge voto={g.orientacao} /></span>)}
                  </p>
                )} />
            </Card>
          </Section>

          <Section title="Por partido" tip="orientação de bancada">
            <Card>
              <DataTable rows={partidos} columns={colsGrupo("Partido", true)} pageSize={40} rowKey={(r) => r.grupo} exportName={`votacao-${id}-partidos`} initialSort={{ key: "total", dir: "desc" }} />
              {oq.data && oq.data.length > 0 && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer font-medium">Todas as orientações registradas ({oq.data.length})</summary>
                  <ul className="mt-2 flex flex-wrap gap-2">{oq.data.map((o, i) => <li key={i} className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1">{o.siglaPartidoBloco} <VoteBadge voto={o.orientacaoVoto} /></li>)}</ul>
                </details>
              )}
            </Card>
          </Section>

          <details className="mt-6 rounded-2xl border border-line bg-surface p-4">
            <summary className="cursor-pointer font-semibold">Por estado</summary>
            <div className="mt-3"><DataTable rows={ufs} columns={colsGrupo("UF", false)} pageSize={27} rowKey={(r) => r.grupo} exportName={`votacao-${id}-ufs`} /></div>
          </details>

          <details className="mt-4 rounded-2xl border border-line bg-surface p-4">
            <summary className="cursor-pointer font-semibold">Tabela completa de votos (ordenar, exportar CSV, compartilhar voto)</summary>
            <div className="mt-3">
              <DataTable rows={votos} columns={colsVotos} pageSize={50} rowKey={(r) => r.deputado_.id} exportName={`votacao-${id}-votos`}
                search={(r) => `${r.deputado_.nome} ${r.deputado_.siglaPartido} ${r.deputado_.siglaUf} ${r.tipoVoto}`} searchPlaceholder="Filtrar por nome, partido, UF ou voto…" />
              <p className="mt-2 text-xs text-muted">{formatNumber(votos.filter((v) => categoriaVoto(v.tipoVoto) === "outro").length)} registros “outros” incluem o presidente da sessão (Art. 17 do Regimento: não vota, salvo empate).</p>
            </div>
          </details>
        </>
      )}
      {d && (
        <details className="mt-6 rounded-2xl border border-line bg-surface p-4">
          <summary className="cursor-pointer font-semibold">Sobre esta votação (data, órgão, proposições, parecer)</summary>
          <div className="mt-3">
          <KeyValue items={[
            ["Data e hora", d.dataHoraRegistro ? new Date(d.dataHoraRegistro).toLocaleString("pt-BR") : formatDate(d.data)],
            ["Onde", d.siglaOrgao === "PLEN" ? "Plenário da Câmara" : <OrgaoLink sigla={d.siglaOrgao} uri={d.idOrgao} />],
            ["Resultado registrado", <AutoLink text={d.descricao} />],
            ["Proposições envolvidas", props.length ? (
              <span className="flex flex-col gap-1">{props.slice(0, 8).map((x) => <Link key={x.id} className="link" to={`/proposicao/${x.id}`}>{x.siglaTipo} {x.numero}/{x.ano} — {x.ementa.slice(0, 90)}</Link>)}</span>
            ) : null],
            ...(d.ultimaApresentacaoProposicao?.descricao ? [["Último parecer apresentado", <AutoLink className="line-clamp-4" text={d.ultimaApresentacaoProposicao.descricao} />] as [string, React.ReactNode]] : []),
          ]} />
          </div>
        </details>
      )}
      <Fontes items={[...fontes.votacao(id), ...(d?.idEvento ? [{ label: "Evento (sessão) no site da Câmara", href: `https://www.camara.leg.br/evento-legislativo/${d.idEvento}` }] : [])]} />
    </>
  );
}
