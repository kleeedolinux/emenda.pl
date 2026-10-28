import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { useQueries } from "@tanstack/react-query";
import { Gavel, Landmark } from "lucide-react";
import {
  Badge, Card, DataTable, EmptyState, ErrorState, ExternalLink, KeyValue, PageHeader, Section, Skeleton, Spinner, Term, Timeline,
  fetchJson, formatDate, useCamara, type Tone,
} from "@/ui";
import {
  cam, fontes, sen, type Autor, type ProcessoSenado, type ProposicaoDetalhe, type ProposicaoLista, type Tema, type Tramitacao,
  type VotacaoLista, type VotacaoSenado,
} from "@/features/legislativo/api";
import { useSenado } from "@/features/legislativo/hooks";
import { desfecho, linksNorma, normaDaTramitacao, type Desfecho } from "@/features/legislativo/normas";
import { pautaPorCamaraId } from "@/features/legislativo/pautas";
import { placarDaDescricao, votosSenado, type Orientacao, type VotoCamara } from "@/features/legislativo/votacao";
import { VotacaoInterativa } from "@/features/legislativo/VotacaoInterativa";
import { Campo, Fontes, Parlamentar, selectCls } from "@/features/legislativo/components";
import { ShareButton } from "@/features/share";
import { AutoLink, OrgaoLink } from "@/features/links";
import { pdfProposicao } from "@/lib/cdn";

const TOM: Record<Desfecho["tipo"], Tone> = { lei: "verde", vetada: "vermelho", rejeitada: "vermelho", arquivada: "neutro", tramitando: "amarelo" };
const idDeputado = (uri: string) => /\/deputados\/(\d+)/.exec(uri)?.[1];

