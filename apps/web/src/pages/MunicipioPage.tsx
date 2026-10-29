import { dataPath, UFS, type Municipio, type Prefeito, type SiglaUf } from "@emenda/contracts";
import { useParams } from "react-router";
import { COR_TIPO, nomeTipoCurto } from "@/features/emendas/tipos";
import { ConveniosTable, EmendasTable, FavorecidosTable, type Convenio, type FavorecidoExt } from "@/features/emendas/tables";
import { TotaisGrid } from "@/features/emendas/Totais";
import { ufDoMunicipio, useApi, type IbgeMunicipio } from "@/lib/data";
import { formatBRL, formatNumber, formatPct } from "@/lib/format";
import { Avatar, NextSteps, Badge, Bars, Card, Donut, EmptyState, ErrorState, ExternalLink, KeyValue, PageHeader, PartyBadge, Section, Skeleton, Tabs, Term } from "@/ui";
import { ShareButton } from "@/features/share";
import { fotoPrefeito, fotoVicePrefeito } from "@/lib/cdn";
import { EmblemaMunicipio } from "@/features/emblemas/EmblemaMunicipio";

/** Campos opcionais que o ETL pode publicar além do contrato mínimo. */
type MunicipioExt = Municipio & { vice?: Prefeito | null; convenios?: Convenio[]; favorecidos: FavorecidoExt[]; populacao?: number };

