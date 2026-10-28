import { Link } from "react-router";
import { UFS, type SiglaUf } from "@emenda/contracts";
import { Badge, Bars, Card, DataTable, ExternalLink, PageHeader, Section, Stat, StatGrid, Term, formatNumber, type Column } from "@/ui";
import { ASSEMBLEIAS, CADEIRAS_FEDERAIS, cadeirasAssembleia, type Assembleia } from "@/features/legislativo/assembleias";
import { Fontes } from "@/features/legislativo/components";

type Linha = Assembleia & { cadeiras: number };
const linhas: Linha[] = ASSEMBLEIAS.map((a) => ({ ...a, cadeiras: cadeirasAssembleia(CADEIRAS_FEDERAIS[a.uf] ?? 0) }));
const total = linhas.reduce((s, l) => s + l.cadeiras, 0);
const comApi = linhas.filter((l) => l.api);

const cols: Column<Linha>[] = [
  { key: "uf", header: "UF", sort: true, cell: (r) => <Link className="link font-semibold" to={`/uf/${r.uf}`}>{r.uf}</Link> },
  { key: "nome", header: "Casa legislativa", sort: true, cell: (r) => <span><b>{r.sigla}</b> <span className="text-muted">· {UFS[r.uf as SiglaUf]}</span></span> },
  { key: "cadeiras", header: "Cadeiras", align: "right", sort: true, tip: "Pela Constituição (art. 27): o triplo da bancada federal do estado; acima de 36, soma-se um por deputado federal além de 12." },
  { key: "site", header: "Site oficial", cell: (r) => <ExternalLink href={r.site}>{r.site.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, "")}</ExternalLink> },
  { key: "transparencia", header: "Transparência", cell: (r) => (r.transparencia ? <ExternalLink href={r.transparencia}>portal</ExternalLink> : <span className="text-muted">pelo site</span>) },
  { key: "dadosAbertos", header: "Dados abertos", cell: (r) => (r.dadosAbertos ? <ExternalLink href={r.dadosAbertos}>catálogo</ExternalLink> : "—") },
  { key: "api", header: "API pública", sort: (r) => (r.api ? 1 : 0), csv: (r) => r.api?.url ?? "", cell: (r) => (r.api ? <span className="flex items-center gap-1"><Badge tone="verde">{r.api.formato}</Badge><ExternalLink href={r.api.url}>{r.api.tipo}</ExternalLink></span> : "—") },
];

export default function EstaduaisPage() {
  return (
    <>
      <PageHeader
        eyebrow="Assembleias Legislativas"
        title="Deputados estaduais e distritais"
        subtitle={<>Os <Term k="deputado estadual">deputados estaduais</Term> fazem as leis do estado e fiscalizam o governador. Diferente da Câmara e do Senado, não existe uma base nacional única com os dados das 27 casas.</>}
        breadcrumbs={[{ label: "Início", to: "/" }, { label: "Estaduais" }]}
      />
      <div className="card mb-6 border-l-4 border-l-amarelo p-4 text-sm">
        <p><b>Cobertura em expansão.</b> Por enquanto listamos onde encontrar os dados oficiais de cada Assembleia. Casas com API pública (marcadas em verde) serão integradas aos poucos, sempre pela nossa ponte de dados e com link para a fonte.</p>
      </div>
      <StatGrid className="mb-6">
        <Stat label="Casas legislativas" value="27" hint="26 Assembleias + Câmara Legislativa do DF" />
        <Stat label="Cadeiras no total" value={formatNumber(total)} tip="Calculado pela regra do art. 27 da Constituição a partir das bancadas federais." />
        <Stat label="Com API pública conhecida" value={formatNumber(comApi.length)} hint={comApi.map((a) => a.uf).join(", ")} />
        <Stat label="Maior Assembleia" value="ALESP" hint={`${linhas.find((l) => l.uf === "SP")!.cadeiras} cadeiras`} />
      </StatGrid>
      <Section title="As 27 casas">
        <Card><DataTable rows={linhas} columns={cols} pageSize={27} rowKey={(r) => r.uf} exportName="assembleias-legislativas" search={(r) => `${r.uf} ${r.sigla} ${r.nome}`} /></Card>
      </Section>
      <Section title="Cadeiras por estado">
        <Card><Bars data={linhas.slice().sort((a, b) => b.cadeiras - a.cadeiras).map((l) => ({ label: `${l.uf} · ${l.sigla}`, value: l.cadeiras, href: `/uf/${l.uf}` }))} /></Card>
      </Section>
      <Fontes items={[
        { label: "Constituição Federal, art. 27", href: "https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm#art27" },
        { label: "Deputados federais por UF (Câmara)", href: "https://www.camara.leg.br/deputados/quem-sao" },
        { label: "SAPL / Interlegis (sistema usado por várias Casas)", href: "https://www.interlegis.leg.br/" },
      ]} />
    </>
  );
}
