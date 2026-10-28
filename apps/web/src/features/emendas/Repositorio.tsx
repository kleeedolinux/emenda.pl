// "Modo repositório": as tabelas completas (autores, estados, áreas) com ordenação, busca e CSV.
import { UFS, type AutorResumo, type Brasil, type SiglaUf, type TipoEmenda } from "@emenda/contracts";
import { Link } from "react-router";
import { formatBRL, formatNumber } from "@/lib/format";
import { Bars, Card, DataTable, ErrorState, Skeleton, Tabs, type Column } from "@/ui";
import { AutoresTable } from "./tables";

type UfRow = Brasil["porUf"][number];

export function Repositorio({ brasil, autores, autoresErro, tipo }: { brasil: Brasil | undefined; autores: AutorResumo[] | undefined; autoresErro: Error | null; tipo?: TipoEmenda }) {
  const d = brasil;
  const ufs: UfRow[] = d
    ? tipo
      ? Object.entries(d.fluxo.filter((f) => f.tipo === tipo).reduce<Record<string, number>>((a, f) => ((a[f.uf] = (a[f.uf] ?? 0) + f.pago), a), {}))
          .map(([uf, pago]) => ({ uf, nome: UFS[uf as SiglaUf] ?? uf, pago, empenhado: 0, liquidado: 0, rapPago: 0, n: 0 }))
      : d.porUf
    : [];
  const cols: Column<UfRow>[] = [
    { key: "nome", header: "Estado", sort: true, cell: (r) => <Link className="link font-medium" to={`/uf/${r.uf}`}>{r.nome}</Link> },
    { key: "uf", header: "UF", sort: true },
    ...(tipo ? [] : [
      { key: "n", header: "Emendas", sort: true, align: "right" as const, cell: (r: UfRow) => formatNumber(r.n) },
      { key: "empenhado", header: "Empenhado", sort: true, align: "right" as const, tip: "empenhado", cell: (r: UfRow) => formatBRL(r.empenhado) },
    ]),
    { key: "pago", header: "Pago", sort: true, align: "right", tip: "pago", cell: (r) => formatBRL(r.pago) },
  ];
  return (
    <Tabs tabs={[
      { id: "autores", label: "Ranking de autores", count: autores?.length, content: autoresErro ? <ErrorState error={autoresErro} /> : autores ? <AutoresTable rows={autores} exportName="emendas-autores" /> : <Skeleton className="h-64" /> },
      { id: "estados", label: "Por estado", count: ufs.length, content: <DataTable rows={ufs} columns={cols} exportName={`emendas-uf${tipo ? `-${tipo}` : ""}`} initialSort={{ key: "pago", dir: "desc" }} search={(r) => `${r.nome} ${r.uf}`} pageSize={27} /> },
      { id: "funcoes", label: "Por área", count: d?.porFuncao.length, content: d ? <Card><Bars data={[...d.porFuncao].sort((a, b) => b.pago - a.pago).map((f) => ({ label: f.funcao, value: f.pago }))} format={(n) => formatBRL(n, true)} /></Card> : <Skeleton className="h-64" /> },
    ]} />
  );
}
