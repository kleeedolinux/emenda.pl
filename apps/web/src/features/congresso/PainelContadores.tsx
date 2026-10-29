// Contadores ao vivo (estimativas rotuladas) a partir de dados oficiais.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { useReducedMotion } from "motion/react";
import { Coins, Landmark, Receipt } from "lucide-react";
import { Bars, Card, ExternalLink, Skeleton, Tip, useActive } from "@/ui";
import { formatBRL } from "@/lib/format";
import { gastosPath } from "@emenda/contracts";
import { mesAno } from "@/features/gastos/gastos";
import { custoCotaAno, estimativaArrecadacao, rotuloTributo, ARRECADACAO_PATH } from "./contadores";
import { useArrecadacao, useBrasil, useGastosRanking } from "./hooks";

const brl0 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const reais = (c: number) => brl0.format(Math.floor(c / 100));

/** Valor que cresce em tempo real (pausa fora da tela; com movimento reduzido, atualiza 1x/s). */
function Ticker({ base, porSegundo, desde, className }: { base: number; porSegundo: number; desde: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const ativo = useActive(ref);
  const reduce = useReducedMotion();
  const calc = () => base + porSegundo * Math.max(0, (Date.now() - desde) / 1000);
  const [v, setV] = useState(calc);
  useEffect(() => {
    if (!ativo) return;
    const id = setInterval(() => setV(calc()), reduce ? 1000 : 120);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, reduce, base, porSegundo, desde]);
  return <span ref={ref} className={`tabular ${className ?? ""}`} aria-live="off">{reais(v)}</span>;
}

function Contador({ icone, titulo, valor, sub, tip, fonte }: { icone: ReactNode; titulo: string; valor: ReactNode; sub: ReactNode; tip: ReactNode; fonte: ReactNode }) {
  return (
    <article className="card relative overflow-hidden p-5">
      <span className="pointer-events-none absolute -top-10 -right-10 size-32 rounded-full bg-verde/10 blur-2xl" aria-hidden />
      <header className="flex items-center gap-2 text-sm font-semibold text-muted">
        <span className="inline-flex size-8 items-center justify-center rounded-xl bg-surface-2 text-fg">{icone}</span>
        <span className="flex-1">{titulo}</span>
        <Tip content={tip} label="Como calculamos" />
      </header>
      <p className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">{valor}</p>
      <p className="mt-1 text-sm text-muted">{sub}</p>
      <p className="mt-3 text-xs text-muted">{fonte}</p>
    </article>
  );
}

export function Contadores() {
  const arr = useArrecadacao();
  const ranking = useGastosRanking();
  const brasil = useBrasil();
  const agora = useMemo(() => Date.now(), []);
  const est = arr.data ? estimativaArrecadacao(arr.data, agora) : null;
  const ano = new Date().getFullYear();
  const cota = ranking.data?.dadosAte.camara ? custoCotaAno(ranking.data.parlamentares, ano, ranking.data.dadosAte.camara) : null;
  const emendasAno = brasil.data?.porAno.find((p) => p.ano === ano) ?? null;
  const inicioAno = Date.UTC(ano, 0, 1, 3);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {arr.isPending ? <Skeleton className="h-48" /> : est ? (
        <Contador
          icone={<Landmark className="size-4" aria-hidden />}
          titulo={`Arrecadação federal em ${est.ano} (estimativa)`}
          valor={<Ticker base={est.oficial} porSegundo={est.porSegundo} desde={est.desde} className="text-verde-700 dark:text-[#5fe39a]" />}
          sub={<>Oficial até {mesAno(est.ate)}: <b className="tabular">{formatBRL(est.oficial, true)}</b>. Ritmo médio: {formatBRL(Math.round(est.porSegundo))} por segundo.</>}
          tip={<>Soma oficial dos meses já publicados pela Receita Federal neste ano (receitas administradas pela Receita, sem as de outros órgãos). A partir do fim do último mês publicado, o contador soma o ritmo médio dos últimos 12 meses publicados. É uma <b>estimativa</b>: o valor real só se conhece quando a Receita publica o mês.</>}
          fonte={<>Fonte: <ExternalLink href={arr.data!.fonte}>Receita Federal — arrecadação por estado (dados abertos)</ExternalLink> · <a className="link" href={ARRECADACAO_PATH}>JSON</a></>}
        />
      ) : (
        <Contador
          icone={<Landmark className="size-4" aria-hidden />} titulo="Arrecadação federal" valor={<span className="text-muted">Em preparação</span>}
          sub="A série mensal da Receita Federal ainda não foi publicada neste site."
          tip="Quando disponível, mostramos a soma oficial do ano e uma estimativa ao vivo baseada no ritmo dos últimos 12 meses."
          fonte={<ExternalLink href="https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/dados-abertos/receitadata/arrecadacao">Receita Federal — dados de arrecadação</ExternalLink>}
        />
      )}

      {ranking.isPending ? <Skeleton className="h-48" /> : cota ? (
        <Contador
          icone={<Receipt className="size-4" aria-hidden />}
          titulo={`Cota parlamentar em ${ano}`}
          valor={<Ticker base={0} porSegundo={cota.porSegundo} desde={inicioAno} />}
          sub={<>Ritmo de {formatBRL(Math.round(cota.porSegundo * 60))} por minuto. Já publicado: <b className="tabular">{formatBRL(cota.total, true)}</b> até {mesAno(ranking.data!.dadosAte.camara)}.</>}
          tip="Reembolsos da cota para o exercício da atividade parlamentar (CEAP na Câmara, CEAPS no Senado). O contador distribui o total publicado no ano pelo tempo decorrido até o último mês com dados e projeta esse ritmo até agora. Não inclui salários, gabinete e demais custos das Casas."
          fonte={<>Fonte: Câmara e Senado (dados abertos da cota) · <a className="link" href={gastosPath.ranking()}>JSON</a> · <Link className="link" to="/deputados?view=gastos">quem mais gasta</Link></>}
        />
      ) : null}

      {brasil.isPending ? <Skeleton className="h-48" /> : emendasAno ? (
        <Contador
          icone={<Coins className="size-4" aria-hidden />}
          titulo={`Emendas parlamentares pagas em ${ano}`}
          valor={<span className="tabular">{formatBRL(emendasAno.pago, true)}</span>}
          sub={<>{emendasAno.n.toLocaleString("pt-BR")} emendas com movimento no ano. Empenhado: {formatBRL(emendasAno.empenhado, true)}.</>}
          tip="Valor pago no ano das emendas indicadas por deputados, senadores, bancadas e comissões, segundo o Portal da Transparência. É dinheiro do orçamento destinado por decisão do Congresso, não custo de funcionamento."
          fonte={<>Fonte: <ExternalLink href="https://portaldatransparencia.gov.br/emendas">Portal da Transparência</ExternalLink> · <Link className="link" to="/emendas">ver o dinheiro</Link></>}
        />
      ) : null}
    </div>
  );
}

/** Composição da arrecadação do ano (tributos), quando o arquivo existe. */
export function Tributos() {
  const arr = useArrecadacao();
  if (!arr.data?.tributos.length) return null;
  const ano = arr.data.ate.slice(0, 4);
  return (
    <Card title={`De onde vem a arrecadação (${ano}, até ${mesAno(arr.data.ate)})`} tip="Receitas administradas pela Receita Federal, por tributo, somando todos os estados.">
      <Bars data={arr.data.tributos.slice(0, 10).map((t) => ({ label: rotuloTributo(t.nome), value: t.valor }))} format={(n) => formatBRL(n, true)} />
    </Card>
  );
}
