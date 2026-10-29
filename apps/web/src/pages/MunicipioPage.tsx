import { dataPath, UFS, type Municipio, type Prefeito, type SiglaUf } from "@emenda/contracts";
import { Building, Landmark } from "lucide-react";
import { useParams } from "react-router";
import { ConveniosTable, EmendasTable, FavorecidosTable, type Convenio, type FavorecidoExt } from "@/features/emendas/tables";
import { AreasGasto, BarraTipos, fraseChegou, ListaVerMais, ModoDetalhado, porMorador, QuemMandou, QuemMandouSkeleton, topPorTipo, usePopulacao } from "@/features/linguagem";
import { nomeProprio } from "@/features/emendas/historias";
import { ufDoMunicipio, useApi, type IbgeMunicipio } from "@/lib/data";
import { formatBRL, formatCNPJ, formatNumber, isCNPJ } from "@/lib/format";
import { fotoPrefeito } from "@/lib/cdn";
import { EmblemaMunicipio } from "@/features/emblemas/EmblemaMunicipio";
import { Avatar, CountUp, EmptyState, ErrorState, ExternalLink, NextSteps, PageHeader, PartyBadge, Skeleton, Tabs, Tip } from "@/ui";
import { ShareButton } from "@/features/share";

/** Campos opcionais que o ETL pode publicar além do contrato mínimo. */
type MunicipioExt = Municipio & { vice?: Prefeito | null; convenios?: Convenio[]; favorecidos: FavorecidoExt[]; populacao?: number };

const brl = (n: number) => formatBRL(Math.round(n), true);

