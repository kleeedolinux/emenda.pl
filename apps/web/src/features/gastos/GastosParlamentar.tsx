import { useMemo } from "react";
import { gastosPath, type GastoFornecedor, type GastoItem, type GastoPessoa, type GastosParlamentarData, type KindParlamentar } from "@emenda/contracts";
import {
  Bars, Card, DataTable, EmptyState, ErrorState, ExternalLink, HttpError, KeyValue, Money, Skeleton, Stat, StatGrid, Tip,
  formatDate, formatNumber, formatPct, useApi, type Column,
} from "@/ui";
import { corCategoria } from "@/lib/colors";
import { formatBRL } from "@/lib/format";
import { empilhado, formatCnpjCpf, kpis, linkFornecedor, mesAno, rotuloCategoria, totalCota } from "./gastos";
import { O_QUE_E } from "./textos";

const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const dataItem = (d: string) => (d.length === 10 ? formatDate(d) : mesAno(d));

function Empilhadas({ g }: { g: GastosParlamentarData }) {
  const e = useMemo(() => empilhado(g.porCategoriaAno, 6), [g.porCategoriaAno]);
  if (!e.anos.length) return <EmptyState title="Sem despesas da cota publicadas." />;
  return (
    <div>
      <ul className="space-y-2" aria-label="Gasto da cota por ano e categoria">
        {e.anos.map((a) => (
          <li key={a.ano} className="grid grid-cols-[3rem_1fr_auto] items-center gap-2 text-sm">
            <span className="tabular text-muted">{a.ano}</span>
            <span className="flex h-5 overflow-hidden rounded-md bg-surface-2" style={{ width: `${e.max > 0 ? Math.max(2, (Math.max(0, a.total) / e.max) * 100) : 0}%` }}>
              {a.partes.map((v, i) =>
                v > 0 ? (
                  <span key={i} title={`${rotuloCategoria(e.categorias[i]!)}: ${formatBRL(v)}`} style={{ width: `${(v / Math.max(1, a.total)) * 100}%`, background: corCategoria(i) }} />
                ) : null,
              )}
            </span>
            <Money centavos={a.total} compact className="text-right font-semibold" />
          </li>
        ))}
      </ul>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {e.categorias.map((c, i) => (
          <li key={c} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: corCategoria(i) }} aria-hidden />
            {rotuloCategoria(c)}
          </li>
        ))}
      </ul>
    </div>
  );
}

const colsForn: Column<GastoFornecedor>[] = [
  { key: "nome", header: "Fornecedor", sort: true, cell: (r) => <span className="font-medium">{r.nome || "—"}</span> },
  {
    key: "cnpjCpf", header: "CNPJ/CPF", tip: "CNPJ",
    cell: (r) => { const l = linkFornecedor(r.cnpjCpf); return l ? <ExternalLink href={l}>{formatCnpjCpf(r.cnpjCpf)}</ExternalLink> : <span className="tabular">{formatCnpjCpf(r.cnpjCpf)}</span>; },
    csv: (r) => r.cnpjCpf,
  },
  { key: "n", header: "Notas", align: "right", sort: true, cell: (r) => formatNumber(r.n) },
  { key: "valor", header: "Recebeu", align: "right", sort: true, cell: (r) => <Money centavos={r.valor} />, csv: (r) => r.valor / 100 },
];

