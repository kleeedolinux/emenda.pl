import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { UFS, type SiglaUf } from "@emenda/contracts";
import {
  Avatar, Badge, Card, DataTable, EmptyState, ErrorState, ExternalLink, KeyValue, PageHeader, PartyBadge, Skeleton,
  Stat, StatGrid, Tabs, Term, Timeline, VoteBadge, formatDate, formatNumber, type Column,
} from "@/ui";
import { arr, encontrarAutor, fontes, mapSenadorDetalhe, sen, type ProcessoSenado, type SenadorDetalhe, type VotacaoSenado } from "@/features/legislativo/api";
import { useAutores, useSenado } from "@/features/legislativo/hooks";
import { dentro, hojeISO, periodosSenado, type MandatoSenadoRaw, type Periodo } from "@/features/legislativo/mandatos";
import { ChipsMandato, Fontes, PainelMandatos, SeletorMandato, resumoMandatos } from "@/features/legislativo/components";
import { AutoLink } from "@/features/links";
import { EmendasAutor } from "@/features/legislativo/EmendasAutor";
import { categoriaVoto } from "@/features/legislativo/votacao";
import { ShareButton } from "@/features/share";
import { GastosParlamentar, GastosResumo, useGastosParlamentar } from "@/features/gastos";
import { totalCota } from "@/features/gastos/gastos";
import { ModoDetalhado, cabecalhoPolitico } from "@/features/linguagem";
import { formatBRL } from "@/lib/format";
import { FileText, HandCoins, Repeat, Vote, Wallet } from "lucide-react";
import { useAutor } from "@/features/legislativo/hooks";
import type { Mandato } from "@/features/legislativo/mandatos";
import { contarSim, perfilEmendas, resumoSimples, trocasSenado } from "@/features/perfil/resumo";
import { BlocoEmendas, ResumoSimplesCard, SecaoLeiga, TilesPerfil } from "@/features/perfil/CardsPerfil";
import { CardPautas, pautasSenador } from "@/features/perfil/Pautas";
import { CardTrocas } from "@/features/perfil/Trocas";

type MandatoComPartidos = MandatoSenadoRaw & { Partidos?: { Partido?: unknown } };
interface Filiacao { Sigla: string; Nome: string; DataFiliacao?: string; DataDesfiliacao?: string }
interface ComissaoRaw { IdentificacaoComissao: { CodigoComissao: string; SiglaComissao: string; NomeComissao: string; SiglaCasaComissao: string }; DescricaoParticipacao: string; DataInicio: string; DataFim?: string }

const mapMandatos = (j: { MandatoParlamentar?: { Parlamentar?: { Mandatos?: { Mandato?: MandatoComPartidos | MandatoComPartidos[] } } } }) =>
  arr(j.MandatoParlamentar?.Parlamentar?.Mandatos?.Mandato);
const mapComissoes = (j: { MembroComissaoParlamentar?: { Parlamentar?: { MembroComissoes?: { Comissao?: ComissaoRaw | ComissaoRaw[] } } } }) =>
  arr(j.MembroComissaoParlamentar?.Parlamentar?.MembroComissoes?.Comissao);