export default function MunicipioPage() {
  const ibgeId = useParams().ibge ?? "";
  const q = useApi<MunicipioExt>(/^\d{7}$/.test(ibgeId) ? dataPath.municipio(ibgeId) : null);
  const info = useApi<IbgeMunicipio>(/^\d{7}$/.test(ibgeId) ? `/api/ibge/v1/localidades/municipios/${ibgeId}` : null);
  const d = q.data;
  const uf = d?.uf ?? (info.data ? ufDoMunicipio(info.data) : "");
  const nome = d?.nome ?? info.data?.nome ?? `Município ${ibgeId}`;
  const pix = d?.porTipo.find((t) => t.tipo === "pix");

  return (
    <>
      <PageHeader
        eyebrow={<>Município · <Term k="código IBGE">IBGE {ibgeId}</Term></>}
        title={nome}
        media={uf ? <EmblemaMunicipio ibge={ibgeId} uf={uf} nome={nome} size={56} credito /> : undefined}
        subtitle={uf ? `${UFS[uf as SiglaUf] ?? uf}` : undefined}
        breadcrumbs={[{ label: "Início", to: "/" }, ...(uf ? [{ label: UFS[uf as SiglaUf] ?? uf, to: `/uf/${uf}` }] : []), { label: nome }]}
        actions={<ShareButton fab kind="municipio" title={nome} subtitle={uf ? UFS[uf as SiglaUf] ?? uf : undefined} url={`/municipio/${ibgeId}`} ogId={ibgeId} metric={d ? { value: d.totais.pago, format: "brl", label: "pagos em emendas parlamentares" } : undefined} bars={d?.autores.slice(0, 5).map((a) => ({ label: a.nome, value: a.pago }))} />}
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card title="Prefeitura" tip="prefeito">
          {d?.prefeito ? (
            <div className="space-y-3">
              <PessoaCargo p={d.prefeito} cargo="Prefeito(a)" foto={fotoPrefeito(ibgeId)} />
              {d.vice && <PessoaCargo p={d.vice} cargo="Vice-prefeito(a)" foto={fotoVicePrefeito(ibgeId)} />}
            </div>
          ) : q.isPending ? <Skeleton className="h-16" /> : <p className="text-sm text-muted">Prefeito(a) não informado(a) na base do TSE para este município.</p>}
        </Card>
        <Card title="Dados do IBGE">
          {info.data ? (
            <KeyValue items={[
              ["Código IBGE", <span className="tabular">{info.data.id}</span>, "código IBGE"],
              ["Microrregião", info.data.microrregiao?.nome],
              ["Mesorregião", info.data.microrregiao?.mesorregiao?.nome],
              ["Região imediata", info.data["regiao-imediata"]?.nome],
              ["Região", info.data.microrregiao?.mesorregiao?.UF?.regiao?.nome ?? info.data["regiao-imediata"]?.["regiao-intermediaria"]?.UF?.regiao?.nome],
              ...(d?.populacao ? [["População", formatNumber(d.populacao)] as [string, string]] : []),
            ]} />
          ) : info.isError ? <p className="text-sm text-muted">IBGE indisponível no momento.</p> : <Skeleton className="h-24" />}
          <p className="mt-3 text-xs"><ExternalLink href={`https://cidades.ibge.gov.br/brasil/${(uf || "").toLowerCase()}/${ibgeId}`}>Ver no IBGE Cidades</ExternalLink></p>
        </Card>
      </div>

      {q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : d ? <TotaisGrid t={d.totais} /> : <Skeleton className="h-28" />}

      {d && (
        <>
          {pix && pix.pago > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-amarelo/50 bg-amarelo/10 p-4 text-sm">
              <Badge tone="amarelo">Emenda Pix</Badge>
              <span><b className="tabular">{formatBRL(pix.pago)}</b> ({d.totais.pago ? formatPct(pix.pago / d.totais.pago) : "—"} do pago) chegaram como <Term k="transferência especial">transferência especial</Term>, direto no caixa da prefeitura, sem finalidade definida antes.</span>
            </div>
          )}
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card title="Por tipo de emenda">
              <Donut data={d.porTipo.map((t) => ({ label: nomeTipoCurto(t.tipo), value: t.pago, color: COR_TIPO[t.tipo], highlight: t.tipo === "pix" }))} format={(n) => formatBRL(n, true)} centerLabel="Pago" />
            </Card>
            <Card title="Quem enviou" tip="Autores das emendas, por valor pago a este município.">
              {d.autores.length ? (
                <Bars limit={10} data={[...d.autores].sort((a, b) => b.pago - a.pago).map((a) => ({ label: a.nome, value: a.pago, href: `/autor/${encodeURIComponent(a.codigo)}`, sub: `${a.n}` }))} format={(n) => formatBRL(n, true)} />
              ) : <EmptyState title="Sem autores" />}
            </Card>
          </div>
          <Section title="Todos os registros">
            <Tabs tabs={[
              { id: "emendas", label: "Emendas", count: d.emendas.length, content: <EmendasTable rows={d.emendas} exportName={`emendas-${ibgeId}`} /> },
              { id: "favorecidos", label: "Favorecidos", count: d.favorecidos.length, content: <FavorecidosTable rows={d.favorecidos} exportName={`favorecidos-${ibgeId}`} /> },
              ...(d.convenios?.length ? [{ id: "convenios", label: "Convênios", count: d.convenios.length, content: <ConveniosTable rows={d.convenios} exportName={`convenios-${ibgeId}`} /> }] : []),
            ]} />
          </Section>
        </>
      )}
      <NextSteps items={[
        ...[...(d?.autores ?? [])].sort((a, b) => b.pago - a.pago).slice(0, 3).map((a) => ({ to: `/autor/${encodeURIComponent(a.codigo)}`, label: a.nome, desc: `Enviou ${formatBRL(a.pago, true)} para ${nome}. Veja perfil, votações e outras emendas.` })),
        ...(uf ? [{ to: `/uf/${uf}`, label: `Todos os municípios de ${uf}`, desc: "Compare sua cidade com as vizinhas." }, { to: `/deputados?uf=${uf}`, label: `Deputados de ${uf}`, desc: "Quem representa seu estado em Brasília." }] : []),
        { to: "/proposicoes", label: "Leis em votação", desc: "O que o Congresso está decidindo agora." },
      ]} />
    </>
  );
}

function PessoaCargo({ p, cargo, foto }: { p: Prefeito; cargo: string; foto?: string }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar src={foto} name={p.nome} />
      <div className="min-w-0">
        <p className="text-xs text-muted">{cargo} · eleição {p.eleicao}</p>
        <p className="truncate font-semibold">{p.nome}</p>
        <div className="mt-0.5 flex items-center gap-2"><PartyBadge sigla={p.partido} />{p.situacao && <span className="text-xs text-muted">{p.situacao}</span>}</div>
      </div>
    </div>
  );
}
