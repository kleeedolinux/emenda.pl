// Como um deputado votou no plenário, por trimestre (a Câmara não tem endpoint de votos por deputado).
import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Link } from "react-router";
import { DataTable, EmptyState, ErrorState, Spinner, VoteBadge, fetchJson, formatDate, type Column } from "@/ui";
import { qs, fontes, type Pagina, type VotacaoLista } from "./api";
import { useCamaraPagina } from "./hooks";
import { trimestres, type Periodo } from "./mandatos";
import { placarDaDescricao, type VotoCamara } from "./votacao";
import { Campo, Fontes, selectCls } from "./components";

const MAX = 30;

export function VotosDeputado({ id, janela }: { id: number; janela: Periodo }) {
  const ts = useMemo(() => trimestres(janela), [janela]);
  const [i, setI] = useState(0);
  const t = ts[Math.min(i, ts.length - 1)];
  const path = t ? qs("/votacoes", { idOrgao: 180, dataInicio: t.inicio, dataFim: t.fim, itens: 200, ordem: "DESC", ordenarPor: "dataHoraRegistro" }) : null;
  const lista = useCamaraPagina<VotacaoLista>(path);
  const nominais = useMemo(() => (lista.data?.dados ?? []).filter((v) => placarDaDescricao(v.descricao)).slice(0, MAX), [lista.data]);
  const votos = useQueries({
    queries: nominais.map((v) => ({
      queryKey: ["camara-pagina", `/votacoes/${v.id}/votos`],
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchJson<Pagina<VotoCamara>>(`/api/camara/votacoes/${v.id}/votos`, signal),
      staleTime: 86_400_000,
    })),
  });
  const pronto = votos.filter((q) => q.isSuccess).length;
  type Row = VotacaoLista & { voto: string };
  const rows: Row[] = nominais.map((v, k) => ({
    ...v, voto: votos[k]?.data ? (votos[k]!.data!.dados.find((x) => x.deputado_.id === id)?.tipoVoto ?? "Sem registro") : "…",
  }));
  const cols: Column<Row>[] = [
    { key: "data", header: "Data", sort: true, cell: (r) => formatDate(r.data) },
    { key: "descricao", header: "Votação", cell: (r) => <Link className="link" to={`/votacao/${r.id}`}>{r.descricao}</Link> },
    { key: "voto", header: "Voto", sort: true, cell: (r) => (r.voto === "…" ? <Spinner label="" /> : <VoteBadge voto={r.voto} />), tip: "Sem registro = ausente, em licença ou fora do mandato nesse dia." },
  ];
  if (!ts.length) return <EmptyState title="Sem período de mandato para consultar." />;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Campo label="Trimestre" tip="A API da Câmara só permite consultar votações em janelas de até 3 meses.">
          <select className={selectCls} value={i} onChange={(e) => setI(Number(e.target.value))}>
            {ts.map((x, k) => <option key={x.inicio} value={k}>{x.rotulo}</option>)}
          </select>
        </Campo>
        {nominais.length > 0 && pronto < nominais.length && <Spinner label={`Lendo votos ${pronto}/${nominais.length}…`} />}
      </div>
      {lista.isError ? <ErrorState error={lista.error} retry={() => lista.refetch()} /> : lista.isPending ? <Spinner /> : (
        <DataTable rows={rows} columns={cols} rowKey={(r) => r.id} exportName={`votos-deputado-${id}-${t?.inicio}`}
          empty={<EmptyState title="Nenhuma votação nominal no plenário neste trimestre." hint="Votações simbólicas não registram o voto de cada deputado." />} />
      )}
      <p className="mt-2 text-xs text-muted">Mostramos até {MAX} votações nominais do plenário por trimestre, das mais recentes para as mais antigas.</p>
      {path && <Fontes items={[{ label: "Votações do plenário (API da Câmara)", href: fontes.camaraApi(path) }]} />}
    </div>
  );
}