export default function SenadorPage() {
  const cod = useParams().id ?? "";
  const valido = /^\d+$/.test(cod);
  const [sp, setSp] = useSearchParams();
  const sel = sp.get("mandato");
  const setSel = (c: string | null) => setSp((p) => { const n = new URLSearchParams(p); if (c) n.set("mandato", c); else n.delete("mandato"); return n; }, { replace: true });

  const det = useSenado<SenadorDetalhe | null>(valido ? sen.senador(cod) : null, mapSenadorDetalhe);
  const mraw = useSenado<MandatoComPartidos[]>(valido ? sen.mandatos(cod) : null, mapMandatos);
  const autores = useAutores();
  const mandatos = useMemo(() => periodosSenado(mraw.data ?? []), [mraw.data]);
  const resumo = resumoMandatos(mandatos);
  const m = mandatos.find((x) => x.codigo === sel) ?? null;
  const janela: Periodo | null = m ? { inicio: m.inicio, fim: m.fim } : mandatos.length ? { inicio: mandatos[0]!.inicio, fim: mandatos[mandatos.length - 1]!.fim } : null;
  const s = det.data;
  const autor = s && autores.data ? encontrarAutor(autores.data.idx, [s.nome, s.nomeCompleto]) : null;
  const filiacoes = useMemo(() => {
    const vistos = new Set<string>();
    return (mraw.data ?? []).flatMap((x) => arr(x.Partidos?.Partido as Filiacao | Filiacao[])).filter((p) => {
      const k = `${p.Sigla}${p.DataFiliacao}`; if (vistos.has(k)) return false; vistos.add(k); return true;
    }).sort((a, b) => (b.DataFiliacao ?? "").localeCompare(a.DataFiliacao ?? ""));
  }, [mraw.data]);

  if (!valido) return <EmptyState title="Código de senador inválido." />;
  if (det.isError) return <ErrorState error={det.error} retry={() => det.refetch()} />;
  if (det.data === null) return <EmptyState title="Senador(a) não encontrado(a) na API do Senado." />;

  const nome = s?.nome ?? "Senador(a)";
  return (
    <>
      <PageHeader
        eyebrow={<>Senador(a){s ? ` · ${UFS[s.uf as SiglaUf] ?? s.uf}` : ""} <Term k="senador">o que faz?</Term></>}
        title={s ? nome : <Skeleton className="h-9 w-64" />}
        subtitle={cabecalhoPolitico(nome, "senador").subtitulo}
        media={<Avatar src={s?.foto} name={nome} size="xl" />}
        breadcrumbs={[{ label: "Início", to: "/" }, { label: "Senadores", to: "/senadores" }, { label: nome }]}
        actions={s && (
          <div className="flex flex-col items-end gap-2">
            <span className="flex items-center gap-2"><PartyBadge sigla={s.partido} /><Link className="link text-sm" to={`/uf/${s.uf}`}>{UFS[s.uf as SiglaUf] ?? s.uf}</Link></span>
            <ShareButton fab kind="senador" title={nome} subtitle={`${s.partido}-${s.uf}`} url={`/senador/${cod}`} ogId={cod} metric={autor ? { value: autor.pago, format: "brl", label: "pagas" } : undefined} />
            {mandatos.length > 0 && <ChipsMandato {...resumo} />}
          </div>
        )}
      />

      {s && (
        <PerfilLeigoSenador cod={cod} s={s} mandatos={mandatos} autorCodigo={autor?.codigo} semAutor={!!autores.data && !autor} filiacoes={filiacoes} />
      )}

      <ModoDetalhado id="detalhes" titulo="Ver tudo: mandatos, votações, projetos, comissões e dados oficiais">

      {s && (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <Card title="Dados públicos">
            <KeyValue items={[
              ["Nome parlamentar", s.nome], ["Nome civil", s.nomeCompleto],
              ["Nascimento", s.nascimento ? `${formatDate(s.nascimento)}${s.naturalidade ? ` · ${s.naturalidade}` : ""}` : null],
              ["E-mail", s.email ? <a className="link" href={`mailto:${s.email}`}>{s.email}</a> : null],
              ["Gabinete", s.endereco], ["Telefones", s.telefones.join(" · ") || null],
              ["Página oficial", s.pagina ? <ExternalLink href={s.pagina}>senado.leg.br</ExternalLink> : null],
            ]} />
            <Fontes items={fontes.senador(cod)} />
          </Card>
          <Card title="Filiações partidárias" tip="Partidos aos quais esteve filiado(a) durante os mandatos, segundo o Senado.">
            {filiacoes.length ? (
              <Timeline items={filiacoes.map((p) => ({ date: p.DataFiliacao ? formatDate(p.DataFiliacao) : "—", title: `${p.Sigla} — ${p.Nome}`, desc: p.DataDesfiliacao ? `Saiu em ${formatDate(p.DataDesfiliacao)}` : undefined }))} />
            ) : <EmptyState title="Sem filiações registradas." />}
          </Card>
        </div>
      )}

      <div className="mb-6">
        {mraw.isPending ? <Skeleton className="h-32" /> : mraw.isError ? <ErrorState error={mraw.error} retry={() => mraw.refetch()} /> : (
          <PainelMandatos mandatos={mandatos} sel={sel} onSel={setSel} fonte={<Fontes items={[{ label: "Mandatos (API do Senado)", href: fontes.senadoApi(sen.mandatos(cod)) }]} />} />
        )}
      </div>
      {mandatos.length > 1 && <div className="mb-4"><p className="mb-2 text-sm font-semibold">Feitos por mandato</p><SeletorMandato mandatos={mandatos} value={sel} onChange={setSel} /></div>}

      {janela && s && (
        <Tabs tabs={[
          { id: "votacoes", label: "Votações", content: <Votacoes cod={cod} janela={janela} /> },
          { id: "autorias", label: "Autorias", content: <Autorias cod={cod} janela={janela} /> },
          { id: "emendas", label: "Emendas", content: <EmendasAutor autorCodigo={autor?.codigo} carregando={autores.isPending} janela={m ? janela : null} nomes={[s.nome, s.nomeCompleto]} /> },
          { id: "comissoes", label: "Comissões", content: <Comissoes cod={cod} janela={m ? janela : null} /> },
          { id: "gastos", label: "Gastos e pessoal", content: <GastosParlamentar kind="senador" id={cod} /> },
        ]} />
      )}
      </ModoDetalhado>
    </>
  );
}

