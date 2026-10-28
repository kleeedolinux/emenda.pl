import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { UFS, type SiglaUf } from "@emenda/contracts";
import {
  Avatar, Badge, Bars, Card, DataTable, EmptyState, ErrorState, ExternalLink, KeyValue, Money, PageHeader, PartyBadge, Skeleton,
  Stat, StatGrid, Tabs, Term, Timeline, formatDate, formatDocumento, formatNumber, useCamara, externo, type Column,
} from "@/ui";
import {
  cam, despesasPorTipo, emendasPorAno, encontrarAutor, fontes, lastPage, qs, totalDespesas,
  type DeputadoDetalhe, type Despesa, type Frente, type HistoricoDeputado, type Ocupacao, type OrgaoDeputado, type Profissao, type ProposicaoLista,
} from "@/features/legislativo/api";
import { useAutor, useAutores, useCamaraPagina, useCamaraTodas, useLegislaturas } from "@/features/legislativo/hooks";
import { anosDoPeriodo, dentro, mandatosCamara, type Periodo } from "@/features/legislativo/mandatos";
import { ChipsMandato, Campo, Fontes, PainelMandatos, Paginador, SeletorMandato, resumoMandatos, selectCls } from "@/features/legislativo/components";
import { VotosDeputado } from "@/features/legislativo/VotosDeputado";
import { EmendasAutor } from "@/features/legislativo/EmendasAutor";
import { formatBRL, isCNPJ } from "@/lib/format";