const colsItens: Column<GastoItem>[] = [
  { key: "data", header: "Data", sort: true, cell: (r) => <span className="tabular whitespace-nowrap">{dataItem(r.data)}</span>, csv: (r) => r.data },
  { key: "categoria", header: "Categoria", sort: true, cell: (r) => rotuloCategoria(r.categoria) },
  { key: "fornecedor", header: "Fornecedor", sort: true, cell: (r) => <span>{r.fornecedor}{r.det && <span className="block text-xs text-muted">{r.det}</span>}</span> },
  {
    key: "cnpjCpf", header: "CNPJ/CPF",
    cell: (r) => { const l = linkFornecedor(r.cnpjCpf); return l ? <ExternalLink href={l}>{formatCnpjCpf(r.cnpjCpf)}</ExternalLink> : <span className="tabular">{formatCnpjCpf(r.cnpjCpf)}</span>; },
    csv: (r) => r.cnpjCpf,
  },
  { key: "valor", header: "Valor", align: "right", sort: true, cell: (r) => <Money centavos={r.valor} />, csv: (r) => r.valor / 100 },
  { key: "url", header: "Nota", cell: (r) => (r.url ? <ExternalLink href={r.url}>ver</ExternalLink> : "—"), csv: (r) => r.url ?? "" },
];

const colsPessoal = (comRem: boolean, comLocal: boolean): Column<GastoPessoa>[] => [
  { key: "nome", header: "Nome", sort: true, cell: (r) => <span className="font-medium">{r.nome}</span> },
  { key: "cargo", header: "Cargo", sort: true, cell: (r) => <span>{r.cargo || "—"}<span className="block text-xs text-muted">{r.grupo}</span></span>, csv: (r) => `${r.grupo} ${r.cargo}`.trim() },
  ...(comLocal ? [{ key: "local", header: "Lotação", sort: true, cell: (r: GastoPessoa) => r.local ?? "—" }] : []),
  { key: "desde", header: "Desde", sort: true, cell: (r) => (r.desde && r.desde.length === 10 ? formatDate(r.desde) : (r.desde ?? "—")) },
  ...(comRem ? [{ key: "remuneracao", header: "Remuneração bruta", align: "right" as const, sort: true, tip: "Remuneração bruta fixa do mês de referência (sem horas extras, diárias e eventuais).", cell: (r: GastoPessoa) => <Money centavos={r.remuneracao ?? null} />, csv: (r: GastoPessoa) => (r.remuneracao ?? 0) / 100 }] : []),
];

/** Hook dos gastos do parlamentar (mesma chave de cache da versão completa). */
export function useGastosParlamentar(kind: KindParlamentar, id: string | number | null) {
  return useApi<GastosParlamentarData>(id ? gastosPath.parlamentar(kind, id) : null);
}