/** Topo "para leigos" do senador. */
function PerfilLeigoSenador({ cod, s, mandatos, autorCodigo, semAutor, filiacoes }: {
  cod: string; s: SenadorDetalhe; mandatos: Mandato[]; autorCodigo?: string; semAutor: boolean; filiacoes: Filiacao[];
}) {
  const r = resumoMandatos(mandatos);
  const desde = mandatos[0]?.inicio ?? null;
  const hoje = hojeISO();
  const fim = mandatos.length ? (mandatos[mandatos.length - 1]!.fim < hoje ? mandatos[mandatos.length - 1]!.fim : hoje) : hoje;
  const autor = useAutor(autorCodigo);
  const vot = useSenado<VotacaoSenado[]>(desde ? sen.votacoes(cod, desde, fim) : null);
  const aut = useSenado<ProcessoSenado[]>(sen.autorias(cod));
  const votos = useMemo(() => contarSim((vot.data ?? []).map((v) => v.votos?.[0]?.siglaVotoParlamentar)), [vot.data]);
  const pautas = useMemo(() => pautasSenador(vot.data ?? []), [vot.data]);
  const trocas = useMemo(() => trocasSenado(filiacoes), [filiacoes]);
  const frases = resumoSimples({
    nome: s.nome, sexo: s.sexo, cargo: "senador", partido: s.partido, uf: s.uf, desde, nMandatos: r.n, tempo: r.tempo, atual: r.atual,
    emendas: autor.data ? perfilEmendas(autor.data.emendas) : semAutor ? { pago: 0, pctPix: 0, funcao: null, municipios: 0 } : null,
    proposicoes: aut.data ? aut.data.length : null,
    votos: vot.data ? { ...votos, fonte: "nominais" } : null,
  });
  const gastos = useGastosParlamentar("senador", cod);
  const pe = autor.data ? perfilEmendas(autor.data.emendas) : null;
  const gk = gastos.data ? totalCota(gastos.data) : null;
  const vp = contarSim(pautas.map((x) => x.voto));
  const t = <span className="inline-block h-8 w-20 animate-pulse rounded bg-surface-2" />;
  return (
    <>
      <ResumoSimplesCard frases={frases} carregando={(autor.isPending && !!autorCodigo) || vot.isPending} />
      <TilesPerfil itens={[
        { href: "#dinheiro", icon: <HandCoins className="size-4" aria-hidden />, rotulo: "Dinheiro que mandou", valor: pe ? formatBRL(pe.pago, true) : semAutor ? "R$ 0" : t, sub: pe ? `para ${formatNumber(pe.municipios)} cidades` : undefined },
        { href: "#gastos", icon: <Wallet className="size-4" aria-hidden />, rotulo: "Gastos da cota", valor: gk ? formatBRL(gk.total, true) : gastos.isError ? "—" : t, sub: gk?.mediaMensal ? `${formatBRL(gk.mediaMensal, true)} por mês` : "no mandato" },
        { href: "#votos", icon: <Vote className="size-4" aria-hidden />, rotulo: "Como votou", valor: vot.isPending ? t : vp.total ? `${vp.sim} Sim` : "—", sub: vot.isPending ? undefined : vp.total ? `em ${vp.total} votações polêmicas` : "sem voto registrado nas polêmicas" },
        { href: "#detalhes", icon: <FileText className="size-4" aria-hidden />, rotulo: "Projetos", valor: aut.data ? formatNumber(aut.data.length) : t, sub: "apresentados" },
      ]} />
      <SecaoLeiga id="dinheiro" icon={<HandCoins className="size-5" aria-hidden />} titulo="Dinheiro que mandou para cidades e estados"
        significa="Parte do Orçamento federal que o senador escolhe para onde vai (emendas parlamentares).">
        <BlocoEmendas autor={autor.data} carregando={autor.isPending} semCorrespondencia={semAutor} />
      </SecaoLeiga>
      <SecaoLeiga id="votos" icon={<Vote className="size-5" aria-hidden />} titulo="Como votou no que mais deu o que falar"
        significa="AP, NCom e LS querem dizer ausência ou licença, não voto contra.">
        <CardPautas itens={pautas} carregando={vot.isPending} titulo={null} />
      </SecaoLeiga>
      <SecaoLeiga id="gastos" icon={<Wallet className="size-5" aria-hidden />} titulo="Quanto gasta para trabalhar"
        significa="Cota para passagens, combustível, escritório e divulgação, paga com dinheiro público.">
        <GastosResumo kind="senador" id={cod} />
      </SecaoLeiga>
      <SecaoLeiga id="partidos" icon={<Repeat className="size-5" aria-hidden />} titulo="Partidos">
        <CardTrocas trocas={trocas} atual={s.partido} fonte={<p className="mt-2 text-xs"><Link className="link" to="/entenda/troca-de-partido">Quando pode trocar de partido →</Link></p>} />
      </SecaoLeiga>
    </>
  );
}

