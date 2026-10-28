// Gastos de parlamentares (v1/gastos/**): transformações puras para a UI.
import type { GastoCategoriaAno, GastosParlamentarData, GastosRanking, CasaGastos } from "@emenda/contracts";
import { formatCNPJ } from "@/lib/format";

/** Documento só com dígitos -> CNPJ (14) ou CPF (11) formatado. */
export function formatCnpjCpf(d: string): string {
  if (!d) return "—";
  if (/^\d{14}$/.test(d)) return formatCNPJ(d);
  if (/^\d{11}$/.test(d)) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return d;
}

/** Ficha oficial do fornecedor (só pessoa jurídica). */
export function linkFornecedor(d: string): string | null {
  return /^\d{14}$/.test(d) ? `https://portaldatransparencia.gov.br/pessoa-juridica/${d}` : null;
}

const SIGLAS = new Set(["SIGEPA", "RPA"]);

/** "COMBUSTÍVEIS E LUBRIFICANTES." -> "Combustíveis e lubrificantes". */
export function rotuloCategoria(c: string): string {
  const t = c.trim().replace(/\s+,/g, ",").replace(/,(?=\S)/g, ", ").replace(/\.$/, "");
  if (!t) return "Sem categoria";
  if (t !== t.toUpperCase()) return t;
  const low = t
    .split(" ")
    .map((w) => (SIGLAS.has(w) ? w : w.toLowerCase()))
    .join(" ");
  return low.charAt(0).toUpperCase() + low.slice(1);
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-10" -> "out/2026". */
export function mesAno(ym: string | null | undefined): string {
  const m = ym ? /^(\d{4})-(\d{2})/.exec(ym) : null;
  return m ? `${MESES[Number(m[2]) - 1]}/${m[1]}` : "—";
}

export function kpis(g: Pick<GastosParlamentarData, "mandato" | "cota">) {
  return {
    totalMandato: g.mandato.total,
    mediaMensal: g.mandato.mediaMensal,
    pctTeto: g.cota && g.cota.teto > 0 ? g.cota.gasto / g.cota.teto : null,
    cotaAno: g.cota?.ano ?? null,
  };
}

/** Barras empilhadas por ano: `top` categorias de maior valor + "Outras". */
export function empilhado(linhas: GastoCategoriaAno[], top = 6) {
  const porCat = new Map<string, number>();
  for (const l of linhas) porCat.set(l.categoria, (porCat.get(l.categoria) ?? 0) + l.valor);
  const principais = [...porCat].sort((a, b) => b[1] - a[1]).slice(0, top).map(([c]) => c);
  const temOutras = porCat.size > principais.length;
  const categorias = temOutras ? [...principais, "Outras"] : principais;
  const idx = new Map(principais.map((c, i) => [c, i]));
  const porAno = new Map<number, number[]>();
  for (const l of linhas) {
    const p = porAno.get(l.ano) ?? Array<number>(categorias.length).fill(0);
    p[idx.get(l.categoria) ?? categorias.length - 1]! += l.valor;
    porAno.set(l.ano, p);
  }
  const anos = [...porAno]
    .sort((a, b) => a[0] - b[0])
    .map(([ano, partes]) => ({ ano, total: partes.reduce((s, v) => s + v, 0), partes }));
  return { categorias, anos, max: Math.max(0, ...anos.map((a) => a.total)) };
}

export interface FiltroRanking {
  casa: CasaGastos;
  /** ano ou "mandato" (legislatura corrente) */
  periodo: number | "mandato";
  /** inclui quem não está mais em exercício */
  todos?: boolean;
}

export function rankingLinhas(r: GastosRanking, f: FiltroRanking) {
  return r.parlamentares
    .filter((p) => p.casa === f.casa && (f.todos || p.emExercicio))
    .map((p) => ({ ...p, valor: f.periodo === "mandato" ? p.mandato : (p.porAno[String(f.periodo)] ?? 0) }))
    .filter((p) => p.valor !== 0)
    .sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome))
    .map((p, i) => ({ ...p, posicao: i + 1 }));
}
