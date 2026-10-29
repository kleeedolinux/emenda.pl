// "Modo repositório": todas as linhas em tabela (ordenar, filtrar, baixar CSV), recolhido por padrão.
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Database } from "lucide-react";
import { DataTable, PartyBadge, formatPct, type Column } from "@/ui";
import { formatBRL } from "@/lib/format";
import { chaveMembro, type Membro } from "./composicao";
import type { DadosRankings } from "./PainelRankings";
import { auditarHref } from "./ui";

interface Row {
  m: Membro; gastos: number | null; emendas: number | null; presenca: number | null; fidelidade: number | null; trocas: number | null;
}

export function Repositorio({ membros, d }: { membros: Membro[]; d: DadosRankings }) {
  const [aberto, setAberto] = useState(false);
  const rows = useMemo<Row[]>(() => {
    if (!aberto) return [];
    const idx = <T extends { membro: Membro; valor: number }>(xs: T[] | null) => (xs ? new Map(xs.map((x) => [chaveMembro(x.membro), x.valor])) : null);
    const g = idx(d.gastos), e = idx(d.emendas), p = idx(d.presenca), f = idx(d.fidelidade), t = idx(d.trocas);
    return membros.map((m) => {
      const k = chaveMembro(m);
      return { m, gastos: g ? (g.get(k) ?? 0) : null, emendas: e ? (e.get(k) ?? 0) : null, presenca: p?.get(k) ?? null, fidelidade: f?.get(k) ?? null, trocas: t ? (t.get(k) ?? 0) : null };
    });
  }, [aberto, membros, d]);
  const cols: Column<Row>[] = [
    { key: "nome", header: "Nome", sort: (r) => r.m.nome, csv: (r) => r.m.nome, cell: (r) => <Link className="link font-medium" to={r.m.href}>{r.m.nome}</Link> },
    { key: "casa", header: "Casa", sort: (r) => r.m.casa, csv: (r) => r.m.casa, cell: (r) => (r.m.casa === "camara" ? "Câmara" : "Senado") },
    { key: "partido", header: "Partido", sort: (r) => r.m.partido, csv: (r) => r.m.partido, cell: (r) => <PartyBadge sigla={r.m.partido} /> },
    { key: "uf", header: "UF", sort: (r) => r.m.uf, csv: (r) => r.m.uf, cell: (r) => r.m.uf },
    { key: "gastos", header: "Cota no mandato", align: "right", sort: (r) => r.gastos ?? -1, csv: (r) => (r.gastos ?? 0) / 100, cell: (r) => (r.gastos === null ? "…" : formatBRL(r.gastos)) },
    { key: "emendas", header: "Emendas pagas", align: "right", sort: (r) => r.emendas ?? -1, csv: (r) => (r.emendas ?? 0) / 100, cell: (r) => (r.emendas === null ? "…" : formatBRL(r.emendas)) },
    { key: "presenca", header: "Presença (amostra)", align: "right", sort: (r) => r.presenca ?? -1, csv: (r) => r.presenca ?? "", cell: (r) => (r.presenca === null ? "—" : formatPct(r.presenca)) },
    { key: "fidelidade", header: "Segue o partido", align: "right", sort: (r) => r.fidelidade ?? -1, csv: (r) => r.fidelidade ?? "", cell: (r) => (r.fidelidade === null ? "—" : formatPct(r.fidelidade)) },
    { key: "trocas", header: "Trocas", align: "right", sort: (r) => r.trocas ?? -1, csv: (r) => r.trocas ?? "", cell: (r) => (r.trocas === null ? "—" : r.trocas) },
    { key: "auditar", header: "", csv: (r) => auditarHref(r.m), cell: (r) => <Link className="link text-xs" to={auditarHref(r.m)}>auditar</Link> },
  ];
  return (
    <details className="card group p-0" open={aberto} onToggle={(e) => setAberto((e.target as HTMLDetailsElement).open)}>
      <summary className="flex cursor-pointer list-none items-center gap-2 p-5 font-semibold">
        <Database className="size-4" aria-hidden />Modo repositório: todos os números em tabela
        <span className="ml-auto text-sm font-normal text-muted group-open:hidden">abrir</span>
      </summary>
      {aberto && (
        <div className="border-t border-line p-5">
          <DataTable rows={rows} columns={cols} pageSize={50} rowKey={(r) => chaveMembro(r.m)} exportName="congresso" search={(r) => `${r.m.nome} ${r.m.partido} ${r.m.uf}`} searchPlaceholder="Filtrar por nome, partido ou UF…" initialSort={{ key: "gastos", dir: "desc" }} />
        </div>
      )}
    </details>
  );
}