function Votacoes({ cod, janela }: { cod: string; janela: Periodo }) {
  const fim = janela.fim < hojeISO() ? janela.fim : hojeISO();
  const path = sen.votacoes(cod, janela.inicio, fim);
  const q = useSenado<VotacaoSenado[]>(path);
  type Row = VotacaoSenado & { voto: string };
  const rows: Row[] = useMemo(() => (q.data ?? []).map((v) => ({ ...v, voto: v.votos?.[0]?.siglaVotoParlamentar ?? "—" })).sort((a, b) => b.dataSessao.localeCompare(a.dataSessao)), [q.data]);
  const cont = useMemo(() => {
    const c = { sim: 0, nao: 0, abstencao: 0, obstrucao: 0, outro: 0 };
    for (const r of rows) c[categoriaVoto(r.voto)]++;
    return c;
  }, [rows]);
  const cols: Column<Row>[] = [
    { key: "dataSessao", header: "Data", sort: true, cell: (r) => formatDate(r.dataSessao) },
    { key: "identificacao", header: "Matéria", sort: true, cell: (r) => <ExternalLink href={fontes.materiaSenado(r.codigoMateria)[0]!.href}>{r.identificacao}</ExternalLink> },
    { key: "descricaoVotacao", header: "O que foi votado", cell: (r) => <span className="line-clamp-3">{r.descricaoVotacao}</span> },
    { key: "resultadoVotacao", header: "Resultado", sort: true, cell: (r) => (r.resultadoVotacao === "A" ? <Badge tone="verde">Aprovado</Badge> : r.resultadoVotacao === "R" ? <Badge tone="vermelho">Rejeitado</Badge> : r.resultadoVotacao ?? "—") },
    { key: "voto", header: "Voto", sort: true, cell: (r) => <VoteBadge voto={r.voto} />, tip: "Siglas do Senado: AP = ausente/licença autorizada; P-NRV = presente sem registrar voto; NCom = não compareceu; LS = licença saúde; MIS = em missão." },
  ];
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  return (
    <div className="space-y-4">
      <StatGrid>
        <Stat label="Votações nominais" tip="votação nominal" value={q.isPending ? "…" : formatNumber(rows.length)} />
        <Stat label="Votou Sim" value={formatNumber(cont.sim)} />
        <Stat label="Votou Não" value={formatNumber(cont.nao)} />
        <Stat label="Outros / ausências" value={formatNumber(cont.abstencao + cont.obstrucao + cont.outro)} />
      </StatGrid>
      {q.isPending ? <Skeleton className="h-60" /> : <DataTable rows={rows} columns={cols} rowKey={(r) => r.codigoSessaoVotacao} exportName={`votos-senador-${cod}`} search={(r) => `${r.identificacao} ${r.descricaoVotacao} ${r.ementa}`} empty="Nenhuma votação nominal no período." />}
      <Fontes items={[{ label: "Votações (API do Senado)", href: fontes.senadoApi(path) }]} />
    </div>
  );
}