export default function DeputadoPage() {
  const id = Number(useParams().id);
  const valido = Number.isInteger(id) && id > 0;
  const [sp, setSp] = useSearchParams();
  const sel = sp.get("mandato");
  const setSel = (c: string | null) => setSp((p) => { const n = new URLSearchParams(p); if (c) n.set("mandato", c); else n.delete("mandato"); return n; }, { replace: true });

  const dep = useCamara<DeputadoDetalhe>(valido ? cam.deputado(id) : null);
  const hist = useCamara<HistoricoDeputado[]>(valido ? cam.historico(id) : null);
  const legs = useLegislaturas();
  const autores = useAutores();

  const mandatos = useMemo(() => (hist.data && legs.data ? mandatosCamara(hist.data, legs.data) : []), [hist.data, legs.data]);
  const resumo = resumoMandatos(mandatos);
  const m = mandatos.find((x) => x.codigo === sel) ?? null;
  const janela: Periodo | null = m ? { inicio: m.inicio, fim: m.fim } : mandatos.length ? { inicio: mandatos[0]!.inicio, fim: mandatos[mandatos.length - 1]!.fim } : null;

  const d = dep.data;
  const s = d?.ultimoStatus;
  const autor = d && autores.data ? encontrarAutor(autores.data.idx, [s?.nomeEleitoral, s?.nome, d.nomeCivil]) : null;

  if (!valido) return <EmptyState title="Identificador de deputado inválido." />;
  if (dep.isError) return <ErrorState error={dep.error} retry={() => dep.refetch()} />;

  const nome = s?.nomeEleitoral || s?.nome || "Deputado(a)";
  return (
    <>
      <PageHeader
        eyebrow={<>Deputado(a) federal · <Term k="deputado federal">o que faz?</Term></>}
        title={d ? nome : <Skeleton className="h-9 w-64" />}
        subtitle={d ? <>Nome civil: {d.nomeCivil}</> : undefined}
        media={<Avatar src={s?.urlFoto} name={nome} size="xl" />}
        breadcrumbs={[{ label: "Início", to: "/" }, { label: "Deputados", to: "/deputados" }, { label: nome }]}
        actions={d && (
          <div className="flex flex-col items-end gap-2">
            <span className="flex flex-wrap items-center gap-2">
              <PartyBadge sigla={s!.siglaPartido} />
              <Link className="link text-sm" to={`/uf/${s!.siglaUf}`}>{UFS[s!.siglaUf as SiglaUf] ?? s!.siglaUf}</Link>
              <Badge tone={s!.situacao === "Exercício" ? "verde" : "neutro"}>{s!.situacao ?? "—"}</Badge>
            </span>
            {mandatos.length > 0 && <ChipsMandato {...resumo} />}
          </div>
        )}
      />

      {dep.isPending ? <Skeleton className="h-40" /> : d && s && (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <Card title="Dados públicos">
            <KeyValue items={[
              ["Nome eleitoral", s.nomeEleitoral],
              ["Nome civil", d.nomeCivil],
              ["Situação", <>{s.situacao ?? "—"}{s.condicaoEleitoral ? ` · ${s.condicaoEleitoral}` : ""}</>, "Titular foi eleito diretamente; suplente assume quando o titular se afasta."],
              ["Nascimento", d.dataNascimento ? `${formatDate(d.dataNascimento)}${d.municipioNascimento ? ` · ${d.municipioNascimento}/${d.ufNascimento}` : ""}` : null],
              ...(d.dataFalecimento ? [["Falecimento", formatDate(d.dataFalecimento)] as [string, string]] : []),
              ["Escolaridade", d.escolaridade],
              ["E-mail", s.email || s.gabinete.email ? <a className="link" href={`mailto:${s.email ?? s.gabinete.email}`}>{s.email ?? s.gabinete.email}</a> : null],
              ["Site", d.urlWebsite ? <ExternalLink href={d.urlWebsite}>{d.urlWebsite}</ExternalLink> : null],
            ]} />
          </Card>
          <Card title="Gabinete e redes">
            <KeyValue items={[
              ["Gabinete", s.gabinete.sala ? `Sala ${s.gabinete.sala}, ${s.gabinete.andar}º andar, prédio ${s.gabinete.predio}` : null],
              ["Telefone", s.gabinete.telefone ? `(61) ${s.gabinete.telefone}` : null],
              ["Redes sociais", d.redeSocial.length ? (
                <span className="flex flex-col gap-1">{d.redeSocial.map((r) => <ExternalLink key={r} href={r}>{r.replace(/^https?:\/\/(www\.)?/, "")}</ExternalLink>)}</span>
              ) : null],
              ["Atualizado em", formatDate(s.data)],
            ]} />
            <Fontes items={fontes.deputado(id)} />
          </Card>
        </div>
      )}

      <div className="mb-6">
        {hist.isPending || legs.isPending ? <Skeleton className="h-32" /> : hist.isError ? <ErrorState error={hist.error} retry={() => hist.refetch()} /> : (
          <PainelMandatos mandatos={mandatos} sel={sel} onSel={setSel}
            fonte={<Fontes items={[{ label: "Histórico (API da Câmara)", href: fontes.camaraApi(cam.historico(id)) }, { label: "Legislaturas", href: fontes.camaraApi(cam.legislaturas()) }]} />} />
        )}
      </div>

      {mandatos.length > 1 && (
        <div className="mb-4">
          <p className="mb-2 text-sm font-semibold">Feitos por mandato</p>
          <SeletorMandato mandatos={mandatos} value={sel} onChange={setSel} />
        </div>
      )}

      {janela && d && (
        <Tabs tabs={[
          { id: "resumo", label: "Resumo", content: <Resumo id={id} janela={janela} autorCodigo={autor?.codigo} pagoTotal={autor?.pago} /> },
          { id: "emendas", label: "Emendas", content: <EmendasAutor autorCodigo={autor?.codigo} carregando={autores.isPending} janela={m ? janela : null} nomes={[s?.nomeEleitoral, d.nomeCivil]} /> },
          { id: "proposicoes", label: "Proposições", content: <Proposicoes id={id} janela={janela} /> },
          { id: "votacoes", label: "Votações", content: <VotosDeputado id={id} janela={janela} /> },
          { id: "despesas", label: "Cota parlamentar", content: <Despesas id={id} janela={janela} /> },
          { id: "frentes", label: "Frentes", content: <Frentes id={id} legislatura={m?.legislatura} /> },
          { id: "orgaos", label: "Comissões e órgãos", content: <Orgaos id={id} janela={m ? janela : null} /> },
          { id: "historico", label: "Histórico", content: <Historico id={id} itens={hist.data ?? []} /> },
          { id: "perfil", label: "Profissões", content: <Perfil id={id} /> },
        ]} />
      )}
    </>
  );
}