export default function MunicipioPage() {
  const ibgeId = useParams().ibge ?? "";
  const valido = /^\d{7}$/.test(ibgeId);
  const q = useApi<MunicipioExt>(valido ? dataPath.municipio(ibgeId) : null);
  const d = q.data;
  // Nome/UF do IBGE só quando o município não tem dados (404).
  const info = useApi<IbgeMunicipio>(valido && q.isError ? `/api/ibge/v1/localidades/municipios/${ibgeId}` : null);
  const pop = usePopulacao(valido ? ibgeId : null);
  const uf = d?.uf ?? (info.data ? ufDoMunicipio(info.data) : "");
  const nomeUf = UFS[uf as SiglaUf] ?? uf;
  const nome = d?.nome ?? info.data?.nome ?? `Município ${ibgeId}`;
  const populacao = d?.populacao ?? pop.data?.populacao;
  const pago = d?.totais.pago ?? 0;
  const pix = d?.porTipo.filter((t) => t.tipo === "pix").reduce((s, t) => s + t.pago, 0) ?? 0;
  const politicos = d?.autores.filter((a) => a.pago > 0).length ?? 0;
  const morador = porMorador(pago, populacao);
  const gastos = d?.emendas.map((e) => ({ funcao: e.funcao, valor: e.pago })) ?? [];

  return (
    <>
      <PageHeader
        eyebrow={uf ? `Cidade · ${nomeUf}` : "Cidade"}
        media={uf ? <EmblemaMunicipio ibge={ibgeId} uf={uf} nome={nome} size={56} credito /> : undefined}
        title={nome}
        breadcrumbs={[{ label: "Início", to: "/" }, ...(uf ? [{ label: nomeUf, to: `/uf/${uf}` }] : []), { label: nome }]}
        actions={<ShareButton fab kind="municipio" title={nome} subtitle={nomeUf || undefined} url={`/municipio/${ibgeId}`} ogId={ibgeId}
          text={d ? `${fraseChegou({ nome, pago, politicos, pctPix: pago ? pix / pago : 0 })} Veja quem mandou:` : undefined}
          metric={d ? { value: pago, format: "brl", label: "mandados por políticos" } : undefined} bars={d?.autores.slice(0, 5).map((a) => ({ label: a.nome, value: a.pago }))} />}
      />

      {q.isError ? (
        (q.error as { status?: number }).status === 404
          ? <EmptyState title={`${nome} não recebeu dinheiro mandado por políticos no período.`} hint="Ou o valor ainda não foi pago. Veja outras cidades do estado." />
          : <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : !d ? <Skeleton className="h-72 rounded-3xl" /> : (
        <>
          {/* 1ª tela: quanto chegou, por morador, de que jeito e quem mandou */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr_1fr]">
            <section aria-labelledby="quanto" className="card p-5 sm:p-6">
              <h2 id="quanto" className="text-sm font-semibold text-muted">Dinheiro que deputados e senadores mandaram para cá <Tip content="Emendas parlamentares: parte do Orçamento federal que cada político escolhe para onde vai. Contamos o que de fato foi pago." /></h2>
              <p className="mt-1 font-display text-5xl font-bold tracking-tight tabular sm:text-6xl"><CountUp value={pago} format={brl} /></p>
              {morador != null && (
                <p className="mt-1 text-lg">
                  <b className="tabular">R$ {formatNumber(morador)}</b> por morador
                  <span className="text-sm text-muted"> · {formatNumber(populacao!)} moradores <Tip content={`População estimada pelo IBGE${pop.data ? ` (${pop.data.ano})` : ""}.`} /></span>
                </p>
              )}
              {d.totais.rapPago > 0 && <p className="mt-1 text-sm text-muted">+ {brl(d.totais.rapPago)} de indicações de anos anteriores pagas depois <Tip content="Restos a pagar: dinheiro prometido num ano e pago só nos anos seguintes." /></p>}
              <p className="mt-3 text-pretty text-fg/85">{fraseChegou({ nome, pago, politicos, pctPix: pago ? pix / pago : 0 })}</p>
              <div className="mt-5">
                <h3 className="mb-2 text-sm font-semibold">De que jeito chegou</h3>
                <BarraTipos porTipo={d.porTipo} detalhe={(t) => ({ titulo: "Quem mandou", itens: topPorTipo(d.emendas, t, "autor").map((x) => ({ ...x, nome: nomeProprio(x.nome) })), verMais: "?tab=emendas#detalhes" })} />
              </div>
            </section>
            <section aria-labelledby="quem" className="card p-4 sm:p-5">
              <h2 id="quem" className="mb-3 font-display text-lg font-bold">Quem mandou</h2>
              <QuemMandou autores={d.autores} inicial={3} />
            </section>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section aria-labelledby="gasto" className="card p-4 sm:p-5">
              <h2 id="gasto" className="mb-3 font-display text-lg font-bold">No que foi gasto</h2>
              <AreasGasto itens={gastos} inicial={5} />
            </section>
            <section aria-labelledby="recebeu" className="card p-4 sm:p-5">
              <h2 id="recebeu" className="mb-1 font-display text-lg font-bold">Quem recebeu o dinheiro</h2>
              <p className="mb-3 text-sm text-muted">Prefeitura, fundos, empresas e entidades que receberam na ponta. <Tip content="Soma de todos os pagamentos a cada recebedor registrados no Portal da Transparência, de todos os anos e origens. Por isso pode passar do total acima." /></p>
              <ListaVerMais itens={d.favorecidos} inicial={5} chave={(f) => f.documento + f.nome} className="divide-y divide-line"
                vazio={<p className="text-sm text-muted">Sem favorecidos publicados.</p>}
                render={(f) => (
                  <details className="group py-2">
                    <summary className="flex cursor-pointer list-none items-center gap-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted">{/munic|prefeit|fundo/i.test(f.nome) ? <Landmark className="size-4" aria-hidden /> : <Building className="size-4" aria-hidden />}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{f.nome}</span>
                      <b className="shrink-0 text-sm tabular">{brl(f.valor)}</b>
                    </summary>
                    <p className="ml-11 mt-1 text-xs text-muted">
                      {f.naturezaJuridica ?? f.tipo}{f.documento ? <> · {isCNPJ(f.documento) ? <ExternalLink href={`https://cnpj.biz/${f.documento}`}>CNPJ {formatCNPJ(f.documento)}</ExternalLink> : f.documento}</> : null}
                    </p>
                  </details>
                )} />
            </section>
          </div>

          {d.prefeito && (
            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-sm">
              <Avatar src={fotoPrefeito(ibgeId)} name={d.prefeito.nome} size="sm" />
              <span className="min-w-0">Quem administra o dinheiro na cidade: <b>{d.prefeito.nome}</b>, prefeito(a) eleito(a) em {d.prefeito.eleicao}</span>
              <PartyBadge sigla={d.prefeito.partido} />
            </div>
          )}

          <ModoDetalhado id="detalhes" titulo={`Ver tudo: ${formatNumber(d.emendas.length)} indicações, ${formatNumber(d.favorecidos.length)} recebedores${d.convenios?.length ? `, ${formatNumber(d.convenios.length)} convênios` : ""}`}>
            <Tabs tabs={[
              { id: "emendas", label: "Indicações (emendas)", count: d.emendas.length, content: <EmendasTable rows={d.emendas} exportName={`emendas-${ibgeId}`} /> },
              { id: "favorecidos", label: "Quem recebeu", count: d.favorecidos.length, content: <FavorecidosTable rows={d.favorecidos} exportName={`favorecidos-${ibgeId}`} /> },
              ...(d.convenios?.length ? [{ id: "convenios", label: "Convênios", count: d.convenios.length, content: <ConveniosTable rows={d.convenios} exportName={`convenios-${ibgeId}`} /> }] : []),
            ]} />
            <p className="mt-4 text-xs text-muted">Código IBGE {ibgeId} · <ExternalLink href={`https://cidades.ibge.gov.br/brasil/${(uf || "").toLowerCase()}/${ibgeId}`}>IBGE Cidades</ExternalLink></p>
          </ModoDetalhado>
        </>
      )}

      {/* q.isPending não mostra próximos passos; QuemMandouSkeleton cobre a 1ª tela */}
      {q.isPending && <div className="mt-4"><QuemMandouSkeleton /></div>}
      {uf && (
        <NextSteps items={[
          { to: `/uf/${uf}`, label: `Outras cidades de ${nomeUf}`, desc: "Compare com as vizinhas." },
          { to: `/deputados?uf=${uf}`, label: `Deputados de ${nomeUf}`, desc: "Quem representa seu estado em Brasília." },
          { to: "/pix", label: "Dinheiro sem dizer para quê", desc: "Onde mais isso acontece." },
        ]} />
      )}
    </>
  );
}
