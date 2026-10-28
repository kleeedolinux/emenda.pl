import { chaveNome, dataPath, UFS, type Autor, type SiglaUf } from "@emenda/contracts";
import { Info } from "lucide-react";
import { useMemo } from "react";
import { Link, useParams } from "react-router";
import { COR_TIPO, nomeTipoCurto } from "@/features/emendas/tipos";
import { EmendasTable, FavorecidosTable, type FavorecidoExt } from "@/features/emendas/tables";
import { TotaisGrid } from "@/features/emendas/Totais";
import { useApi, useCamara } from "@/lib/data";
import { formatBRL } from "@/lib/format";
import { Avatar, NextSteps, Bars, ButtonLink, Card, Donut, ErrorState, LineArea, PageHeader, PartyBadge, Section, Skeleton, Tabs, Term } from "@/ui";
import { ShareButton } from "@/features/share";

type AutorExt = Autor & { favorecidos?: FavorecidoExt[] };
interface DepResumo { id: number; nome: string; siglaPartido: string; siglaUf: string; urlFoto: string }

function tipoAutor(nome: string): "bancada" | "comissao" | "relator" | "pessoa" {
  const n = chaveNome(nome);
  if (n.startsWith("BANCADA")) return "bancada";
  if (n.startsWith("COMISSAO") || n.startsWith("COM ")) return "comissao";
  if (n.includes("RELATOR")) return "relator";
  return "pessoa";
}

export default function AutorPage() {
  const codigo = useParams().codigo ?? "";
  const q = useApi<AutorExt>(codigo ? dataPath.autor(codigo) : null);
  const d = q.data;
  const kind = d ? tipoAutor(d.nome) : "pessoa";
  const dep = useCamara<DepResumo[]>(d && kind === "pessoa" ? `/deputados?nome=${encodeURIComponent(d.nome)}&itens=5` : null);
  const match = useMemo(() => dep.data?.find((x) => chaveNome(x.nome) === d?.chave) ?? dep.data?.[0], [dep.data, d]);

  if (q.isError) return <><PageHeader title={`Autor ${codigo}`} breadcrumbs={[{ label: "Início", to: "/" }, { label: "Emendas", to: "/emendas" }, { label: codigo }]} /><ErrorState error={q.error} retry={() => q.refetch()} /></>;
  if (!d) return <Skeleton className="h-96" />;

  return (
    <>
      <PageHeader
        eyebrow={kind === "bancada" ? <Term k="bancada">Bancada estadual</Term> : kind === "comissao" ? <Term k="comissão">Comissão</Term> : kind === "relator" ? <Term k="RP9">Relatoria</Term> : "Autor de emendas"}
        title={d.nome}
        subtitle={`Código do autor no Portal da Transparência: ${d.codigo}`}
        breadcrumbs={[{ label: "Início", to: "/" }, { label: "Emendas", to: "/emendas" }, { label: d.nome }]}
        media={<Avatar src={match?.urlFoto} name={d.nome} size="lg" />}
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
          {kind === "relator" && "Emendas de relator (RP9) foram usadas no chamado “orçamento secreto”, em que o parlamentar que pediu o recurso não era identificado. O STF declarou a prática inconstitucional em 2022."}
        </p>
      )}
      <TotaisGrid t={d.totais} />

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Pago por ano" tip="pago"><LineArea data={[...d.porAno].sort((a, b) => a.ano - b.ano).map((a) => ({ x: a.ano, y: a.pago }))} format={(n) => formatBRL(n, true)} /></Card>
        <Card title="Por tipo de emenda"><Donut data={d.porTipo.map((t) => ({ label: nomeTipoCurto(t.tipo), value: t.pago, color: COR_TIPO[t.tipo], highlight: t.tipo === "pix" }))} format={(n) => formatBRL(n, true)} centerLabel="Pago" /></Card>
        <Card title="Para quais estados" className="lg:col-span-2">
          <Bars data={[...d.porUf].sort((a, b) => b.pago - a.pago).map((u) => ({ label: UFS[u.uf as SiglaUf] ?? u.uf, sub: u.uf, value: u.pago, href: UFS[u.uf as SiglaUf] ? `/uf/${u.uf}` : undefined }))} format={(n) => formatBRL(n, true)} />
        </Card>
      </div>

      <Section title="Registros">
        <Tabs tabs={[
          { id: "emendas", label: "Emendas", count: d.emendas.length, content: <EmendasTable rows={d.emendas} exportName={`autor-${d.codigo}-emendas`} showLocal showAutor={false} /> },
          ...(d.favorecidos ? [{ id: "favorecidos", label: "Favorecidos", count: d.favorecidos.length, content: <FavorecidosTable rows={d.favorecidos} exportName={`autor-${d.codigo}-favorecidos`} /> }] : []),
        ]} />
      </Section>
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
