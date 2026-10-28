import { useMemo } from "react";
import { Link, useParams } from "react-router";
import { gastosPath, type GastosRanking } from "@emenda/contracts";
import {
  Avatar, Badge, Bars, Card, EmptyState, ErrorState, ExternalLink, KeyValue, Money, PageHeader, PartyBadge, Section, Skeleton, Spinner, Stat, StatGrid,
  Tip, formatDate, formatNumber, formatPct, useApi, useCamara,
} from "@/ui";
import { fontes } from "@/features/legislativo/api";
import { useAutores } from "@/features/legislativo/hooks";
import { Fontes } from "@/features/legislativo/components";
import { ShareButton } from "@/features/share";
import { bancadaPorId, documentoFrente } from "@/features/bancadas/catalogo";
import { composicao, dataRegistro, resolverBancada, somaEmendas, somaGastos, votoGrupo, type FrenteDetalhe, type MembroFrente } from "@/features/bancadas/bancadas";
import { BarraComparada, DonutPartidos, GradeMembros } from "@/features/bancadas/components";
import { pathFrente, pathMembros, useVotosPautas } from "@/features/bancadas/hooks";

export default function BancadaPage() {
  const param = useParams().id;
  const id = resolverBancada(param);
  const b = id ? bancadaPorId(id) : null;
  const det = useCamara<FrenteDetalhe>(id ? pathFrente(id) : null);
  const mem = useCamara<MembroFrente[]>(id ? pathMembros(id) : null);

  if (!id) return <EmptyState title="Bancada não encontrada." hint={<Link className="link" to="/bancadas">Ver todas as bancadas</Link>} />;
  if (det.isError) return <ErrorState error={det.error} retry={() => det.refetch()} />;

  const f = det.data;
  const titulo = b?.apelido ?? f?.titulo;
  const membros = mem.data ?? [];
  const url = `/bancada/${b?.slug ?? id}`;
  const registro = dataRegistro(f?.situacao);
  const doc = f?.urlDocumento || documentoFrente(id);

  return (
    <>
      <PageHeader
        eyebrow={b ? `Bancada temática · ${b.tema}` : "Frente parlamentar"}
        title={titulo ?? <Skeleton className="h-9 w-72" />}
        subtitle={b ? <>Nome oficial: {b.oficial}</> : f ? "Frente parlamentar registrada na Câmara dos Deputados." : undefined}
        breadcrumbs={[{ label: "Início", to: "/" }, { label: "Bancadas", to: "/bancadas" }, { label: titulo ?? "…" }]}
        actions={f && (
          <ShareButton fab kind="pagina" title={titulo!} subtitle={b?.oficial} url={url}
            text={mem.data ? `🏛️ ${titulo}: ${formatNumber(membros.length)} deputados membros. Veja quem são, de que partidos e como votaram:` : undefined}
            metric={mem.data ? { value: membros.length, format: "int", label: "membros" } : undefined} />
        )}
      />

      <div className="mb-8 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card title="O que é e o que faz" tip="Resumo neutro da finalidade declarada pela própria frente, com o trecho do documento oficial usado.">
          {b ? (
            <>
              <p className="text-pretty">{b.resumo}</p>
              <p className="mt-2 text-xs text-muted">Fonte: {b.fonte} — <ExternalLink href={doc}>documento oficial (requerimento, ata e estatuto)</ExternalLink>.</p>
              {b.nota && <p className="mt-3 rounded-xl bg-amarelo/10 px-3 py-2 text-sm">{b.nota}</p>}
            </>
          ) : (
            <p className="text-pretty">Frentes parlamentares reúnem parlamentares de vários partidos em torno de um tema. A finalidade de cada uma está no estatuto registrado na Câmara: <ExternalLink href={doc}>ler documento oficial</ExternalLink>.</p>
          )}
          <p className="mt-3 text-sm text-muted">Participar de uma frente não obriga o parlamentar a votar de determinado jeito. Veja abaixo como os membros votaram de fato.</p>
        </Card>
        <Card title="Registro">
          {f ? (
            <>
              <KeyValue items={[
                ["Nome oficial", f.titulo],
                ["Coordenação", f.coordenador ? (
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <Avatar src={f.coordenador.urlFoto} name={f.coordenador.nome} size="sm" />
                    <Link className="link" to={`/deputado/${f.coordenador.id}`}>{f.coordenador.nome}</Link>
                    <PartyBadge sigla={f.coordenador.siglaPartido} />{f.coordenador.siglaUf}
                  </span>
                ) : "—"],
                ["Pedido de registro", registro ? formatDate(registro) : "—", "Data do primeiro andamento no histórico da Câmara (recebimento do requerimento, ata e estatuto)."],
                ["Legislatura", `${f.idLegislatura}ª (2023–2027)`],
                ["Documento", <ExternalLink href={doc}>Requerimento, ata e estatuto (PDF)</ExternalLink>],
                ["Site", f.urlWebsite ? <ExternalLink href={f.urlWebsite}>{f.urlWebsite.replace(/^https?:\/\//, "")}</ExternalLink> : null],
              ]} />
              {f.situacao && (
                <details className="mt-3 text-xs text-muted">
                  <summary className="cursor-pointer font-semibold">Histórico do registro</summary>
                  <p className="mt-2 whitespace-pre-line">{f.situacao}</p>
                </details>
              )}
            </>
          ) : <Skeleton className="h-40" />}
        </Card>
      </div>

      {mem.isError ? <ErrorState error={mem.error} retry={() => mem.refetch()} /> : mem.isPending ? <Skeleton className="h-60" /> : (
        <>
          <Numeros membros={membros} />
          <Section id="composicao" title="Composição" tip="Partido e UF atuais de cada deputado membro, como publicados pela Câmara.">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="Por partido"><DonutPartidos membros={membros} /></Card>
              <Card title="Por estado (UF)">
                <Bars data={composicao(membros, (m) => m.siglaUf).map((u) => ({ label: u.label, value: u.value, href: `/uf/${u.label}` }))} limit={12} />
                <p className="mt-2 text-xs text-muted">12 estados com mais membros. Todos aparecem no filtro de UF da lista de membros.</p>
              </Card>
            </div>
          </Section>
          <Section id="votos" title="Como a bancada votou nas pautas polêmicas" tip="Para cada pauta de grande repercussão (curadoria neutra), a votação nominal de mérito mais recente no plenário da Câmara. Compara o % de Sim entre os membros da frente e no plenário inteiro.">
            <VotosBancada membros={membros} />
          </Section>
          <Section id="membros" title={`Membros (${formatNumber(membros.length)})`} tip="Deputados federais que aderiram à frente. A Câmara não publica aqui os senadores das frentes mistas.">
            <GradeMembros membros={membros} />
          </Section>
        </>
      )}

      <Fontes className="mt-10" items={[
        { label: "Frente (API da Câmara)", href: fontes.camaraApi(pathFrente(id)) },
        { label: "Membros (API da Câmara)", href: fontes.camaraApi(pathMembros(id)) },
        { label: "Documento oficial (PDF)", href: doc },
        { label: "Emendas: Portal da Transparência", href: "https://portaldatransparencia.gov.br/emendas" },
      ]} />
    </>
  );
}

function Numeros({ membros }: { membros: MembroFrente[] }) {
  const autores = useAutores();
  const ranking = useApi<GastosRanking>(gastosPath.ranking());
  const em = useMemo(() => (autores.data ? somaEmendas(membros, autores.data.idx) : null), [membros, autores.data]);
  const gs = useMemo(() => (ranking.data ? somaGastos(membros, ranking.data) : null), [membros, ranking.data]);
  const partidos = composicao(membros, (m) => m.siglaPartido);
  const top = partidos[0];
  return (
    <StatGrid className="mb-2">
      <Stat label="Deputados membros" value={formatNumber(membros.length)} hint={`${formatPct(membros.length / 513)} das 513 cadeiras`} />
      <Stat label="Partidos representados" value={formatNumber(partidos.length)} hint={top ? <>Maior: <PartyBadge sigla={top.label} /> {top.value}</> : undefined} />
      <Stat label="Emendas pagas pelos membros" tip="Soma das emendas pagas (todos os anos da base do Portal da Transparência) dos membros encontrados por nome no Portal da Transparência."
        value={em ? <Money centavos={em.pago} compact /> : autores.isError ? "—" : "…"} hint={em ? `${em.encontrados} de ${em.total} membros encontrados` : undefined} />
      <Stat label="Cota parlamentar dos membros" tip="CEAP: soma do gasto dos membros na legislatura atual, segundo os dados abertos da Câmara."
        value={gs ? <Money centavos={gs.valor} compact /> : ranking.isError ? "—" : "…"} hint={gs ? `${gs.encontrados} de ${gs.total} membros com dados` : undefined} />
    </StatGrid>
  );
}

function VotosBancada({ membros }: { membros: MembroFrente[] }) {
  const ids = useMemo(() => new Set(membros.map((m) => m.id)), [membros]);
  const { itens, carregando } = useVotosPautas();
  const linhas = itens
    .filter((x) => x.votos)
    .map((x) => ({ ...x, bancada: votoGrupo(x.votos!, ids), plenario: votoGrupo(x.votos!) }))
    .sort((a, b) => b.votacao.dataHoraRegistro.localeCompare(a.votacao.dataHoraRegistro));
  const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
  return (
    <Card>
      {carregando && <Spinner label="Lendo votações nominais…" />}
      {!carregando && !linhas.length && <EmptyState title="Sem votações nominais disponíveis." />}
      <ul className="divide-y divide-line">
        {linhas.map((l) => (
          <li key={l.pauta.camaraId} className="grid gap-3 py-3 md:grid-cols-[1.4fr_1fr_auto] md:items-center">
            <span className="min-w-0">
              <span className="font-medium">{l.pauta.apelido}</span> <Badge>{l.pauta.tema}</Badge>
              <span className="block text-xs text-muted">
                {l.pauta.sigla} {l.pauta.numero}/{l.pauta.ano} · votação de {formatDate(l.votacao.data)} · <Link className="link" to={`/votacao/${l.votacao.id}`}>ver placar e cada voto</Link>
                {l.pauta.nota && <span className="mt-0.5 block">{l.pauta.nota}</span>}
              </span>
            </span>
            <BarraComparada bancada={l.bancada.pctSim} plenario={l.plenario.pctSim} />
            <span className="text-xs text-muted md:w-52">
              Membros: {l.bancada.sim} Sim · {l.bancada.nao} Não · {l.bancada.outros} outros · {l.bancada.ausentes} sem voto
              <span className="block">Coesão {pct(l.bancada.coesao)} <Tip content="Índice de Rice: |Sim − Não| ÷ (Sim + Não) entre os membros que votaram. 100% = todos votaram igual; 0% = divisão meio a meio. Não mede se o voto foi certo ou errado." /></span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">% de Sim = Sim ÷ (Sim + Não). Membros atuais da frente; quem não estava no mandato na data aparece como “sem voto”. Votações simbólicas não registram votos individuais.</p>
    </Card>
  );
}
