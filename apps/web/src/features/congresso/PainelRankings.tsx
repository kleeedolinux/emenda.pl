// Rankings, destaques e comparação de partidos a partir de dados oficiais.
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowLeftRight, CalendarCheck, Coins, Handshake, Receipt } from "lucide-react";
import { Card, EmptyState, PartyBadge, Skeleton, Tabs, formatNumber, formatPct, partyColor } from "@/ui";
import { formatBRL } from "@/lib/format";
import { Segmentado } from "@/features/legislativo/components";
import { mesAno } from "@/features/gastos/gastos";
import { chaveMembro, type Membro } from "./composicao";
import { LEG_ATUAL, anosDaLegislatura, type FiltrosCongresso } from "./filtros";
import {
  campeoesCategoria, comparativoPartidos, destaques, emendasLinhas, gastosLinhas, presencaFidelidadeCamara, presencaSenado, ranking, trocasLinhas,
  type Linha, type Posicionada,
} from "./rankings";
import {
  AMOSTRA_CAMARA, JANELA_DIAS, TIPOS_PRODUCAO, useAmostraCamara, useAutores, useGastosRanking, useListaLegislatura, useProducaoDeputados,
  type useVotacoesCamara, type useVotacoesSenado,
} from "./hooks";
import { CardDestaque, CardRanking, Metodo } from "./ui";

const brl = (n: number) => formatBRL(n, true);
const pct = (n: number) => formatPct(n);

export interface DadosRankings {
  gastos: Linha[] | null;
  emendas: Linha[] | null;
  presenca: Array<Linha & { total: number }> | null;
  fidelidade: Array<Linha & { n: number }> | null;
  trocas: Array<Linha & { partidos: string[] }> | null;
  coesao: Map<string, number> | null;
  amostraCamara: number;
  votacoesSenado: number;
}

/** Junta todas as fontes num só objeto (memoizado) para rankings, destaques, partidos e repositório. */
export function useDadosRankings(
  membros: Membro[], f: FiltrosCongresso,
  vc: ReturnType<typeof useVotacoesCamara>, vs: ReturnType<typeof useVotacoesSenado>,
): DadosRankings {
  const r = useGastosRanking();
  const autores = useAutores();
  const amostra = useAmostraCamara(f.leg === LEG_ATUAL ? vc.data : undefined);
  const lista = useListaLegislatura(f.leg);
  return useMemo(() => {
    const pres = amostra.data ? presencaFidelidadeCamara(amostra.data, membros) : null;
    const ps = vs.data ? presencaSenado(vs.data) : null;
    const presenca = pres && ps ? membros.flatMap((m) => {
      const p = m.casa === "camara" ? pres.presenca.get(m.id) : ps.get(m.id);
      return p && p.total > 0 ? [{ membro: m, valor: p.pct, total: p.total }] : [];
    }) : null;
    const fidelidade = pres ? membros.flatMap((m) => {
      const x = pres.fidelidade.get(m.id);
      return m.casa === "camara" && x && x.seguiu + x.contrariou >= 5 ? [{ membro: m, valor: x.pct, n: x.seguiu + x.contrariou }] : [];
    }) : null;
    return {
      gastos: r.data ? gastosLinhas(r.data, membros, "mandato").filter((l) => l.valor > 0) : null,
      emendas: autores.data ? emendasLinhas(membros, autores.data.idx).filter((l) => l.valor > 0) : null,
      presenca, fidelidade,
      trocas: lista.data ? trocasLinhas(lista.data, membros) : null,
      coesao: pres?.coesao ?? null,
      amostraCamara: amostra.data?.length ?? 0,
      votacoesSenado: vs.data?.length ?? 0,
    };
  }, [r.data, autores.data, amostra.data, vs.data, lista.data, membros]);
}

