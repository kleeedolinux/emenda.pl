import { Link, useParams } from "react-router";
import { dataPath, gastosPath, type Beneficiados, type GastosFornecedores, type GastosRanking } from "@emenda/contracts";
import { Avatar, Card, ErrorState, PartyBadge, Section, Skeleton, Stat, StatGrid, useApi } from "@/ui";
import { fotoDeputado, fotoSenador } from "@/lib/cdn";
import { formatBRL, formatNumber } from "@/lib/format";
import { nomeLeigo } from "@/lib/nomes";
import { CabecalhoPagina, ListaVerMais } from "@/features/linguagem";
import { Documento } from "@/features/beneficiados";
import { GRUPOS, empresaDe } from "@/features/contratadas/contratadas";
import { ShareButton } from "@/features/share";

const brl = (n: number) => formatBRL(Math.round(n), true);

export default function EmpresaPage() {
  const { cnpj = "" } = useParams();
  const forn = useApi<GastosFornecedores>(gastosPath.fornecedores());
  const ben = useApi<Beneficiados>(dataPath.beneficiados());
  const rk = useApi<GastosRanking>(gastosPath.ranking());
  const pronto = !forn.isPending && !ben.isPending;
  const e = pronto ? empresaDe(cnpj, forn.data, ben.data, rk.data) : null;
  const nome = e ? nomeLeigo(e.nome) : "Empresa";
  const top = e?.contratantes[0];
  const texto = e
    ? e.cota > 0
      ? `${nome} recebeu ${brl(e.cota)} de ${formatNumber(e.parlamentares)} deputados e senadores, com dinheiro público.${top ? ` Quem mais contratou: ${top.nome} (${brl(top.valor)}).` : ""} Veja quem contratou:`
      : `${nome} recebeu ${brl(e.emendas)} de dinheiro mandado por políticos. Veja:`
    : "";

  if (forn.isError && ben.isError) return <ErrorState error={forn.error} retry={() => forn.refetch()} />;
  return (
    <>
      <CabecalhoPagina
        c={{ titulo: nome, subtitulo: e ? "Quanto esta empresa recebeu de deputados e senadores e quem a contratou." : "Carregando…" }}
        breadcrumbs={[{ label: "Início", to: "/" }, { label: "Empresas contratadas", to: "/empresas-contratadas" }, { label: nome }]}
        actions={e ? <ShareButton fab kind="pagina" title={nome} text={texto} url={`/empresa/${cnpj}`} /> : undefined}
      />
      {!pronto ? <Skeleton className="h-64 rounded-3xl" /> : !e ? (
        <Card><p>Esta empresa não está entre as que mais receberam. Veja a ficha completa no <a className="link" href={`https://portaldatransparencia.gov.br/pessoa-juridica/${cnpj}`} target="_blank" rel="noopener noreferrer">Portal da Transparência</a>.</p></Card>
      ) : (
        <>
          <p className="mb-4 text-sm text-muted">CNPJ <Documento d={e.cnpj} /></p>
          <StatGrid>
            {e.cota > 0 && <Stat label="Pago por políticos com a cota" value={brl(e.cota)} hint={`${formatNumber(e.parlamentares)} deputados e senadores`} />}
            {e.emendas > 0 && <Stat label="Recebido de dinheiro mandado por políticos" value={brl(e.emendas)} />}
          </StatGrid>
          {e.cota > 0 && <p className="mt-3 text-lg">Contratada por <b>{formatNumber(e.parlamentares)} deputados e senadores</b>, pagos com dinheiro público.</p>}

          {e.grupos.length > 0 && (
            <Section title="No que foi contratada">
              <Card>
                <ul className="divide-y divide-line">
                  {e.grupos.map((g) => (
                    <li key={g.grupo}><Link to={`/empresas-contratadas?tipo=${g.grupo}`} className="flex min-h-11 items-center justify-between gap-2 py-2 hover:text-accent"><span>{GRUPOS[g.grupo].rotulo}</span><b className="tabular">{brl(g.valor)}</b></Link></li>
                  ))}
                </ul>
              </Card>
            </Section>
          )}

          {e.contratantes.length > 0 && (
            <Section title="Quem mais contratou" tip="Os deputados e senadores que mais pagaram esta empresa com a cota parlamentar.">
              <Card>
                <ListaVerMais itens={e.contratantes} inicial={10} chave={(c) => `${c.casa}-${c.id}`} className="divide-y divide-line" render={(c, i) => (
                  <Link to={`${c.href}#gastos`} className="flex min-h-11 items-center gap-2 py-2 hover:text-accent">
                    <span className="w-5 shrink-0 text-right text-xs text-muted tabular">{i + 1}</span>
                    <Avatar src={c.casa === "camara" ? fotoDeputado(c.id) : fotoSenador(c.id)} name={c.nome} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-medium">{c.nome}</span>
                      <span className="flex flex-wrap items-center gap-1 text-xs text-muted">{c.partido && <PartyBadge sigla={c.partido} link={false} />}{c.uf}<b className="ml-auto text-sm text-fg tabular">{brl(c.valor)}</b></span>
                    </span>
                  </Link>
                )} />
              </Card>
            </Section>
          )}
          <p className="mt-4 text-xs text-muted">Fontes: Câmara e Senado (cota parlamentar) e Portal da Transparência (emendas). Mostramos só as empresas entre as maiores de cada tipo.</p>
        </>
      )}
    </>
  );
}
