import { useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { CalendarClock, Landmark } from "lucide-react";
import {
  Badge, Bars, Card, EmptyState, ErrorState, ExternalLink, PageHeader, Section, Skeleton, Stat, StatGrid, Tip,
  formatDate, formatNumber, partyColor, useCamara,
} from "@/ui";
import { fontes, type Fonte, type VotacaoLista } from "@/features/legislativo/api";
import { useCamaraTodas, useSenado } from "@/features/legislativo/hooks";
import { Fontes, Segmentado } from "@/features/legislativo/components";
import { ShareButton } from "@/features/share";
import { AutoLink } from "@/features/links";
import { camOrg, distribuicao, mapVotacoesSenado, senCom, tipoCamara, type EventoCamara, type Membro, type OrgaoCamaraDetalhe } from "@/features/comissoes/api";
import { doCatalogo, oQueFaz, parseIdComissao, type CasaComissao, type ComissaoRef, type TipoComissao } from "@/features/comissoes/catalogo";
import { agoraBrasilia, hojeIso, somaDias, useAgendaSenado, useComissaoSenado, useMembrosCamara, usePautas } from "@/features/comissoes/hooks";
import { CardMembro, ROTULO_CASA, ROTULO_TIPO, dataHora } from "@/features/comissoes/ui";

export default function ComissaoPage() {
  const raw = useParams().id ?? "";
  const id = parseIdComissao(raw);
  if (!id) return <EmptyState title="Comissão não encontrada." hint={<Link className="link" to="/comissoes">Ver todas as comissões</Link>} />;
  return id.casa === "camara" ? <ComissaoCamara key={raw} id={id.id} /> : <ComissaoSenado key={raw} codigo={id.id} />;
}

// ---------- Câmara ----------
function ComissaoCamara({ id }: { id: number }) {
  const det = useCamara<OrgaoCamaraDetalhe>(camOrg.orgao(id));
  const membros = useMembrosCamara(id);
  const cat = doCatalogo({ casa: "camara", id });
  const d = det.data;
  if (det.isError) return <ErrorState error={det.error} retry={() => det.refetch()} />;
  const tipo: TipoComissao = cat?.tipo ?? (d ? tipoCamara(d.codTipoOrgao) : "permanente");
  return (
    <Pagina
      casa="camara" tipo={tipo} sigla={d?.sigla ?? cat?.sigla ?? ""} nome={d?.nome ?? cat?.nome ?? ""} cat={cat} url={`/comissao/camara-${id}`}
      site={d?.urlWebsite ?? null} local={d?.sala ?? null} instalacao={d?.dataInstalacao ?? null}
      membros={membros.data} carregandoMembros={membros.isPending}
      fontes={[{ label: "Órgão (API da Câmara)", href: fontes.camaraApi(camOrg.orgao(id)) }, { label: "Membros (API da Câmara)", href: fontes.camaraApi(`/orgaos/${id}/membros`) }]}
    >
      <AtividadeCamara id={id} />
    </Pagina>
  );
}

// ---------- Senado e mistas do Congresso ----------
function ComissaoSenado({ codigo }: { codigo: number }) {
  const c = useComissaoSenado(codigo);
  const cat = doCatalogo({ casa: "senado", id: codigo });
  const d = c.data;
  if (c.isError) return <ErrorState error={c.error} retry={() => c.refetch()} />;
  if (c.isSuccess && !d) return <EmptyState title="Comissão não encontrada no Senado." hint={<Link className="link" to="/comissoes">Ver todas as comissões</Link>} />;
  const casa: CasaComissao = d?.casa ?? cat?.casa ?? "senado";
  const membros = d ? [...d.membros, ...d.cargos.filter((k) => !d.membros.some((m) => m.href && m.href === k.href))] : undefined;
  return (
    <Pagina
      casa={casa} tipo={cat?.tipo ?? (casa === "cn" ? "mista" : "permanente")} sigla={d?.sigla ?? cat?.sigla ?? ""} nome={d?.nome ?? cat?.nome ?? ""} cat={cat}
      url={`/comissao/senado-${codigo}`} finalidade={d?.finalidade} local={d?.local ?? null} agendaFixa={d?.agendaFixa ?? null}
      membros={membros} carregandoMembros={c.isPending}
      fontes={[{ label: "Comissão (API do Senado)", href: fontes.senadoApi(senCom.comissao(codigo)) }, { label: "Página no Senado", href: `https://legis.senado.leg.br/comissoes/comissao?codcol=${codigo}` }]}
    >
      <AtividadeSenado codigo={codigo} sigla={d?.sigla ?? cat?.sigla ?? null} />
      {cat?.camaraId && <AtividadeCamara id={cat.camaraId} titulo="na Câmara" ocultarVazio />}
    </Pagina>
  );
}

// ---------- layout comum ----------
function Pagina({ casa, tipo, sigla, nome, cat, url, site, local, instalacao, agendaFixa, finalidade, membros, carregandoMembros, fontes: fs, children }: {
  casa: CasaComissao; tipo: TipoComissao; sigla: string; nome: string; cat: ComissaoRef | null; url: string; site?: string | null; local?: string | null;
  instalacao?: string | null; agendaFixa?: string | null; finalidade?: string | null; membros?: Membro[]; carregandoMembros: boolean; fontes: Fonte[]; children: ReactNode;
}) {
  const casaTexto: "camara" | "senado" = casa === "camara" ? "camara" : "senado";
  const resumo = nome ? oQueFaz({ sigla, nome }, casaTexto) : null;
  const pres = membros?.find((m) => m.cargo?.toLowerCase().startsWith("presidente"));
  const titulares = membros?.filter((m) => m.titular).length ?? 0;
  const dist = useMemo(() => distribuicao(membros ?? []), [membros]);
  return (
    <>
      <PageHeader
        eyebrow={<>{ROTULO_CASA[casa]} · {ROTULO_TIPO[tipo].replace(/s( |$)/, "$1").replace("Permanente", "Comissão permanente")}{sigla ? ` · ${sigla}` : ""}</>}
        title={nome || <Skeleton className="h-9 w-72" />}
        subtitle={resumo ? <AutoLink text={resumo} casa={casaTexto} /> : undefined}
        breadcrumbs={[{ label: "Início", to: "/" }, { label: "Comissões", to: casa === "senado" ? "/comissoes?tab=senado" : "/comissoes" }, { label: sigla || "…" }]}
        actions={nome ? <ShareButton fab kind="pagina" title={`${sigla} — ${nome}`} subtitle={resumo ?? undefined} url={url} /> : undefined}
      />

      {cat?.destaque && (
        <div className="card mb-6 flex gap-3 border-l-4 border-l-amarelo p-4 text-sm">
          <Landmark className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
          <div>
            <p><b>Por que importa para o seu bolso:</b> <AutoLink text={cat.destaque} /></p>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-semibold">
              <Link className="link" to="/entenda/o-que-e-emenda">Entenda como o dinheiro é mandado</Link>
              <Link className="link" to="/entenda/ciclo-do-dinheiro">Do Orçamento ao pagamento</Link>
              <Link className="link" to="/emendas">Ver o dinheiro que a comissão mandou</Link>
            </p>
          </div>
        </div>
      )}

      <StatGrid className="mb-6">
        <Stat label="Titulares" value={membros ? formatNumber(titulares) : "…"} tip="Membros com direito a voto. Suplentes votam na ausência de titulares do mesmo partido ou bloco." />
        <Stat label="Suplentes" value={membros ? formatNumber(membros.length - titulares) : "…"} />
        <Stat label="Partidos representados" value={membros ? formatNumber(dist.partidos.filter((p) => p.label !== "—").length) : "…"} />
        <Stat label="Presidência" value={pres ? <span className="text-base">{pres.nome}</span> : membros ? "—" : "…"} hint={pres ? `${pres.partido}-${pres.uf}` : undefined} />
      </StatGrid>

      {(finalidade || local || agendaFixa || instalacao || site) && (
        <Card className="mb-6" title="Sobre o colegiado">
          <dl className="grid gap-2 text-sm sm:grid-cols-[max-content_1fr] sm:gap-x-6">
            {finalidade && <><dt className="text-muted">Finalidade oficial</dt><dd><AutoLink text={finalidade} casa={casaTexto} /></dd></>}
            {instalacao && <><dt className="text-muted">Instalada em</dt><dd>{formatDate(instalacao)}</dd></>}
            {local && <><dt className="text-muted">Local das reuniões</dt><dd>{local}</dd></>}
            {agendaFixa && <><dt className="text-muted">Reuniões ordinárias</dt><dd>{agendaFixa}</dd></>}
            {site && <><dt className="text-muted">Site</dt><dd><ExternalLink href={site}>{site.replace(/^https?:\/\//, "")}</ExternalLink></dd></>}
          </dl>
        </Card>
      )}

      <Section title="Composição" tip="Membros atuais segundo a fonte oficial. As vagas são distribuídas proporcionalmente ao tamanho dos partidos e blocos.">
        <Composicao membros={membros} carregando={carregandoMembros} dist={dist} />
        <Fontes items={fs} />
      </Section>

      {children}
    </>
  );
}

function Composicao({ membros, carregando, dist }: { membros?: Membro[]; carregando: boolean; dist: ReturnType<typeof distribuicao> }) {
  const [f, setF] = useState<"todos" | "titulares" | "suplentes">("todos");
  const [todos, setTodos] = useState(false);
  if (carregando) return <Skeleton className="h-72" />;
  if (!membros?.length) return <EmptyState title="Composição não informada pela fonte." hint="Comissões recém-criadas podem ainda não ter membros indicados." />;
  const vis = membros.filter((m) => f === "todos" || (f === "titulares" ? m.titular : !m.titular));
  const lim = todos ? vis : vis.slice(0, 24);
  return (
    <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
      <Card>
        <div className="mb-3"><Segmentado label="Filtrar membros" value={f} onChange={setF} options={[{ value: "todos", label: `Todos (${membros.length})` }, { value: "titulares", label: "Titulares" }, { value: "suplentes", label: "Suplentes" }]} /></div>
        <ul className="grid gap-2 sm:grid-cols-2">{lim.map((m, i) => <CardMembro key={`${m.href ?? m.nome}-${i}`} m={m} />)}</ul>
        {vis.length > lim.length || todos ? (
          <button type="button" onClick={() => setTodos((x) => !x)} className="mt-3 rounded-xl border border-line px-3 py-1.5 text-sm font-medium hover:bg-surface-2">
            {todos ? "Mostrar menos" : `Mostrar todos (${vis.length})`}
          </button>
        ) : null}
      </Card>
      <div className="space-y-4">
        <Card title="Por partido" tip="Quantos membros (titulares e suplentes) cada partido tem no colegiado.">
          <Bars data={dist.partidos.map((p) => ({ ...p, color: partyColor(p.label), href: p.label !== "—" ? `/partido/${encodeURIComponent(p.label)}` : undefined }))} limit={14} />
        </Card>
        <Card title="Por estado">
          <Bars data={dist.ufs.map((u) => ({ ...u, href: u.label.length === 2 ? `/uf/${u.label}` : undefined }))} limit={10} />
        </Card>
      </div>
    </div>
  );
}

// ---------- atividade: Câmara ----------
function AtividadeCamara({ id, titulo, ocultarVazio }: { id: number; titulo?: string; ocultarVazio?: boolean }) {
  const h = hojeIso();
  const ev = useCamaraTodas<EventoCamara>(camOrg.eventos(id, somaDias(h, -60), somaDias(h, 45)), 30 * 60_000);
  const vots = useCamara<VotacaoLista[]>(camOrg.votacoes(id));
  const agora = agoraBrasilia();
  const eventos = ev.data ?? [];
  const futuros = eventos.filter((e) => e.dataHoraInicio >= agora.slice(0, 16) && !/cancelad/i.test(e.situacao)).sort((a, b) => a.dataHoraInicio.localeCompare(b.dataHoraInicio));
  const passados = eventos.filter((e) => e.dataHoraInicio < agora.slice(0, 16)).sort((a, b) => b.dataHoraInicio.localeCompare(a.dataHoraInicio));
  const comPauta = [...futuros.slice(0, 4), ...passados.filter((e) => /deliberativa/i.test(e.descricaoTipo)).slice(0, 3)];
  const pautas = usePautas(comPauta.map((e) => e.id));
  const pautaDe = new Map(comPauta.map((e, i) => [e.id, pautas[i]?.data ?? null]));
  const props = useMemo(() => {
    const m = new Map<number, { id: number; titulo: string; ementa: string; situacao: string | null; relator: string | null; quando: string }>();
    comPauta.forEach((e, i) => {
      for (const it of pautas[i]?.data ?? []) {
        const p = it.proposicaoRelacionada_ ?? it.proposicao_;
        if (!p || m.has(p.id)) continue;
        m.set(p.id, { id: p.id, titulo: it.titulo || `${p.siglaTipo} ${p.numero}/${p.ano}`, ementa: p.ementa, situacao: it.situacaoItem ?? null, relator: it.relator ? `${it.relator.nome} (${it.relator.siglaPartido}-${it.relator.siglaUf})` : null, quando: e.dataHoraInicio });
      }
    });
    return [...m.values()];
  }, [comPauta.map((e) => e.id).join(), pautas.map((p) => p.dataUpdatedAt).join()]);

  const sufixo = titulo ? ` ${titulo}` : "";
  const vazio = (pend: boolean, n: number) => ocultarVazio && !pend && n === 0;
  return (
    <>
      {!vazio(ev.isPending, futuros.length) && <Section title={`Próximas reuniões e pautas${sufixo}`} tip="Agenda oficial: reuniões convocadas nos próximos 45 dias, com os itens da pauta quando já publicados.">
        {ev.isPending ? <Skeleton className="h-40" /> : futuros.length ? (
          <ul className="grid gap-3 lg:grid-cols-2">
            {futuros.slice(0, 6).map((e) => <ReuniaoCamara key={e.id} e={e} pauta={pautaDe.get(e.id)} />)}
          </ul>
        ) : <EmptyState title="Nenhuma reunião convocada no momento." hint={passados[0] ? `Última reunião: ${dataHora(passados[0].dataHoraInicio)} (${passados[0].situacao.toLowerCase()}).` : undefined} />}
        <Fontes items={[{ label: "Eventos (API da Câmara)", href: fontes.camaraApi(`/orgaos/${id}/eventos`) }]} />
      </Section>}

      {!vazio(pautas.some((p) => p.isPending), props.length) && <Section title={`Proposições em análise${sufixo}`} tip="Itens que entraram nas pautas recentes e nas próximas reuniões deste colegiado.">
        {pautas.some((p) => p.isPending) && !props.length ? <Skeleton className="h-32" /> : props.length ? (
          <ul className="grid gap-2 md:grid-cols-2">
            {props.slice(0, 16).map((p) => (
              <li key={p.id} className="card p-3 text-sm">
                <p className="flex flex-wrap items-center gap-2"><Link className="link font-semibold" to={`/proposicao/${p.id}`}>{p.titulo}</Link>{p.situacao && <Badge>{p.situacao}</Badge>}</p>
                <p className="mt-1 line-clamp-3 text-muted"><AutoLink text={p.ementa} /></p>
                {p.relator && <p className="mt-1 text-xs text-muted">Relatoria: <AutoLink text={p.relator} /></p>}
              </li>
            ))}
          </ul>
        ) : <EmptyState title="Sem pautas publicadas no período." />}
      </Section>}

      {!vazio(vots.isPending, vots.data?.length ?? 0) && <Section title={`Votações recentes${sufixo}`}>
        <Card>
          {vots.isPending ? <Skeleton className="h-40" /> : vots.data?.length ? (
            <ul className="divide-y divide-line text-sm">
              {vots.data.slice(0, 12).map((v) => (
                <li key={v.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
                  <span className="w-24 shrink-0 tabular text-xs text-muted">{formatDate(v.data)}</span>
                  <Link className="link min-w-0 flex-1" to={`/votacao/${v.id}`}>{v.descricao}</Link>
                  {v.aprovacao === 1 ? <Badge tone="verde">aprovado</Badge> : v.aprovacao === 0 ? <Badge tone="vermelho">rejeitado</Badge> : null}
                </li>
              ))}
            </ul>
          ) : <EmptyState title="Nenhuma votação registrada." />}
          <Fontes items={[{ label: "Votações (API da Câmara)", href: fontes.camaraApi(`/orgaos/${id}/votacoes`) }]} />
        </Card>
      </Section>}
    </>
  );
}

function ReuniaoCamara({ e, pauta }: { e: EventoCamara; pauta: import("@/features/comissoes/api").ItemPautaCamara[] | null | undefined }) {
  return (
    <li className="card p-4 text-sm">
      <p className="flex flex-wrap items-center gap-2 font-semibold"><CalendarClock className="size-4 text-accent" aria-hidden />{dataHora(e.dataHoraInicio)}<Badge tone={/convocada|agendada/i.test(e.situacao) ? "verde" : "neutro"}>{e.situacao}</Badge></p>
      <p className="mt-1">{e.descricaoTipo}{e.localCamara?.nome ? <span className="text-muted"> · {e.localCamara.nome}</span> : null}</p>
      {e.descricao && <p className="mt-1 line-clamp-3 text-muted"><AutoLink text={e.descricao.trim()} /></p>}
      {pauta?.length ? (
        <ol className="mt-2 space-y-1 border-t border-line pt-2">
          {pauta.slice(0, 6).map((it) => {
            const p = it.proposicaoRelacionada_ ?? it.proposicao_;
            return <li key={it.ordem} className="flex gap-2"><span className="tabular text-xs text-muted">{it.ordem}.</span><span className="min-w-0">{p ? <Link className="link font-medium" to={`/proposicao/${p.id}`}>{it.titulo}</Link> : <b>{it.titulo}</b>}{p?.ementa ? <span className="text-muted"> — <span className="line-clamp-2 inline">{p.ementa}</span></span> : null}</span></li>;
          })}
          {pauta.length > 6 && <li className="text-xs text-muted">+ {pauta.length - 6} itens</li>}
        </ol>
      ) : null}
      <p className="mt-2 text-xs"><ExternalLink href={`https://www.camara.leg.br/evento-legislativo/${e.id}`}>Página do evento</ExternalLink></p>
    </li>
  );
}

// ---------- atividade: Senado ----------
function AtividadeSenado({ codigo, sigla }: { codigo: number; sigla: string | null }) {
  const ag = useAgendaSenado(60, 45);
  const h = hojeIso();
  const vs = useSenado(sigla ? senCom.votacoes(sigla, somaDias(h, -365), h) : null, mapVotacoesSenado);
  const agora = agoraBrasilia();
  const rs = (ag.data ?? []).filter((r) => r.colegiado === codigo);
  const futuras = rs.filter((r) => r.data >= agora && !/cancelad/i.test(r.situacao)).sort((a, b) => a.data.localeCompare(b.data));
  const passadas = rs.filter((r) => r.data < agora).sort((a, b) => b.data.localeCompare(a.data));
  const itens = [...new Set([...futuras, ...passadas.slice(0, 4)].flatMap((r) => r.itens))];
  return (
    <>
      <Section title="Próximas reuniões e pautas" tip="Agenda oficial das comissões do Senado e do Congresso.">
        {ag.isPending ? <Skeleton className="h-40" /> : futuras.length ? (
          <ul className="grid gap-3 lg:grid-cols-2">
            {futuras.slice(0, 6).map((r) => (
              <li key={r.codigo} className="card p-4 text-sm">
                <p className="flex flex-wrap items-center gap-2 font-semibold"><CalendarClock className="size-4 text-accent" aria-hidden />{dataHora(r.data)}<Badge tone="verde">{r.situacao}</Badge></p>
                <p className="mt-1">{r.titulo}{r.local ? <span className="text-muted"> · {r.local}</span> : null}</p>
                {r.finalidade && <p className="mt-1 line-clamp-3 text-muted"><AutoLink text={r.finalidade} casa="senado" /></p>}
                {r.itens.length > 0 && <p className="mt-2 border-t border-line pt-2">Pauta: <AutoLink text={r.itens.join(" · ")} casa="senado" /></p>}
              </li>
            ))}
          </ul>
        ) : <EmptyState title="Nenhuma reunião agendada no momento." hint={passadas[0] ? `Última reunião: ${dataHora(passadas[0].data)}.` : undefined} />}
        {itens.length > 0 && (
          <Card className="mt-4" title="Matérias em pauta (recentes e próximas)" tip="Identificação das matérias como publicada pelo Senado. Os links abrem a proposição correspondente na Câmara quando ela existe (mesma numeração desde 2019).">
            <p className="text-sm leading-relaxed"><AutoLink text={itens.join(" · ")} casa="senado" /></p>
          </Card>
        )}
        <Fontes items={[{ label: "Agenda das comissões (API do Senado)", href: fontes.senadoApi(senCom.agenda(somaDias(h, -60), somaDias(h, 45))) }]} />
      </Section>

      {sigla && (
        <Section title="Votações recentes" tip="Votações nominais registradas no colegiado nos últimos 12 meses.">
          <Card>
            {vs.isPending ? <Skeleton className="h-32" /> : vs.data?.length ? (
              <ul className="divide-y divide-line text-sm">
                {vs.data.slice().sort((a, b) => b.data.localeCompare(a.data)).slice(0, 12).map((v) => (
                  <li key={v.codigo} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
                    <span className="w-24 shrink-0 tabular text-xs text-muted">{formatDate(v.data)}</span>
                    <span className="min-w-0 flex-1"><AutoLink text={v.materia} casa="senado" className="font-medium" /> — {v.descricao}</span>
                    <span className="tabular text-xs text-muted">Sim {v.sim} · Não {v.nao}{v.abstencao ? ` · Abst. ${v.abstencao}` : ""}<Tip content="Placar nominal da votação na comissão." /></span>
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="Nenhuma votação nominal registrada nos últimos 12 meses." />}
            <Fontes items={[{ label: "Votações em comissão (API do Senado)", href: fontes.senadoApi(senCom.votacoes(sigla, somaDias(h, -365), h)) }]} />
          </Card>
        </Section>
      )}
    </>
  );
}
