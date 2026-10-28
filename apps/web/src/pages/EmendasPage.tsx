import { dataPath, TIPOS_EMENDA, UFS, type AutorResumo, type Brasil, type SiglaUf, type TipoEmenda } from "@emenda/contracts";
import { useSearchParams } from "react-router";
import { COR_TIPO, nomeTipoCurto, TIP_TIPO } from "@/features/emendas/tipos";
import { AutoresTable } from "@/features/emendas/tables";
import { TotaisGrid } from "@/features/emendas/Totais";
import { useApi } from "@/lib/data";
import { formatBRL, formatNumber } from "@/lib/format";
import { Bars, NextSteps, Card, DataTable, ErrorState, PageHeader, Section, Skeleton, Tabs, Term, type Column } from "@/ui";
import { Link } from "react-router";

type UfRow = Brasil["porUf"][number];

export default function EmendasPage() {
  const brasil = useApi<Brasil>(dataPath.brasil());
  const autores = useApi<AutorResumo[]>(dataPath.autores());
  const [sp, setSp] = useSearchParams();
  const tipo = (sp.get("tipo") ?? "") as TipoEmenda | "";
  const setTipo = (t: string) => setSp((p) => { const n = new URLSearchParams(p); if (t) n.set("tipo", t); else n.delete("tipo"); return n; }, { replace: true, preventScrollReset: true });
  const d = brasil.data;
  const t = tipo && d ? d.porTipo.find((x) => x.tipo === tipo) : null;
  const brl = (n: number) => formatBRL(n, true);

  const ufFiltrado: UfRow[] = d
    ? tipo
      ? Object.entries(d.fluxo.filter((f) => f.tipo === tipo).reduce<Record<string, number>>((a, f) => ((a[f.uf] = (a[f.uf] ?? 0) + f.pago), a), {}))
          .map(([uf, pago]) => ({ uf, nome: UFS[uf as SiglaUf] ?? uf, pago, empenhado: 0, liquidado: 0, rapPago: 0, n: 0 }))
      : d.porUf
    : [];

  const ufCols: Column<UfRow>[] = [
    { key: "nome", header: "Estado", sort: true, cell: (r) => <Link className="link font-medium" to={`/uf/${r.uf}`}>{r.nome}</Link> },
    { key: "uf", header: "UF", sort: true },
    ...(tipo ? [] : [
      { key: "n", header: "Emendas", sort: true, align: "right" as const, cell: (r: UfRow) => formatNumber(r.n) },
      { key: "empenhado", header: "Empenhado", sort: true, align: "right" as const, tip: "empenhado", cell: (r: UfRow) => formatBRL(r.empenhado) },
    ]),
    { key: "pago", header: "Pago", sort: true, align: "right", tip: "pago", cell: (r) => formatBRL(r.pago) },
  ];

  return (
    <>
      <PageHeader eyebrow="Explorador nacional" title="Emendas parlamentares" subtitle="Todas as emendas ao Orçamento da União, por tipo, autor e estado. Clique em qualquer nome para ver cada registro." breadcrumbs={[{ label: "Início", to: "/" }, { label: "Emendas" }]} />

      <div role="radiogroup" aria-label="Filtrar por tipo" className="mb-6 flex flex-wrap gap-2">
        {(["", ...Object.keys(TIPOS_EMENDA)] as const).map((k) => (
          <button key={k || "todos"} role="radio" aria-checked={tipo === k} onClick={() => setTipo(k)}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition ${tipo === k ? "border-accent bg-verde/10 text-fg" : "border-line bg-surface text-muted hover:text-fg"}`}>
            {k && <span className="size-2 rounded-full" style={{ background: COR_TIPO[k as TipoEmenda] }} aria-hidden />}
            {k ? nomeTipoCurto(k) : "Todos os tipos"}
          </button>
        ))}
      </div>
      {tipo && <p className="-mt-3 mb-6 text-sm text-muted"><Term k={TIP_TIPO[tipo]}>{TIPOS_EMENDA[tipo]}</Term></p>}

      {brasil.isError ? <ErrorState error={brasil.error} retry={() => brasil.refetch()} /> : d ? <TotaisGrid t={t ?? d.totais} /> : <Skeleton className="h-28" />}

      <Section title="Explorar">
        <Tabs tabs={[
          { id: "autores", label: "Ranking de autores", count: autores.data?.length, content: autores.isError ? <ErrorState error={autores.error} /> : autores.data ? <AutoresTable rows={autores.data} exportName="emendas-autores" /> : <Skeleton className="h-64" /> },
          { id: "estados", label: "Por estado", count: ufFiltrado.length, content: <DataTable rows={ufFiltrado} columns={ufCols} exportName={`emendas-uf${tipo ? `-${tipo}` : ""}`} initialSort={{ key: "pago", dir: "desc" }} search={(r) => `${r.nome} ${r.uf}`} pageSize={27} /> },
          { id: "funcoes", label: "Por área", count: d?.porFuncao.length, content: d ? <Card><Bars data={[...d.porFuncao].sort((a, b) => b.pago - a.pago).map((f) => ({ label: f.funcao, value: f.pago }))} format={brl} /></Card> : <Skeleton className="h-64" /> },
        ]} />
      </Section>
      <NextSteps items={[
        { to: "/dinheiro", label: "Fluxo do dinheiro", desc: "Tipo → área de gasto → estado." },
        { to: "/deputados", label: "Deputados", desc: "Votações, gastos e projetos." },
        { to: "/proposicoes", label: "Leis em tramitação", desc: "PLs, PECs e MPs." },
      ]} />
    </>
  );
}
