import { useMemo, useState } from "react";
import { Link } from "react-router";
import { gastosPath, type CasaGastos, type GastosRanking } from "@emenda/contracts";
import {
  Bars, Card, DataTable, ErrorState, ExternalLink, Money, PartyBadge, Skeleton, Stat, StatGrid,
  formatNumber, useApi, type Column,
} from "@/ui";
import { formatBRL } from "@/lib/format";
import { formatCnpjCpf, linkFornecedor, mesAno, rankingLinhas, rotuloCategoria } from "./gastos";
import { O_QUE_E } from "./textos";

type Linha = ReturnType<typeof rankingLinhas>[number];
type Forn = GastosRanking["fornecedores"][number];

const selectCls = "rounded-xl border border-line bg-surface px-3 py-2 text-sm";

/** Ranking "Quem mais gasta" a partir de v1/gastos/ranking.json. */
export function QuemMaisGasta({ casa = "camara" }: { casa?: CasaGastos }) {
  const q = useApi<GastosRanking>(gastosPath.ranking());
  const [periodo, setPeriodo] = useState<number | "mandato">("mandato");
  const [todos, setTodos] = useState(false);
  const rota = casa === "camara" ? "deputado" : "senador";

  const linhas = useMemo(() => (q.data ? rankingLinhas(q.data, { casa, periodo, todos }) : []), [q.data, casa, periodo, todos]);
  const anoCat = periodo === "mandato" ? (q.data?.anos.at(-1) ?? null) : periodo;
  const nomes = useMemo(() => new Map((q.data?.parlamentares ?? []).filter((p) => p.casa === casa).map((p) => [p.id, p.nome])), [q.data, casa]);
  const cats = useMemo(
    () => (q.data?.categorias ?? []).filter((c) => c.casa === casa && c.ano === anoCat).sort((a, b) => b.valor - a.valor),
    [q.data, casa, anoCat],
  );

  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (q.isPending) return <Skeleton className="h-96" />;
  const r = q.data;
  const total = linhas.reduce((s, l) => s + l.valor, 0);

  const cols: Column<Linha>[] = [
    { key: "posicao", header: "#", align: "right", sort: true, cell: (l) => <span className="tabular text-muted">{l.posicao}</span> },
    { key: "nome", header: "Nome", sort: true, cell: (l) => <Link className="link font-medium" to={`/${rota}/${l.id}#gastos`}>{l.nome}</Link> },
    { key: "partido", header: "Partido", sort: (l) => l.partido ?? "", cell: (l) => (l.partido ? <PartyBadge sigla={l.partido} /> : "—"), csv: (l) => l.partido ?? "" },
    { key: "uf", header: "UF", sort: (l) => l.uf ?? "", cell: (l) => l.uf ?? "—", csv: (l) => l.uf ?? "" },
    { key: "valor", header: periodo === "mandato" ? "Cota no mandato" : `Cota em ${periodo}`, align: "right", sort: true, cell: (l) => <Money centavos={l.valor} />, csv: (l) => l.valor / 100 },
  ];
  const colsForn: Column<Forn>[] = [
    { key: "nome", header: "Fornecedor", sort: true, cell: (f) => <span className="font-medium">{f.nome}</span> },
    {
      key: "cnpjCpf", header: "CNPJ/CPF", tip: "CNPJ",
      cell: (f) => { const l = linkFornecedor(f.cnpjCpf); return l ? <ExternalLink href={l}>{formatCnpjCpf(f.cnpjCpf)}</ExternalLink> : formatCnpjCpf(f.cnpjCpf); },
      csv: (f) => f.cnpjCpf,
    },
    { key: "parlamentares", header: "Parlamentares", align: "right", sort: true, cell: (f) => formatNumber(f.parlamentares) },
    { key: "n", header: "Notas", align: "right", sort: true, cell: (f) => formatNumber(f.n) },
    { key: "valor", header: "Recebeu", align: "right", sort: true, cell: (f) => <Money centavos={f.valor} />, csv: (f) => f.valor / 100 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Período</span>
          <select className={selectCls} value={String(periodo)} onChange={(e) => setPeriodo(e.target.value === "mandato" ? "mandato" : Number(e.target.value))}>
            <option value="mandato">Mandato atual</option>
            {[...r.anos].reverse().map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} />
          Incluir quem não está mais em exercício
        </label>
        <p className="max-w-xl text-sm text-muted">{O_QUE_E.cota}</p>
      </div>

      <StatGrid>
        <Stat label="Total da cota na seleção" tip={O_QUE_E.cota} value={<Money centavos={total} compact />} />
        <Stat label="Parlamentares" value={formatNumber(linhas.length)} />
        <Stat label="Média por parlamentar" value={<Money centavos={linhas.length ? Math.round(total / linhas.length) : 0} compact />} />
        <Stat label="Dados até" value={mesAno(r.dadosAte[casa])} />
      </StatGrid>

      <Card title="Quem mais gasta a cota parlamentar">
        <DataTable rows={linhas} columns={cols} pageSize={25} exportName={`quem-mais-gasta-${casa}-${periodo}`} rowKey={(l) => l.id} search={(l) => `${l.nome} ${l.partido ?? ""} ${l.uf ?? ""}`} searchPlaceholder="Filtrar por nome, partido ou UF…" initialSort={{ key: "valor", dir: "desc" }} />
      </Card>

      {cats.length > 0 && (
        <Card title={`Por categoria em ${anoCat}`} tip="Total da Casa por tipo de despesa e quem mais gastou em cada uma.">
          <Bars
            data={cats.map((c) => ({
              label: rotuloCategoria(c.categoria),
              value: c.valor,
              sub: c.top[0] ? `maior: ${nomes.get(c.top[0].id) ?? c.top[0].id} (${formatBRL(c.top[0].valor, true)})` : undefined,
            }))}
            format={(n) => formatBRL(n, true)}
            limit={12}
          />
        </Card>
      )}

      <Card title="Fornecedores que mais receberam (Câmara e Senado, desde 2019)" tip="Somatório das notas reembolsadas pela cota, por CNPJ/CPF.">
        <DataTable rows={r.fornecedores} columns={colsForn} pageSize={20} exportName="fornecedores-cota" rowKey={(f, i) => `${f.cnpjCpf}-${i}`} search={(f) => `${f.nome} ${f.cnpjCpf}`} />
      </Card>
    </div>
  );
}