function Resumo({ id, janela, autorCodigo, pagoTotal }: { id: number; janela: Periodo; autorCodigo?: string; pagoTotal?: number }) {
  const ano = Math.min(Number(janela.fim.slice(0, 4)), new Date().getFullYear());
  const props = useCamaraPagina<ProposicaoLista>(qs("/proposicoes", { idDeputadoAutor: id, dataApresentacaoInicio: janela.inicio, dataApresentacaoFim: janela.fim, itens: 1 }));
  const desp = useCamaraTodas<Despesa>(`/deputados/${id}/despesas?ano=${ano}&itens=100`);
  const autor = useAutor(autorCodigo);
  const pago = autor.data ? emendasPorAno(autor.data.emendas, janela).reduce((s, x) => s + x.pago, 0) : pagoTotal;
  const nProps = props.data ? (props.data.dados.length ? lastPage(props.data.links) : 0) : null;
  return (
    <StatGrid>
      <Stat label="Emendas pagas no período" tip="pago" value={pago != null ? <Money centavos={pago} compact /> : autorCodigo === undefined ? "—" : "…"}
        hint={autorCodigo ? <Link className="link" to={`/autor/${autorCodigo}`}>ver todas as emendas</Link> : "Sem correspondência no Portal da Transparência"} />
      <Stat label="Proposições apresentadas" value={nProps != null ? formatNumber(nProps) : "…"} hint={`${formatDate(janela.inicio)} a ${formatDate(janela.fim)}`} tip="Projetos, requerimentos e outros documentos em que aparece como autor(a)." />
      <Stat label={`Cota parlamentar em ${ano}`} tip="CEAP" value={desp.data ? <Money centavos={totalDespesas(desp.data)} compact /> : desp.isError ? "—" : "…"} hint={desp.data ? `${formatNumber(desp.data.length)} despesas` : undefined} />
      <Stat label="Emendas (quantidade)" tip="emenda" value={autor.data ? formatNumber(emendasPorAno(autor.data.emendas, janela).reduce((s, x) => s + x.n, 0)) : "—"} />
    </StatGrid>
  );
}

function Proposicoes({ id, janela }: { id: number; janela: Periodo }) {
  const [pagina, setPagina] = useState(1);
  const path = cam.proposicoesAutor(id, pagina, janela.inicio, janela.fim);
  const q = useCamaraPagina<ProposicaoLista>(path);
  const total = lastPage(q.data?.links);
  const cols: Column<ProposicaoLista>[] = [
    { key: "siglaTipo", header: "Tipo", sort: true, cell: (r) => <Badge tone="azul"><Term k={r.siglaTipo}>{r.siglaTipo}</Term></Badge> },
    { key: "numero", header: "Nº/Ano", sort: (r) => r.ano * 1e6 + r.numero, cell: (r) => <Link className="link tabular" to={`/proposicao/${r.id}`}>{r.numero}/{r.ano}</Link> },
    { key: "ementa", header: "Ementa", cell: (r) => <span className="line-clamp-3">{r.ementa}</span> },
    { key: "dataApresentacao", header: "Apresentada", sort: true, cell: (r) => formatDate(r.dataApresentacao) },
  ];
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  return (
    <div>
      {q.isPending ? <Skeleton className="h-60" /> : (
        <DataTable rows={q.data!.dados} columns={cols} pageSize={50} rowKey={(r) => r.id} exportName={`proposicoes-deputado-${id}-p${pagina}`}
          search={(r) => `${r.siglaTipo} ${r.numero} ${r.ano} ${r.ementa}`} empty="Nenhuma proposição neste período." />
      )}
      <Paginador pagina={pagina} total={total} onChange={setPagina} carregando={q.isFetching} />
      <Fontes items={[{ label: "Proposições do autor (API da Câmara)", href: fontes.camaraApi(path) }]} />
    </div>
  );
}