export function Destaques({ d }: { d: DadosRankings }) {
  const g = d.gastos ? destaques(d.gastos) : null;
  const e = d.emendas ? destaques(d.emendas) : null;
  const p = d.presenca ? destaques(d.presenca.map((x) => ({ ...x, valor: x.valor + 1e-9 }))) : null;
  const fi = d.fidelidade ? destaques(d.fidelidade.map((x) => ({ ...x, valor: x.valor + 1e-9 }))) : null;
  const t = d.trocas?.[0] ?? null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <CardDestaque icone={<Receipt className="size-4" />} titulo="Cota parlamentar no mandato" mais={g?.mais ?? null} menos={g?.menos ?? null} formato={brl} tip="Reembolsos da cota desde o início da legislatura. 'Menos' considera só quem teve algum gasto." />
      <CardDestaque icone={<Coins className="size-4" />} titulo="Emendas pagas (histórico)" mais={e?.mais ?? null} menos={e?.menos ?? null} formato={brl} tip="Valor pago de emendas indicadas pelo parlamentar, segundo o Portal da Transparência (cruzamento por nome)." />
      <CardDestaque icone={<CalendarCheck className="size-4" />} titulo="Presença em votações nominais" mais={p?.mais ?? null} menos={p?.menos ?? null} formato={pct} tip={`Amostra: últimas ${AMOSTRA_CAMARA} votações nominais da Câmara e as do Senado nos últimos ${JANELA_DIAS} dias.`} />
      <CardDestaque icone={<Handshake className="size-4" />} titulo="Segue a orientação do partido" mais={fi?.mais ?? null} menos={fi?.menos ?? null} formato={pct} tip="Câmara: votos Sim/Não iguais à orientação Sim/Não do próprio partido na amostra (mínimo 5 votos comparáveis)." />
      <CardDestaque icone={<ArrowLeftRight className="size-4" />} titulo="Mais trocas de partido na legislatura" mais={t} formato={(n) => `${n} ${n === 1 ? "troca" : "trocas"}`} tip="Mudanças de sigla registradas na lista oficial de deputados da legislatura." />
    </div>
  );
}

