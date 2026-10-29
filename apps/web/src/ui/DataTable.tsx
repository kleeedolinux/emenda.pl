import clsx from "clsx";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { downloadText, formatNumber, toCSV } from "@/lib/format";
import { toast } from "./motion";
import { semAcento } from "@emenda/contracts";
import { MaybeTip, EmptyState, type TipProp } from "./primitives";

type Prim = string | number | boolean | null | undefined;

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** Renderização customizada. Padrão: `row[key]`. */
  cell?: (row: T) => ReactNode;
  /** `true` ordena pelo valor bruto; função define o valor de ordenação. */
  sort?: boolean | ((row: T) => Prim);
  align?: "left" | "right" | "center";
  tip?: TipProp;
  /** Valor no CSV. Padrão: valor de ordenação ou `row[key]`. */
  csv?: (row: T) => Prim;
  className?: string;
}

export interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  pageSize?: number;
  search?: (row: T) => string;
  searchPlaceholder?: string;
  empty?: ReactNode;
  exportName?: string;
  initialSort?: { key: string; dir: "asc" | "desc" };
  rowKey?: (row: T, i: number) => string | number;
  caption?: string;
}

const raw = <T,>(r: T, k: string): Prim => (r as Record<string, Prim>)[k];
const valueOf = <T,>(c: Column<T>, r: T): Prim => (typeof c.sort === "function" ? c.sort(r) : raw(r, c.key));
const norm = (s: string) => semAcento(s).toLowerCase();
const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

export function DataTable<T>({
  rows, columns, pageSize = 25, search, searchPlaceholder = "Filtrar…", empty, exportName, initialSort, rowKey, caption,
}: DataTableProps<T>) {
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q);
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!search || !dq.trim()) return rows;
    const terms = norm(dq).split(/\s+/).filter(Boolean);
    return rows.filter((r) => { const s = norm(search(r)); return terms.every((t) => s.includes(t)); });
  }, [rows, search, dq]);

  const sorted = useMemo(() => {
    const col = sort && columns.find((c) => c.key === sort.key);
    if (!col) return filtered;
    const m = sort!.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const x = valueOf(col, a), y = valueOf(col, b);
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : collator.compare(String(x), String(y))) * m;
    });
  }, [filtered, sort, columns]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const p = Math.min(page, pages - 1);
  const view = sorted.slice(p * pageSize, (p + 1) * pageSize);

  const toggle = (c: Column<T>) => {
    if (!c.sort) return;
    setPage(0);
    setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === "desc" ? "asc" : "desc" } : { key: c.key, dir: "desc" }));
  };

  const exportCsv = () => {
    const header = columns.map((c) => (typeof c.header === "string" ? c.header : c.key));
    const body = sorted.map((r) => columns.map((c) => (c.csv ? c.csv(r) : valueOf(c, r))));
    downloadText(`${exportName}.csv`, toCSV(header, body));
    toast(`CSV baixado: ${exportName}.csv`);
  };

  return (
    <div className="min-w-0">
      {(search || exportName) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {search && (
            <label className="relative min-w-0 flex-1 sm:max-w-sm">
              <span className="sr-only">{searchPlaceholder}</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <input
                type="search"
                value={q}
                onChange={(e) => { setQ(e.target.value); setPage(0); }}
                placeholder={searchPlaceholder}
                className="w-full rounded-xl border border-line bg-surface py-2 pl-9 pr-3 text-sm placeholder:text-muted focus:border-accent"
              />
            </label>
          )}
          <span className="shrink-0 whitespace-nowrap text-xs text-muted tabular" aria-live="polite">
            {formatNumber(sorted.length)} {sorted.length === 1 ? "registro" : "registros"}
          </span>
          {exportName && (
            <button type="button" onClick={exportCsv} disabled={!sorted.length} className="press ml-auto inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-2 disabled:opacity-50">
              <Download className="size-4" aria-hidden />CSV
            </button>
          )}
        </div>
      )}
      {!sorted.length ? (
        typeof empty === "string" || !empty ? <EmptyState title={empty ?? "Nenhum registro encontrado."} /> : empty
      ) : (
        <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-line lg:max-h-[70vh] lg:overflow-y-auto">
          <table className="w-full border-collapse text-sm">
            {caption && <caption className="sr-only">{caption}</caption>}
            <thead className="sticky top-0 z-10 glass">
              <tr>
                {columns.map((c) => {
                  const active = sort?.key === c.key;
                  const Icon = active ? (sort!.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                  return (
                    <th
                      key={c.key}
                      scope="col"
                      aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                      className={clsx("whitespace-nowrap border-b border-line px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted", c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left")}
                    >
                      <span className={clsx("inline-flex items-center gap-1", c.align === "right" && "flex-row-reverse")}>
                        {c.sort ? (
                          <button type="button" onClick={() => toggle(c)} className={clsx("inline-flex items-center gap-1 uppercase hover:text-fg", active && "text-fg")}>
                            {c.header}
                            <Icon className={clsx("size-3.5", !active && "opacity-40")} aria-hidden />
                          </button>
                        ) : c.header}
                        <MaybeTip tip={c.tip} />
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody key={`${p}-${sort?.key ?? ""}-${sort?.dir ?? ""}`}>
              {view.map((r, i) => (
                <tr key={rowKey ? rowKey(r, i) : p * pageSize + i} style={{ "--i": i } as React.CSSProperties} className="row-in border-b border-line/70 transition-colors last:border-0 hover:bg-surface-2/70">
                  {columns.map((c) => (
                    <td key={c.key} className={clsx("px-3 py-2.5 align-top", c.align === "right" && "text-right tabular whitespace-nowrap", c.align === "center" && "text-center", c.className)}>
                      {c.cell ? c.cell(r) : (raw(r, c.key) as ReactNode) ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <nav aria-label="Paginação" className="mt-3 flex items-center justify-end gap-2 text-sm">
          <span className="mr-auto whitespace-nowrap text-xs text-muted tabular">Página {p + 1} de {formatNumber(pages)}</span>
          <button type="button" aria-label="Página anterior" disabled={p === 0} onClick={() => setPage(p - 1)} className="press rounded-lg border border-line p-1.5 hover:bg-surface-2 disabled:opacity-40"><ChevronLeft className="size-4" /></button>
          <button type="button" aria-label="Próxima página" disabled={p >= pages - 1} onClick={() => setPage(p + 1)} className="press rounded-lg border border-line p-1.5 hover:bg-surface-2 disabled:opacity-40"><ChevronRight className="size-4" /></button>
        </nav>
      )}
    </div>
  );
}