/** Resumo curto: total da cota no mandato, média por mês, 3 maiores categorias e 3 maiores fornecedores. */
export function GastosResumo({ kind, id }: { kind: KindParlamentar; id: string | number }) {
  const q = useGastosParlamentar(kind, id);
  if (q.isError) return <EmptyState title="Ainda não há dados de gastos para este parlamentar." />;
  if (q.isPending) return <Skeleton className="h-40" />;
  const g = q.data;
  const k = totalCota(g);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <p className="text-sm text-muted">Gastou da cota do mandato <Tip content={O_QUE_E.cota} /></p>
        <p className="font-display text-3xl font-bold tabular"><Money centavos={k.total} compact /></p>
        {k.mediaMensal > 0 && <p className="text-sm text-muted">média de <b className="text-fg"><Money centavos={k.mediaMensal} compact /></b> por mês{g.subsidio ? <> · salário de <Money centavos={g.subsidio} compact /> por mês</> : null}</p>}
        <div className="mt-4">
          <Bars data={g.porCategoria.map((c) => ({ label: rotuloCategoria(c.categoria), value: c.valor }))} format={(n) => formatBRL(n, true)} limit={3} />
        </div>
      </Card>
      <Card title="Quem mais recebeu da cota">
        <ul className="divide-y divide-line">
          {[...g.topFornecedores].sort((a, b) => b.valor - a.valor).slice(0, 3).map((f, i) => (
            <li key={`${f.cnpjCpf}-${i}`} className="flex items-center gap-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium">{f.nome || "—"}</span>
              <b className="shrink-0 tabular"><Money centavos={f.valor} compact /></b>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/** Gastos de um deputado ou senador: cota (CEAP/CEAPS), pessoal de gabinete, subsídio e auxílios. */
export function GastosParlamentar({ kind, id }: { kind: KindParlamentar; id: string | number }) {
  const q = useApi<GastosParlamentarData>(id ? gastosPath.parlamentar(kind, id) : null);
  if (q.isError) {
    return q.error instanceof HttpError && q.error.status === 404
      ? <EmptyState title="Ainda não há dados de gastos para este parlamentar." hint="Os arquivos de gastos são atualizados periodicamente a partir das fontes oficiais." />
      : <ErrorState error={q.error} retry={() => q.refetch()} />;
  }
  if (q.isPending) return <div className="space-y-3"><Skeleton className="h-28" /><Skeleton className="h-60" /></div>;
  const g = q.data;
  const k = kpis(g);
  const casa = g.casa === "camara" ? "Câmara" : "Senado";
  const cotaNome = g.casa === "camara" ? "CEAP" : "CEAPS";
  const p = g.pessoal;
  const comRem = !!p?.lista.some((x) => x.remuneracao != null);
  const comLocal = !!p?.lista.some((x) => x.local);
  const anoIni = g.porAno[0]?.ano;

  return (
    <div className="space-y-6">
      <StatGrid>
        <Stat label="Cota gasta no mandato" tip={O_QUE_E.cota} value={<Money centavos={k.totalMandato} compact />} hint={`desde ${mesAno(g.mandato.inicio)} · dados até ${mesAno(g.dadosAte)}`} />
        <Stat label="Média mensal" value={<Money centavos={k.mediaMensal} compact />} hint={`${formatNumber(g.mandato.meses)} meses`} />
        <Stat
          label={k.cotaAno ? `% do teto da cota em ${k.cotaAno}` : "% do teto da cota"}
          tip="Quanto do limite disponível no ano já foi usado. O limite varia por estado (passagens até Brasília custam mais para quem mora longe)."
          value={k.pctTeto == null ? "—" : formatPct(k.pctTeto)}
          hint={g.cota ? <>teto até agora: <Money centavos={g.cota.teto} compact /></> : g.casa === "senado" ? "o Senado não publica o teto por senador em dados abertos" : undefined}
        />
        <Stat label="Salário bruto (subsídio)" tip={O_QUE_E.subsidio} value={<Money centavos={g.subsidio} />} hint="por mês" />
        {p && (
          <Stat
            label="Pessoal de gabinete"
            tip={g.casa === "camara" ? O_QUE_E.secretario : O_QUE_E.pessoalSenado}
            value={formatNumber(p.n)}
            hint={p.custoMensal != null ? <>custo <Money centavos={p.custoMensal} compact />/mês ({mesAno(p.referencia)})</> : undefined}
          />
        )}
      </StatGrid>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title={`Cota parlamentar por ano (${cotaNome})`} tip={O_QUE_E.cota}>
          <Empilhadas g={g} />
        </Card>
        <Card title={anoIni ? `Por categoria, desde ${anoIni}` : "Por categoria"}>
          {g.porCategoria.length ? (
            <Bars data={g.porCategoria.map((c) => ({ label: rotuloCategoria(c.categoria), value: c.valor, sub: `${formatNumber(c.n)} notas` }))} format={(n) => formatBRL(n, true)} limit={10} />
          ) : <EmptyState title="Sem despesas da cota publicadas." />}
        </Card>
      </div>

      <Card title="Fornecedores que mais receberam" tip="Somatório das notas reembolsadas pela cota, por CNPJ/CPF do fornecedor.">
        <DataTable rows={g.topFornecedores} columns={colsForn} pageSize={10} exportName={`fornecedores-${kind}-${g.id}`} rowKey={(r, i) => `${r.cnpjCpf}-${i}`} initialSort={{ key: "valor", dir: "desc" }} />
      </Card>

      <Card
        title="Despesas da cota, mais recentes"
        tip={g.nItens > g.itens.length ? `Mostrando as ${formatNumber(g.itens.length)} mais recentes de ${formatNumber(g.nItens)} despesas. A lista completa está nas fontes oficiais.` : undefined}
      >
        <DataTable
          rows={g.itens}
          columns={colsItens}
          pageSize={20}
          exportName={`despesas-${kind}-${g.id}`}
          search={(r) => `${r.fornecedor} ${r.categoria} ${r.cnpjCpf} ${r.det ?? ""}`}
          searchPlaceholder="Filtrar por fornecedor, categoria ou CNPJ…"
          rowKey={(_, i) => i}
          empty="Nenhuma despesa publicada."
        />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Salário e benefícios">
          <KeyValue
            items={[
              ["Subsídio mensal bruto", <Money centavos={g.subsidio} />, O_QUE_E.subsidio],
              ["Imóvel funcional", g.auxilios.imovelFuncional, O_QUE_E.imovel],
              ["Auxílio-moradia", g.auxilios.auxilioMoradia, O_QUE_E.auxilioMoradia],
              ...(g.auxilios.viagensMissao != null ? [["Viagens em missão oficial (ano)", formatNumber(g.auxilios.viagensMissao), O_QUE_E.missao] as [string, string, string]] : []),
              ...(g.verbaGabinete
                ? [[`Verba de gabinete ${g.verbaGabinete.ano}`, <>gasto <Money centavos={g.verbaGabinete.gasto} /> · não utilizado <Money centavos={g.verbaGabinete.naoUtilizado} /></>, O_QUE_E.verba] as [string, React.ReactNode, string]]
                : []),
            ]}
          />
          {g.verbaGabinete && g.verbaGabinete.porMes.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold text-muted">Verba de gabinete por mês ({g.verbaGabinete.ano})</p>
              <Bars data={g.verbaGabinete.porMes.map((m) => ({ label: MES[m.mes - 1] ?? String(m.mes), value: m.gasto }))} format={(n) => formatBRL(n, true)} />
            </div>
          )}
        </Card>
        <Card title="O que é cada coisa">
          <dl className="space-y-3 text-sm">
            {[
              [cotaNome === "CEAP" ? "Cota parlamentar (CEAP)" : "Cota do Senado (CEAPS)", O_QUE_E.cota],
              ["Verba de gabinete", O_QUE_E.verba],
              [g.casa === "camara" ? "Secretário parlamentar" : "Pessoal de gabinete do Senado", g.casa === "camara" ? O_QUE_E.secretario : O_QUE_E.pessoalSenado],
              ["Subsídio", O_QUE_E.subsidio],
              ["Auxílio-moradia e imóvel funcional", `${O_QUE_E.auxilioMoradia} ${O_QUE_E.imovel}`],
            ].map(([t, d]) => (
              <div key={t}>
                <dt className="flex items-center gap-1 font-semibold">{t}<Tip content={d} /></dt>
                <dd className="text-muted">{d}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      {p && (
        <Card
          title={`Pessoal de gabinete (${formatNumber(p.n)})`}
          tip={g.casa === "camara" ? `${O_QUE_E.secretario} A remuneração individual é publicada na página oficial de pessoal de gabinete.` : O_QUE_E.pessoalSenado}
        >
          <DataTable rows={p.lista} columns={colsPessoal(comRem, comLocal)} pageSize={15} exportName={`pessoal-${kind}-${g.id}`} search={(r) => `${r.nome} ${r.cargo} ${r.grupo}`} rowKey={(r, i) => `${r.nome}-${i}`} />
        </Card>
      )}

      <aside className="border-t border-line pt-3 text-xs text-muted">
        <p className="mb-1 font-semibold">Fontes oficiais ({casa})</p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {g.fontes.map((f) => <li key={f.url}><ExternalLink href={f.url}>{f.nome}</ExternalLink></li>)}
        </ul>
        <p className="mt-2">Valores líquidos reembolsados; estornos aparecem como valores negativos.</p>
      </aside>
    </div>
  );
}