function Autorias({ cod, janela }: { cod: string; janela: Periodo }) {
  const path = sen.autorias(cod);
  const q = useSenado<ProcessoSenado[]>(path);
  const rows = useMemo(() => (q.data ?? []).filter((p) => !p.dataApresentacao || dentro(p.dataApresentacao, janela)).sort((a, b) => b.dataApresentacao.localeCompare(a.dataApresentacao)), [q.data, janela]);
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  return (
    <div>
      {q.isPending ? <Skeleton className="h-60" /> : (
        <DataTable rows={rows} rowKey={(r) => r.id} exportName={`autorias-senador-${cod}`} search={(r) => `${r.identificacao} ${r.ementa}`} empty="Nenhuma autoria no período."
          columns={[
            { key: "identificacao", header: "Matéria", sort: true, cell: (r) => <ExternalLink href={fontes.materiaSenado(r.codigoMateria)[0]!.href}>{r.identificacao}</ExternalLink> },
            { key: "ementa", header: "Ementa", cell: (r) => <AutoLink className="line-clamp-3" casa="senado" text={r.ementa} /> },
            { key: "dataApresentacao", header: "Apresentada", sort: true, cell: (r) => formatDate(r.dataApresentacao) },
            { key: "situacaoAtual", header: "Situação", sort: true, cell: (r) => r.situacaoAtual?.toLowerCase() ?? (r.tramitando === "Sim" ? "em tramitação" : "—") },
            { key: "normaGerada", header: "Virou norma", cell: (r) => r.normaGerada ?? "—" },
          ]} />
      )}
      <p className="mt-2 text-xs text-muted">Inclui coautorias (ex.: requerimentos assinados por vários senadores).</p>
      <Fontes items={[{ label: "Autorias (API do Senado)", href: fontes.senadoApi(path) }]} />
    </div>
  );
}

function Comissoes({ cod, janela }: { cod: string; janela: Periodo | null }) {
  const q = useSenado<ComissaoRaw[]>(sen.comissoes(cod), mapComissoes);
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (q.isPending) return <Skeleton className="h-40" />;
  const rows = janela ? q.data.filter((c) => dentro(c.DataInicio, janela)) : q.data;
  return (
    <div>
      <DataTable rows={rows} rowKey={(r, i) => `${r.IdentificacaoComissao.CodigoComissao}-${i}`} exportName={`comissoes-senador-${cod}`}
        search={(r) => `${r.IdentificacaoComissao.SiglaComissao} ${r.IdentificacaoComissao.NomeComissao}`}
        columns={[
          { key: "sigla", header: "Sigla", sort: (r) => r.IdentificacaoComissao.SiglaComissao, cell: (r) => <Link className="link" to={`/comissao/senado-${r.IdentificacaoComissao.CodigoComissao}`}>{r.IdentificacaoComissao.SiglaComissao}</Link> },
          { key: "nome", header: "Comissão", sort: (r) => r.IdentificacaoComissao.NomeComissao, cell: (r) => <Link className="link" to={`/comissao/senado-${r.IdentificacaoComissao.CodigoComissao}`}>{r.IdentificacaoComissao.NomeComissao}</Link> },
          { key: "casa", header: "Casa", cell: (r) => (r.IdentificacaoComissao.SiglaCasaComissao === "CN" ? "Congresso" : "Senado") },
          { key: "DescricaoParticipacao", header: "Participação", sort: true },
          { key: "DataInicio", header: "Início", sort: true, cell: (r) => formatDate(r.DataInicio) },
          { key: "DataFim", header: "Fim", sort: true, cell: (r) => (r.DataFim ? formatDate(r.DataFim) : <Badge tone="verde">atual</Badge>) },
        ]} />
      <Fontes items={[{ label: "Comissões (API do Senado)", href: fontes.senadoApi(sen.comissoes(cod)) }]} />
    </div>
  );
}
