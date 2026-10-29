import { chaveNome, dataPath, UFS, type Autor, type SiglaUf } from "@emenda/contracts";
import { Info } from "lucide-react";
import { useMemo } from "react";
import { Link, useParams } from "react-router";
import { BarraTipos, ModoDetalhado, tipoAutor, topPorTipo } from "@/features/linguagem";
import { nomeProprio } from "@/features/emendas/historias";
import { EmendasTable, FavorecidosTable, type FavorecidoExt } from "@/features/emendas/tables";
import { TotaisGrid } from "@/features/emendas/Totais";
import { useApi, useCamara } from "@/lib/data";
import { formatBRL } from "@/lib/format";
import { Avatar, NextSteps, Bars, ButtonLink, Card, Donut, ErrorState, LineArea, PageHeader, PartyBadge, Section, Skeleton, Tabs, Term } from "@/ui";
import { ShareButton } from "@/features/share";
import { fotoPorNome } from "@/lib/cdn";

type AutorExt = Autor & { favorecidos?: FavorecidoExt[] };
interface DepResumo { id: number; nome: string; siglaPartido: string; siglaUf: string; urlFoto: string }

export default function AutorPage() {
  const codigo = useParams().codigo ?? "";
  const q = useApi<AutorExt>(codigo ? dataPath.autor(codigo) : null);
  const d = q.data;
  const kind = d ? tipoAutor(d.nome) : "pessoa";
  const dep = useCamara<DepResumo[]>(d && kind === "pessoa" ? `/deputados?nome=${encodeURIComponent(d.nome)}&itens=5` : null);
  // Só o mesmo nome (antes caía no 1º resultado da busca, às vezes outra pessoa).
  const match = useMemo(() => dep.data?.find((x) => chaveNome(x.nome) === d?.chave), [dep.data, d]);

  if (q.isError) return <><PageHeader title={`Autor ${codigo}`} breadcrumbs={[{ label: "Início", to: "/" }, { label: "Pagamentos", to: "/emendas" }, { label: codigo }]} /><ErrorState error={q.error} retry={() => q.refetch()} /></>;
  if (!d) return <Skeleton className="h-96" />;

  return (
    <>
      <PageHeader
        eyebrow={kind === "bancada" ? <Term k="bancada">Grupo de políticos do estado</Term> : kind === "comissao" ? <Term k="comissão">Comissão do Congresso</Term> : kind === "relator" ? <Term k="RP9">Orçamento secreto</Term> : <Term k="emenda">Político que manda dinheiro</Term>}
        title={nomeProprio(d.nome)}
        subtitle={<>Mandou <b>{formatBRL(d.totais.pago, true)}</b> já pagos para {d.porUf.length} {d.porUf.length === 1 ? "estado" : "estados"}.</>}
        breadcrumbs={[{ label: "Início", to: "/" }, { label: "Pagamentos", to: "/emendas" }, { label: nomeProprio(d.nome) }]}
        media={<Avatar src={match?.urlFoto ?? (kind === "pessoa" ? fotoPorNome(d.nome) : undefined)} name={d.nome} size="lg" />}
        actions={match ? (
          <>
            <ShareButton fab kind="autor" title={d.nome} url={`/autor/${d.codigo}`} ogId={d.codigo} metric={{ value: d.totais.pago, format: "brl", label: "pagas" }} bars={[...d.porUf].sort((a, b) => b.pago - a.pago).slice(0, 5).map((x) => ({ label: x.uf, value: x.pago }))} />
            <PartyBadge sigla={match.siglaPartido} />
            <ButtonLink to={`/deputado/${match.id}`} primary>Perfil na Câmara</ButtonLink>
          </>
        ) : <ShareButton fab kind="autor" title={d.nome} url={`/autor/${d.codigo}`} ogId={d.codigo} metric={{ value: d.totais.pago, format: "brl", label: "pagas" }} />}
      />
      {kind !== "pessoa" && (
        <p className="mb-6 flex items-start gap-2 rounded-2xl border border-line bg-surface-2 p-4 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
          {kind === "bancada" && "Este autor é uma bancada: o conjunto de deputados e senadores de um estado que indica emendas em grupo, geralmente para obras de maior porte. Não há um único responsável."}
          {kind === "comissao" && "Este autor é uma comissão do Congresso (ex.: Saúde, Educação). A emenda é decidida pelo colegiado, não por um parlamentar individual."}
          {kind === "relator" && <>Este é o “orçamento secreto”: o dinheiro saiu em nome do relator do Orçamento, sem mostrar qual político pediu. O STF proibiu isso em 2022. <Link className="link" to="/orcamento-secreto">Veja a história completa</Link>.</>}
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Pago por ano" tip="pago"><LineArea data={[...d.porAno].sort((a, b) => a.ano - b.ano).map((a) => ({ x: a.ano, y: a.pago }))} format={(n) => formatBRL(n, true)} /></Card>
        <Card title="De que jeito mandou"><BarraTipos porTipo={d.porTipo} detalhe={(t) => ({ titulo: "Para onde foi", itens: topPorTipo(d.emendas, t, "destino").map((x) => ({ ...x, nome: nomeProprio(x.nome) })), verMais: "?tab=emendas#detalhes" })} /></Card>
        <Card title="Para quais estados" className="lg:col-span-2" tip="Os 8 primeiros. A lista completa está em Ver tudo.">
          <Bars data={[...d.porUf].sort((a, b) => b.pago - a.pago).map((u) => ({ label: UFS[u.uf as SiglaUf] ?? u.uf, sub: u.uf, value: u.pago, href: UFS[u.uf as SiglaUf] ? `/uf/${u.uf}` : undefined }))} format={(n) => formatBRL(n, true)} limit={8} />
        </Card>
      </div>

      <ModoDetalhado id="detalhes" titulo="Ver tudo: cada indicação, quem recebeu e números técnicos">
        <TotaisGrid t={d.totais} />
        <div className="mt-4">
        <Tabs tabs={[
          { id: "emendas", label: "Emendas", count: d.emendas.length, content: <EmendasTable rows={d.emendas} exportName={`autor-${d.codigo}-emendas`} showLocal showAutor={false} /> },
          ...(d.favorecidos ? [{ id: "favorecidos", label: "Favorecidos", count: d.favorecidos.length, content: <FavorecidosTable rows={d.favorecidos} exportName={`autor-${d.codigo}-favorecidos`} /> }] : []),
        ]} />
        </div>
      </ModoDetalhado>
      <NextSteps items={[
        ...(match ? [
          { to: `/deputado/${match.id}`, label: "Perfil na Câmara", desc: "Mandato, gastos da cota e presença." },
          { to: `/deputado/${match.id}?tab=votacoes`, label: "Como votou", desc: "Votações nominais recentes." },
          { to: `/proposicoes?q=${encodeURIComponent(match.nome)}`, label: "Projetos de lei", desc: "Proposições de autoria do parlamentar." },
        ] : []),
        ...[...d.porUf].sort((a, b) => b.pago - a.pago).slice(0, 2).filter((u) => UFS[u.uf as SiglaUf]).map((u) => ({ to: `/uf/${u.uf}`, label: `Emendas em ${UFS[u.uf as SiglaUf]}`, desc: "Municípios e outros autores do estado." })),
        { to: "/emendas", label: "Ranking de autores", desc: "Compare com outros parlamentares." },
      ]} />
      {kind === "pessoa" && !match && dep.isSuccess && (
        <p className="mt-6 text-sm text-muted">Não encontramos este nome entre os deputados em exercício. Pode ser senador(a) ou ex-parlamentar — veja <Link className="link" to="/senadores">senadores</Link>.</p>
      )}
    </>
  );
}