function Despesas({ id, janela }: { id: number; janela: Periodo }) {
  const anos = anosDoPeriodo(janela, undefined, 2008);
  const [ano, setAno] = useState(anos[0] ?? new Date().getFullYear());
  const anoEf = anos.includes(ano) ? ano : anos[0] ?? ano;
  const path = `/deputados/${id}/despesas?ano=${anoEf}&itens=100&ordem=DESC&ordenarPor=dataDocumento`;
  const q = useCamaraTodas<Despesa>(path);
  const cols: Column<Despesa>[] = [
    { key: "dataDocumento", header: "Data", sort: (r) => r.dataDocumento ?? `${r.ano}-${String(r.mes).padStart(2, "0")}`, cell: (r) => (r.dataDocumento ? formatDate(r.dataDocumento) : `${String(r.mes).padStart(2, "0")}/${r.ano}`) },
    { key: "tipoDespesa", header: "Tipo", sort: true },
    { key: "nomeFornecedor", header: "Fornecedor", sort: true },
    { key: "cnpjCpfFornecedor", header: "CNPJ/CPF", tip: "CNPJ", cell: (r) => {
      const doc = r.cnpjCpfFornecedor ?? "";
      return isCNPJ(doc) ? <ExternalLink href={externo.cnpj(doc)}>{formatDocumento(doc)}</ExternalLink> : <span className="tabular">{formatDocumento(doc) || "—"}</span>;
    } },
    { key: "valorLiquido", header: "Valor", align: "right", sort: true, cell: (r) => <Money centavos={Math.round(r.valorLiquido * 100)} />, csv: (r) => r.valorLiquido },
    { key: "urlDocumento", header: "Nota", cell: (r) => (r.urlDocumento ? <ExternalLink href={r.urlDocumento}>ver</ExternalLink> : "—") },
  ];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <Campo label="Ano" tip="A cota é contada por ano. Só aparecem os anos do mandato selecionado.">
          <select className={selectCls} value={anoEf} onChange={(e) => setAno(Number(e.target.value))}>{anos.map((a) => <option key={a}>{a}</option>)}</select>
        </Campo>
        <p className="max-w-xl text-sm text-muted"><Term k="CEAP">Cota parlamentar (CEAP)</Term>: reembolso de gastos do mandato. Cada linha traz o fornecedor e, quando disponível, a nota fiscal digitalizada.</p>
      </div>
      {q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : q.isPending ? <Skeleton className="h-60" /> : q.data!.length === 0 ? (
        <EmptyState title={`Nenhuma despesa publicada para ${anoEf}.`} hint="A API da Câmara às vezes fica sem dados de cota temporariamente; confira também o site oficial." />
      ) : (
        <>
          <StatGrid>
            <Stat label={`Total em ${anoEf}`} tip="CEAP" value={<Money centavos={totalDespesas(q.data!)} compact />} />
            <Stat label="Despesas" value={formatNumber(q.data!.length)} />
            <Stat label="Fornecedores" value={formatNumber(new Set(q.data!.map((x) => x.cnpjCpfFornecedor)).size)} />
            <Stat label="Maior categoria" value={despesasPorTipo(q.data!)[0]?.label.toLowerCase() ?? "—"} />
          </StatGrid>
          <Card title="Por tipo de despesa"><Bars data={despesasPorTipo(q.data!)} format={(n) => formatBRL(n, true)} /></Card>
          <Card title="Todas as despesas">
            <DataTable rows={q.data!} columns={cols} pageSize={25} exportName={`ceap-${id}-${anoEf}`} search={(r) => `${r.nomeFornecedor} ${r.tipoDespesa} ${r.cnpjCpfFornecedor}`} initialSort={{ key: "valorLiquido", dir: "desc" }} />
          </Card>
        </>
      )}
      <Fontes items={[
        { label: "Despesas (API da Câmara)", href: fontes.camaraApi(path) },
        { label: "Cota parlamentar no site da Câmara", href: `https://www.camara.leg.br/cota-parlamentar/` },
      ]} />
    </div>
  );
}

function Frentes({ id, legislatura }: { id: number; legislatura?: number }) {
  const q = useCamara<Frente[]>(cam.frentes(id));
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (q.isPending) return <Skeleton className="h-40" />;
  const rows = legislatura ? q.data.filter((f) => f.idLegislatura === legislatura) : q.data;
  return (
    <div>
      <p className="mb-3 text-sm text-muted">Frentes parlamentares são grupos suprapartidários que se reúnem em torno de um tema (ex.: saúde, agro, segurança).</p>
      <DataTable rows={rows} rowKey={(r) => r.id} exportName={`frentes-${id}`} search={(r) => r.titulo} empty="Nenhuma frente registrada."
        columns={[
          { key: "titulo", header: "Frente", sort: true, cell: (r) => <ExternalLink href={fontes.camaraApi(`/frentes/${r.id}`)}>{r.titulo}</ExternalLink> },
          { key: "idLegislatura", header: "Legislatura", sort: true, align: "right" },
        ]} />
      <Fontes items={[{ label: "Frentes (API da Câmara)", href: fontes.camaraApi(cam.frentes(id)) }]} />
    </div>
  );
}