export function Rankings({ membros, d, f, url }: { membros: Membro[]; d: DadosRankings; f: FiltrosCongresso; url: string }) {
  const r = useGastosRanking();
  const share = (label: string, metric: "brl" | "int") => ({ metric, label, url });
  const anoCat = r.data?.anos.at(-1) ?? new Date().getFullYear();
  const [casaCat, setCasaCat] = useState<"camara" | "senado">(f.casa === "senado" ? "senado" : "camara");
  const campeoes = r.data ? campeoesCategoria(r.data, casaCat, anoCat, membros) : null;
  const metodoVotos = `Amostra: ${d.amostraCamara} votações nominais mais recentes do Plenário da Câmara e ${d.votacoesSenado} do Senado (últimos ${JANELA_DIAS} dias).`;

  const tabs = [
    {
      id: "gastos", label: "Cota parlamentar",
      content: (
        <div className="grid gap-4 lg:grid-cols-2">
          <CardRanking titulo="Quem mais usou a cota no mandato" tip="Soma dos reembolsos da cota (CEAP/CEAPS) desde o início da legislatura atual." linhas={d.gastos ? ranking(d.gastos) : null} formato={brl} share={share("na cota", "brl")}
            rodape={<>Dados até {mesAno(r.data?.dadosAte.camara)} (Câmara) e {mesAno(r.data?.dadosAte.senado)} (Senado). Detalhe por nota fiscal no perfil de cada um.</>} />
          <CardRanking titulo="Quem menos usou a cota no mandato" tip="Mesmo cálculo, do menor para o maior, só com quem teve algum reembolso. Quem assumiu há pouco tempo aparece naturalmente com menos." linhas={d.gastos ? ranking(d.gastos, "asc") : null} formato={brl} share={share("na cota", "brl")} />
          <Card title={`Quem mais gastou em cada tipo de despesa (${anoCat})`} tip="Para cada categoria da cota, o total da Casa e o parlamentar do recorte com maior gasto (entre os 5 maiores da categoria)." className="lg:col-span-2">
            <div className="mb-3"><Segmentado label="Casa" value={casaCat} onChange={setCasaCat} options={[{ value: "camara", label: "Câmara" }, { value: "senado", label: "Senado" }]} /></div>
            {!campeoes ? <Skeleton className="h-60" /> : !campeoes.length ? <EmptyState title="Sem categorias neste ano." /> : (
              <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {campeoes.map((c) => (
                  <li key={c.categoria} className="rounded-xl border border-line p-3">
                    <p className="text-sm font-semibold">{c.categoria}</p>
                    <p className="text-xs text-muted">Total da Casa: <span className="tabular">{brl(c.valor)}</span></p>
                    {c.membro ? (
                      <p className="mt-1 text-sm">Maior: <Link className="link font-medium" to={`${c.membro.href}#gastos`}>{c.membro.nome}</Link> <span className="text-xs text-muted">({c.membro.partido}-{c.membro.uf}) · <span className="whitespace-nowrap tabular">{brl(c.valorMembro)}</span></span></p>
                    ) : <p className="mt-1 text-xs text-muted">Maior gasto fora do recorte atual.</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ),
    },
    {
      id: "emendas", label: "Emendas pagas",
      content: (
        <div className="grid gap-4 lg:grid-cols-2">
          <CardRanking titulo="Quem mais teve emendas pagas" tip="Valor pago de emendas individuais indicadas pelo parlamentar (todos os anos disponíveis), do Portal da Transparência. Cruzamento por nome; homônimos raros podem não casar." linhas={d.emendas ? ranking(d.emendas) : null} formato={brl} share={share("em emendas pagas", "brl")} />
          <CardRanking titulo="Quem menos teve emendas pagas" tip="Mesmo cálculo, do menor para o maior, só com quem teve algum pagamento." linhas={d.emendas ? ranking(d.emendas, "asc") : null} formato={brl} share={share("em emendas pagas", "brl")} />
        </div>
      ),
    },
    {
      id: "presenca", label: "Presença",
      content: (
        <div className="grid gap-4 lg:grid-cols-2">
          <CardRanking titulo="Maior presença em votações nominais" tip={<>{metodoVotos} Presença = votações com voto registrado ÷ votações da amostra. No Senado, licenças e missões oficiais não contam como falta.</>}
            linhas={d.presenca ? ranking(d.presenca) : null} formato={pct} rotulo={(l) => `${pct(l.valor)}`} share={share("de presença", "int")} carregando={<CarregandoVotos />} rodape={metodoVotos} />
          <CardRanking titulo="Menor presença em votações nominais" tip="Na Câmara, licenças não aparecem na lista de votos e contam como ausência; suplentes que assumiram no meio da amostra também têm presença menor." linhas={d.presenca ? ranking(d.presenca, "asc") : null} formato={pct} share={share("de presença", "int")} carregando={<CarregandoVotos />} />
        </div>
      ),
    },
    {
      id: "fidelidade", label: "Orientação do partido",
      content: f.leg !== LEG_ATUAL ? <EmptyState title="Disponível só para a legislatura atual." /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          <CardRanking titulo="Mais seguem a orientação do partido" tip={<>{metodoVotos} Conta só votos Sim/Não quando o líder do partido orientou Sim ou Não. Mínimo de 5 votos comparáveis.</>}
            linhas={d.fidelidade ? ranking(d.fidelidade) : null} formato={pct} share={share("de alinhamento", "int")} carregando={<CarregandoVotos />} />
          <CardRanking titulo="Mais votam diferente do partido" tip="Mesmo cálculo, do menor alinhamento para o maior. Votar contra a orientação não é bom nem ruim por si — é um dado." linhas={d.fidelidade ? ranking(d.fidelidade, "asc") : null} formato={pct} share={share("de alinhamento", "int")} carregando={<CarregandoVotos />} />
        </div>
      ),
    },
    { id: "producao", label: "Proposições", content: <Producao membros={membros} f={f} url={url} /> },
    {
      id: "trocas", label: "Trocas de partido",
      content: (
        <CardRanking titulo="Quem mais trocou de partido nesta legislatura" tip="A lista oficial de deputados da legislatura repete a pessoa a cada mudança de sigla. Mostra a sequência de partidos." linhas={d.trocas ? ranking(d.trocas) : null}
          formato={(n) => `${n}×`} rotulo={(l) => (l as Posicionada<Linha & { partidos: string[] }>).partidos.join(" → ")} share={share("trocas de partido", "int")}
          vazio={<EmptyState title="Ninguém no recorte trocou de partido nesta legislatura." hint="Senadores: veja o histórico de filiações no perfil de cada um." />} />
      ),
    },
  ];
  return <Tabs tabs={tabs} param="ranking" />;
}

function CarregandoVotos() {
  return <div className="space-y-2"><Skeleton className="h-60" /><p className="text-xs text-muted">Somando os votos das últimas votações (Câmara e Senado)…</p></div>;
}

/** Proposições apresentadas por deputado: uma contagem por pessoa, só quando pedido. */
function Producao({ membros, f, url }: { membros: Membro[]; f: FiltrosCongresso; url: string }) {
  const [ativo, setAtivo] = useState(false);
  const deps = membros.filter((m) => m.casa === "camara");
  const anos = anosDaLegislatura(f.leg);
  const qs = useProducaoDeputados(deps.map((m) => m.id), anos, ativo);
  const prontos = qs.filter((q) => q.isSuccess).length;
  const linhas = useMemo(() => (ativo && prontos === qs.length && qs.length ? ranking(deps.map((m, i) => ({ membro: m, valor: qs[i]!.data ?? 0 }))) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ativo, prontos, deps.length]);
  if (!ativo) {
    return (
      <Card title="Quem mais apresentou proposições" tip={`Projetos de lei (PL), de lei complementar (PLP) e propostas de emenda à Constituição (PEC) com o deputado entre os autores, de ${anos[0]} a ${anos.at(-1)}.`}>
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted">Precisa de uma consulta por deputado ({formatNumber(deps.length)} chamadas à API da Câmara). Filtre por partido ou UF para ir mais rápido.</p>
          <button type="button" onClick={() => setAtivo(true)} className="press rounded-xl bg-verde px-4 py-2 text-sm font-semibold text-white">Calcular ranking</button>
          <Metodo>Senado: veja as autorias no perfil de cada senador.</Metodo>
        </div>
      </Card>
    );
  }
  return (
    <CardRanking titulo={`Quem mais apresentou proposições (${anos[0]}–${anos.at(-1)})`} tip={`Conta ${TIPOS_PRODUCAO.join(", ")} com o deputado como autor ou coautor. Quantidade não mede qualidade nem aprovação.`}
      linhas={linhas} formato={(n) => formatNumber(n)} share={{ metric: "int", label: "proposições", url }}
      carregando={<div className="space-y-2"><Skeleton className="h-60" /><p className="text-xs text-muted">Contando… {formatNumber(prontos)} de {formatNumber(qs.length)} deputados.</p></div>} />
  );
}

/** Partidos lado a lado, em cartões. */
export function Partidos({ membros, d }: { membros: Membro[]; d: DadosRankings }) {
  const cards = useMemo(() => comparativoPartidos(membros, {
    gastos: new Map((d.gastos ?? []).map((l) => [chaveMembro(l.membro), l.valor])),
    emendas: new Map((d.emendas ?? []).map((l) => [chaveMembro(l.membro), l.valor])),
    coesao: d.coesao ?? new Map(),
  }), [membros, d.gastos, d.emendas, d.coesao]);
  const maxTotal = Math.max(1, ...cards.map((c) => c.total));
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {cards.map((c) => (
        <li key={c.partido} className="card relative overflow-hidden p-4">
          <span className="absolute inset-x-0 top-0 h-1" style={{ background: partyColor(c.partido) }} aria-hidden />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link to={`/partido/${encodeURIComponent(c.partido)}`} className="min-w-0 text-lg font-black hover:underline">{c.partido}</Link>
            <PartyBadge sigla={c.partido} link={false} />
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden><span className="block h-full rounded-full" style={{ width: `${(c.total / maxTotal) * 100}%`, background: partyColor(c.partido) }} /></div>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <Item k="Deputados" v={formatNumber(c.camara)} />
            <Item k="Senadores" v={formatNumber(c.senado)} />
            <Item k="Mulheres" v={c.total ? formatPct(c.mulheres / c.total) : "—"} />
            <Item k="Coesão" v={c.coesao === null ? "—" : formatPct(c.coesao)} tip="Índice de Rice médio na amostra de votações da Câmara: 100% = todos votaram igual." />
            <Item k="Cota média" v={c.gastoMedio === null ? "—" : brl(c.gastoMedio)} tip="Média por parlamentar no mandato." />
            <Item k="Emendas pagas" v={c.emendas ? brl(c.emendas) : "—"} tip="Soma da bancada atual (histórico)." />
          </dl>
        </li>
      ))}
    </ul>
  );
}
function Item({ k, v, tip }: { k: string; v: string; tip?: string }) {
  return <div title={tip}><dt className="text-[11px] uppercase tracking-wider text-muted">{k}</dt><dd className="tabular font-semibold">{v}</dd></div>;
}