export default function ProposicaoPage() {
  const id = Number(useParams().id);
  const valido = Number.isInteger(id) && id > 0;
  const q = useCamara<ProposicaoDetalhe>(valido ? cam.proposicao(id) : null);
  const autores = useCamara<Autor[]>(valido ? cam.autores(id) : null);
  const tram = useCamara<Tramitacao[]>(valido ? cam.tramitacoes(id) : null);
  const temas = useCamara<Tema[]>(valido ? cam.temas(id) : null);
  const rel = useCamara<ProposicaoLista[]>(valido ? cam.relacionadas(id) : null);
  const vots = useCamara<VotacaoLista[]>(valido ? cam.votacoesProposicao(id) : null);
  const pauta = valido ? pautaPorCamaraId(id) : null;
  const p = q.data;

  // Senado: mesma numeração a partir de 2019 (ou referência curada para as antigas).
  const ref = pauta?.senado ?? (p && p.ano >= 2019 ? { sigla: p.siglaTipo, numero: p.numero, ano: p.ano } : null);
  const sProcs = useSenado<ProcessoSenado[]>(ref ? sen.processoBusca(ref.sigla, ref.numero, ref.ano) : null);
  const procs = sProcs.data ?? [];
  const principal = procs.find((x) => x.normaGerada) ?? procs[0] ?? null;
  const sVots = useQueries({
    queries: procs.slice(0, 4).map((x) => ({
      queryKey: ["senado", sen.votacoesProcesso(x.id)],
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchJson<VotacaoSenado[]>(`/api/senado${sen.votacoesProcesso(x.id)}`, signal),
      staleTime: 30 * 60_000,
    })),
  });
  const votacoesSenado = useMemo(
    () => sVots.flatMap((r) => r.data ?? []).filter((v) => v.votos?.length).sort((a, b) => b.dataSessao.localeCompare(a.dataSessao)),
    [sVots],
  );

  const nt = useMemo(() => normaDaTramitacao(tram.data ?? []), [tram.data]);
  const des = p ? desfecho({ situacaoCamara: p.statusProposicao.descricaoSituacao, situacaoSenado: principal?.situacaoAtual, normaGerada: principal?.normaGerada, norma: nt.norma, veto: nt.veto }) : null;

  if (!valido) return <EmptyState title="Identificador de proposição inválido." />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;

  const titulo = p ? `${p.siglaTipo} ${p.numero}/${p.ano}` : "";
  return (
    <>
      <PageHeader
        eyebrow={p ? <><Term k={p.siglaTipo}>{p.siglaTipo}</Term> · {p.descricaoTipo}</> : "Proposição"}
        title={p ? <>{titulo}{pauta ? <span className="block text-xl font-semibold text-muted">{pauta.apelido}</span> : null}</> : <Skeleton className="h-9 w-48" />}
        subtitle={p ? <AutoLink text={p.ementa} /> : undefined}
        breadcrumbs={[{ label: "Início", to: "/" }, { label: "Proposições", to: "/proposicoes" }, { label: titulo || String(id) }]}
        actions={<>{des && <Badge tone={TOM[des.tipo]}>{des.rotulo}{des.veto ? ` (veto ${des.veto})` : ""}</Badge>}{p && <ShareButton fab kind="proposicao" title={pauta ? `${titulo} — ${pauta.apelido}` : titulo} subtitle={p.ementa} url={`/proposicao/${id}`} ogId={String(id)} />}</>}
      />

      {pauta && (
        <div className="card mb-6 border-l-4 border-l-amarelo p-4 text-sm">
          <p><b>Em poucas palavras:</b> {pauta.resumo}</p>
          {pauta.nota && <p className="mt-1 text-muted">{pauta.nota}</p>}
        </div>
      )}

      {q.isPending ? <Skeleton className="h-60" /> : p && des && (
        <div className="mb-6 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
          <CardDesfecho d={des} vetoDerrubado={nt.vetoDerrubado} p={p} senado={principal} carregandoSenado={sProcs.isPending && !!ref} />
          <Card title="Dados da proposição" tip="tramitação">
            <KeyValue items={[
              ["Apresentada em", formatDate(p.dataApresentacao)],
              ["Situação na Câmara", p.statusProposicao.descricaoSituacao],
              ["Onde está", <><OrgaoLink sigla={p.statusProposicao.siglaOrgao} /> · {formatDate(p.statusProposicao.dataHora)}</>],
              ["Regime", p.statusProposicao.regime, "regime de urgência"],
              ["Apreciação", p.statusProposicao.apreciacao, "Plenário: todos os deputados votam. Conclusiva: basta a aprovação nas comissões, salvo recurso."],
              ["Último despacho", <span className="line-clamp-4"><AutoLink text={p.statusProposicao.despacho} /></span>],
              ["Temas", temas.data?.length ? <span className="flex flex-wrap gap-1">{temas.data.map((t) => <Badge key={t.codTema}>{t.tema}</Badge>)}</span> : null],
              ["Inteiro teor", p.urlInteiroTeor ? <ExternalLink href={pdfProposicao(p.id) ?? p.urlInteiroTeor}>texto original (PDF)</ExternalLink> : null],
            ]} />
            <Fontes items={fontes.proposicao(id)} />
          </Card>
        </div>
      )}

      {p && (p.ementaDetalhada || p.keywords) && (
        <Card title="Explicação e palavras-chave" className="mb-6">
          {p.ementaDetalhada && <p className="mb-3 text-sm"><AutoLink text={p.ementaDetalhada} /></p>}
          {p.keywords && <ul className="flex flex-wrap gap-1.5">{p.keywords.split(/[,;]/).map((k) => k.replace(/^[\s_.]+|[\s.]+$/g, "")).filter(Boolean).map((k) => <li key={k}><Badge>{k}</Badge></li>)}</ul>}
        </Card>
      )}

      <Section title="Autoria">
        <Card>
          {autores.isPending ? <Skeleton className="h-16" /> : autores.data?.length ? (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {autores.data.slice().sort((a, b) => a.ordemAssinatura - b.ordemAssinatura).map((a) => {
                const dep = idDeputado(a.uri);
                return (
                  <li key={`${a.uri}-${a.nome}`} className="flex items-center gap-2">
                    <Parlamentar nome={a.nome} foto={dep ? `https://www.camara.leg.br/internet/deputado/bandep/${dep}.jpg` : undefined} to={dep ? `/deputado/${dep}` : undefined} />
                    <span className="text-xs text-muted">{a.tipo}{a.proponente ? " · proponente" : ""}</span>
                  </li>
                );
              })}
            </ul>
          ) : <EmptyState title="Autoria não informada." />}
          <Fontes items={[{ label: "Autores (API da Câmara)", href: fontes.camaraApi(cam.autores(id)) }]} />
        </Card>
      </Section>

      <Section title="Como votaram: Câmara e Senado" tip="votação nominal">
        <VotosDuasCasas camara={vots.data ?? []} carregandoCamara={vots.isPending} senado={votacoesSenado} carregandoSenado={!!ref && (sProcs.isPending || sVots.some((s) => s.isPending))} semRefSenado={!ref} />
      </Section>

      <Section title="Todas as votações na Câmara">
        <Card>
          {vots.isPending ? <Skeleton className="h-40" /> : (
            <DataTable rows={vots.data ?? []} rowKey={(r) => r.id} exportName={`votacoes-${id}`} search={(r) => r.descricao} empty="Nenhuma votação registrada."
              initialSort={{ key: "dataHoraRegistro", dir: "desc" }}
              columns={[
                { key: "dataHoraRegistro", header: "Data", sort: true, cell: (r) => formatDate(r.data) },
                { key: "siglaOrgao", header: "Onde", sort: true, cell: (r) => <OrgaoLink sigla={r.siglaOrgao} /> },
                { key: "descricao", header: "Resultado", cell: (r) => <Link className="link" to={`/votacao/${r.id}`}>{r.descricao}</Link> },
                { key: "nominal", header: "Nominal?", sort: (r) => (placarDaDescricao(r.descricao) ? 1 : 0), cell: (r) => (placarDaDescricao(r.descricao) ? <Badge tone="azul">sim</Badge> : "simbólica"), tip: "votação nominal" },
              ]} />
          )}
          <Fontes items={[{ label: "Votações (API da Câmara)", href: fontes.camaraApi(cam.votacoesProposicao(id)) }]} />
        </Card>
      </Section>

      <Section title="Tramitação" tip="tramitação">
        <Card><Tramitacoes itens={tram.data} carregando={tram.isPending} /><Fontes items={[{ label: "Tramitações (API da Câmara)", href: fontes.camaraApi(cam.tramitacoes(id)) }, fontes.proposicao(id)[1]!]} /></Card>
      </Section>

      {rel.data && rel.data.length > 0 && (
        <Section title="Proposições relacionadas" tip="Pareceres, requerimentos, emendas e projetos apensados ligados a esta proposição.">
          <Card>
            <DataTable rows={rel.data} rowKey={(r) => r.id} exportName={`relacionadas-${id}`} search={(r) => `${r.siglaTipo} ${r.numero} ${r.ementa}`}
              columns={[
                { key: "siglaTipo", header: "Tipo", sort: true, cell: (r) => <Badge>{r.siglaTipo}</Badge> },
                { key: "numero", header: "Nº/Ano", sort: (r) => r.ano * 1e6 + Number(r.numero), cell: (r) => <Link className="link" to={`/proposicao/${r.id}`}>{r.numero}/{r.ano}</Link> },
                { key: "ementa", header: "Ementa", cell: (r) => <AutoLink className="line-clamp-2" text={r.ementa} /> },
                { key: "dataApresentacao", header: "Data", sort: true, cell: (r) => formatDate(r.dataApresentacao) },
              ]} />
            <Fontes items={[{ label: "Relacionadas (API da Câmara)", href: fontes.camaraApi(cam.relacionadas(id)) }]} />
          </Card>
        </Section>
      )}
    </>
  );
}

