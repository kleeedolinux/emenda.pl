import { useState } from "react";
import { dataPath, type Beneficiados } from "@emenda/contracts";
import { Card, ErrorState, ExternalLink, Section, Skeleton, Stat, StatGrid, useApi } from "@/ui";
import { formatBRL } from "@/lib/format";
import { ListaBeneficiados, privados, type FiltroPrivados } from "@/features/beneficiados";
import { CABECALHOS, CabecalhoPagina } from "@/features/linguagem";
import { ShareButton } from "@/features/share";
import { nomeLeigo } from "@/lib/nomes";

const brl = (n: number) => formatBRL(Math.round(n), true);
const FILTROS: Array<[FiltroPrivados, string]> = [["todos", "Todos"], ["empresas", "Empresas"], ["entidades", "Sem fins lucrativos"]];

export default function QuemRecebePage() {
  const q = useApi<Beneficiados>(dataPath.beneficiados());
  const [filtro, setFiltro] = useState<FiltroPrivados>("todos");
  const b = q.data;
  const topo = b?.empresas[0];
  return (
    <>
      <CabecalhoPagina
        c={CABECALHOS.quemRecebe}
        breadcrumbs={[{ label: "Início", to: "/" }, { label: "Quem mais recebe" }]}
        actions={b ? <ShareButton fab kind="pagina" title="Quem mais recebe" text={`${brl(b.totais.empresas + b.totais.entidades)} mandados por políticos foram para empresas e entidades privadas${topo ? `. A que mais recebeu: ${nomeLeigo(topo.nome)}` : ""}. Veja a lista:`} url="/quem-recebe" /> : undefined}
      />
      {q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : !b ? <Skeleton className="h-64 rounded-3xl" /> : (
        <>
          <StatGrid>
            <Stat label="Empresas privadas" value={brl(b.totais.empresas)} />
            <Stat label="Entidades sem fins lucrativos" value={brl(b.totais.entidades)} />
            <Stat label="Fundos públicos" value={brl(b.totais.fundos)} />
          </StatGrid>

          <Section title="Empresas e entidades privadas" tip="Empresas (Ltda, S.A., cooperativas) e entidades sem fins lucrativos (associações, fundações, organizações sociais). Bancos e empresas do governo, como Caixa e Banco do Brasil, ficam de fora: eles só repassam o dinheiro.">
            <Card>
              <div className="mb-2 flex flex-wrap gap-2" role="group" aria-label="Tipo">
                {FILTROS.map(([k, label]) => (
                  <button key={k} type="button" aria-pressed={filtro === k} onClick={() => setFiltro(k)}
                    className="min-h-11 rounded-full border border-line px-4 text-sm font-semibold aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-white">{label}</button>
                ))}
              </div>
              <ListaBeneficiados key={filtro} itens={privados(b, filtro)} />
            </Card>
          </Section>

          <Section id="fundos" title="Fundos públicos" tip="Contas da prefeitura ou do estado para uma área, como o fundo de saúde. O dinheiro continua público e é gasto pelo governo local.">
            <Card><ListaBeneficiados itens={b.fundos} /></Card>
          </Section>

          <p className="text-xs text-muted">Soma de todos os pagamentos de cada um desde o início dos dados. Oficialmente: favorecidos de emendas parlamentares. Fonte: <ExternalLink href="https://portaldatransparencia.gov.br/emendas">Portal da Transparência</ExternalLink>.</p>
        </>
      )}
    </>
  );
}