function Orgaos({ id, janela }: { id: number; janela: Periodo | null }) {
  const q = useCamaraTodas<OrgaoDeputado>(`/deputados/${id}/orgaos?itens=100&ordem=DESC&ordenarPor=dataInicio`);
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (q.isPending) return <Skeleton className="h-40" />;
  const rows = janela ? q.data.filter((o) => dentro(o.dataInicio, janela) || (o.dataFim ? dentro(o.dataFim, janela) : true)) : q.data;
  return (
    <div>
      <DataTable rows={rows} rowKey={(r, i) => `${r.idOrgao}-${i}`} exportName={`orgaos-${id}`} search={(r) => `${r.siglaOrgao} ${r.nomeOrgao} ${r.titulo}`} empty="Nenhuma participação registrada."
        columns={[
          { key: "siglaOrgao", header: "Sigla", sort: true },
          { key: "nomeOrgao", header: "Comissão / órgão", sort: true, cell: (r) => <ExternalLink href={fontes.camaraApi(`/orgaos/${r.idOrgao}`)}>{r.nomePublicacao || r.nomeOrgao}</ExternalLink> },
          { key: "titulo", header: "Cargo", sort: true, tip: "Titular vota sempre; suplente vota quando o titular falta." },
          { key: "dataInicio", header: "Início", sort: true, cell: (r) => formatDate(r.dataInicio) },
          { key: "dataFim", header: "Fim", sort: true, cell: (r) => (r.dataFim ? formatDate(r.dataFim) : <Badge tone="verde">atual</Badge>) },
        ]} />
      <Fontes items={[{ label: "Órgãos (API da Câmara)", href: fontes.camaraApi(cam.orgaos(id)) }]} />
    </div>
  );
}

function Historico({ id, itens }: { id: number; itens: HistoricoDeputado[] }) {
  const s = itens.filter((h) => h.situacao || /entrada|sa[ií]da|altera/i.test(h.descricaoStatus ?? "")).slice().sort((a, b) => b.dataHora.localeCompare(a.dataHora));
  return (
    <div>
      {s.length ? (
        <Timeline items={s.map((h) => ({
          date: formatDate(h.dataHora),
          title: h.descricaoStatus || h.situacao || "Registro",
          desc: `${h.siglaPartido}-${h.siglaUf} · ${h.idLegislatura}ª legislatura${h.situacao ? ` · ${h.situacao}` : ""}${h.condicaoEleitoral ? ` (${h.condicaoEleitoral})` : ""}`,
        }))} />
      ) : <EmptyState title="Sem eventos de histórico." />}
      <Fontes items={[{ label: "Histórico (API da Câmara)", href: fontes.camaraApi(cam.historico(id)) }]} />
    </div>
  );
}

function Perfil({ id }: { id: number }) {
  const prof = useCamara<Profissao[]>(cam.profissoes(id));
  const ocup = useCamara<Ocupacao[]>(cam.ocupacoes(id));
  const ocs = (ocup.data ?? []).filter((o) => o.titulo || o.entidade);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Profissões declaradas">
        {prof.isPending ? <Skeleton className="h-20" /> : prof.data?.length ? (
          <ul className="flex flex-wrap gap-2">{prof.data.map((p) => <li key={p.codTipoProfissao}><Badge>{p.titulo}</Badge></li>)}</ul>
        ) : <EmptyState title="Nenhuma profissão declarada." />}
        <Fontes items={[{ label: "Profissões (API)", href: fontes.camaraApi(cam.profissoes(id)) }]} />
      </Card>
      <Card title="Ocupações anteriores">
        {ocup.isPending ? <Skeleton className="h-20" /> : ocs.length ? (
          <ul className="space-y-2 text-sm">
            {ocs.map((o, i) => (
              <li key={i}><b>{o.titulo ?? "—"}</b>{o.entidade ? ` · ${o.entidade}` : ""}{o.entidadeUF ? `/${o.entidadeUF}` : ""}
                <span className="text-muted">{o.anoInicio ? ` (${o.anoInicio}${o.anoFim ? `–${o.anoFim}` : "–"})` : ""}</span></li>
            ))}
          </ul>
        ) : <EmptyState title="Nenhuma ocupação declarada." />}
        <Fontes items={[{ label: "Ocupações (API)", href: fontes.camaraApi(cam.ocupacoes(id)) }]} />
      </Card>
    </div>
  );
}