function CardDesfecho({ d, vetoDerrubado, p, senado, carregandoSenado }: { d: Desfecho; vetoDerrubado: boolean; p: ProposicaoDetalhe; senado: ProcessoSenado | null; carregandoSenado: boolean }) {
  const l = d.norma ? linksNorma(d.norma) : null;
  return (
    <Card title="Desfecho" tip="Resultado final da proposição, juntando o que dizem a Câmara e o Senado.">
      <div className="space-y-3 text-sm">
        <p className="flex items-center gap-2 text-lg font-bold"><Gavel className="size-5 text-accent" aria-hidden />{d.rotulo}</p>
        {d.norma ? (
          <KeyValue items={[
            ["Norma", <b>{d.norma.rotulo} nº {d.norma.numero.toLocaleString("pt-BR")}</b>],
            [d.promulgadaCongresso ? "Promulgada em" : "Sancionada em", formatDate(d.norma.data)],
            [d.promulgadaCongresso ? "Quem promulgou" : "Presidente da República",
              d.promulgadaCongresso ? "Congresso Nacional (emendas constitucionais e decretos legislativos não passam por sanção)"
                : d.presidente ? `${d.presidente.nome}${d.presidente.interino ? " (interino)" : ""}` : "—",
              "Sanção: o presidente assina a lei aprovada pelo Congresso. Veto: recusa total ou de trechos; o Congresso pode derrubar o veto."],
            ["Veto", d.veto ? <>{d.veto === "parcial" ? "Parcial (trechos vetados)" : "Total"}{vetoDerrubado ? <Badge tone="amarelo" className="ml-2">veto derrubado pelo Congresso (ao menos em parte)</Badge> : null}</> : "Sem veto registrado"],
            ["Texto da norma", l && (
              <span className="flex flex-wrap gap-3">
                {l.planalto && <ExternalLink href={l.planalto}>Planalto</ExternalLink>}
                <ExternalLink href={l.normas}>normas.leg.br</ExternalLink>
                <ExternalLink href={l.lexml}>LexML</ExternalLink>
              </span>
            )],
          ]} />
        ) : (
          <p className="text-muted">Situação na Câmara: <b className="text-fg">{p.statusProposicao.descricaoSituacao ?? "—"}</b>{senado?.situacaoAtual ? <> · no Senado: <b className="text-fg">{senado.situacaoAtual.toLowerCase()}</b></> : null}.</p>
        )}
        <div className="flex items-start gap-2 rounded-xl bg-surface-2 p-3">
          <Landmark className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          {carregandoSenado ? <Spinner label="Procurando no Senado…" /> : senado ? (
            <p>No Senado: <ExternalLink href={fontes.materiaSenado(senado.codigoMateria)[0]!.href}>{senado.identificacao}</ExternalLink>
              {senado.situacaoAtual ? ` · ${senado.situacaoAtual.toLowerCase()}` : ""}{senado.dataSituacaoAtual ? ` (${formatDate(senado.dataSituacaoAtual)})` : ""}
              {senado.urlDocumento && <> · <ExternalLink href={senado.urlDocumento}>documento</ExternalLink></>}</p>
          ) : <p className="text-muted">Sem matéria correspondente localizada no Senado{p.ano < 2019 ? " (antes de 2019 as Casas usavam numerações diferentes)" : ""}.</p>}
        </div>
      </div>
    </Card>
  );
}

function VotosDuasCasas({ camara, carregandoCamara, senado, carregandoSenado, semRefSenado }: {
  camara: VotacaoLista[]; carregandoCamara: boolean; senado: VotacaoSenado[]; carregandoSenado: boolean; semRefSenado: boolean;
}) {
  const nominais = useMemo(() => camara.filter((v) => placarDaDescricao(v.descricao)).sort((a, b) => b.dataHoraRegistro.localeCompare(a.dataHoraRegistro)), [camara]);
  const [ci, setCi] = useState(0);
  const [si, setSi] = useState(0);
  const cv = nominais[Math.min(ci, nominais.length - 1)];
  const cvotos = useCamara<VotoCamara[]>(cv ? cam.votos(cv.id) : null);
  const cori = useCamara<Orientacao[]>(cv ? cam.orientacoes(cv.id) : null);
  const sv = senado[Math.min(si, senado.length - 1)];
  const svotos = useMemo(() => (sv?.votos ? votosSenado(sv.votos) : []), [sv]);

  return (
    <>
      <div className="space-y-4">
        <Card title="Câmara dos Deputados" tip="Até 513 cadeiras. Cinza = sem voto registrado (ausente, licença ou vaga).">
          {carregandoCamara ? <Skeleton className="h-64" /> : !cv ? <EmptyState title="Sem votação nominal na Câmara." hint="Pode ter sido aprovada em votação simbólica ou de forma conclusiva nas comissões." /> : (
            <>
              <Campo label="Votação">
                <select className={selectCls} value={ci} onChange={(e) => setCi(Number(e.target.value))}>
                  {nominais.map((v, k) => <option key={v.id} value={k}>{formatDate(v.data)} — {v.descricao.slice(0, 90)}</option>)}
                </select>
              </Campo>
              <div className="mt-3">{cvotos.isPending ? <Skeleton className="h-56" /> : cvotos.data && <VotacaoInterativa votos={cvotos.data} orientacoes={cori.data ?? []} cadeiras={513} perfil={(i) => `/deputado/${i}`} quem="deputado(a)" />}</div>
              <Link className="link mt-2 inline-block text-sm" to={`/votacao/${cv.id}`}>Análise completa desta votação (partidos, estados, orientação) →</Link>
              <Fontes items={fontes.votacao(cv.id).slice(0, 2)} />
            </>
          )}
        </Card>
        <Card title="Senado Federal" tip="81 cadeiras. Siglas do Senado como AP (ausência autorizada) e P-NRV (presente sem voto) aparecem em “Outros”.">
          {carregandoSenado ? <Skeleton className="h-64" /> : !sv ? (
            <EmptyState title="Sem votação nominal no Senado." hint={semRefSenado ? "Não foi possível localizar a matéria correspondente no Senado." : "A matéria pode ter sido votada de forma simbólica, só nas comissões, ou ainda não chegou ao Senado."} />
          ) : (
            <>
              <Campo label="Votação">
                <select className={selectCls} value={si} onChange={(e) => setSi(Number(e.target.value))}>
                  {senado.map((v, k) => <option key={v.codigoSessaoVotacao} value={k}>{formatDate(v.dataSessao)} — {v.descricaoVotacao.slice(0, 90)}</option>)}
                </select>
              </Campo>
              <p className="mt-2 text-sm">Resultado: {sv.resultadoVotacao === "A" ? <Badge tone="verde">Aprovado</Badge> : sv.resultadoVotacao === "R" ? <Badge tone="vermelho">Rejeitado</Badge> : sv.resultadoVotacao ?? "—"}</p>
              <div className="mt-3"><VotacaoInterativa votos={svotos} cadeiras={81} perfil={(i) => `/senador/${i}`} quem="senador(a)" /></div>
              <Fontes items={[{ label: "Votação (API do Senado)", href: fontes.senadoApi(sen.votacoesProcesso(sv.idProcesso)) }, ...fontes.materiaSenado(sv.codigoMateria)]} />
            </>
          )}
        </Card>
      </div>
    </>
  );
}

function Tramitacoes({ itens, carregando }: { itens?: Tramitacao[]; carregando: boolean }) {
  const [todas, setTodas] = useState(false);
  if (carregando) return <Skeleton className="h-40" />;
  const s = (itens ?? []).slice().sort((a, b) => b.dataHora.localeCompare(a.dataHora) || b.sequencia - a.sequencia);
  if (!s.length) return <EmptyState title="Sem tramitações." />;
  const vis = todas ? s : s.slice(0, 15);
  return (
    <>
      <Timeline items={vis.map((t) => ({
        date: <>{formatDate(t.dataHora)} · <OrgaoLink sigla={t.siglaOrgao} uri={t.uriOrgao} /></>,
        title: t.descricaoTramitacao,
        desc: t.despacho ? <AutoLink text={t.despacho} /> : undefined,
        href: t.url ?? undefined,
      }))} />
      {s.length > 15 && (
        <button type="button" onClick={() => setTodas((x) => !x)} className="mt-3 rounded-xl border border-line px-3 py-1.5 text-sm font-medium hover:bg-surface-2">
          {todas ? "Mostrar só as 15 mais recentes" : `Mostrar todas (${s.length})`}
        </button>
      )}
    </>
  );
}

