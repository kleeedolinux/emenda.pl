// Seleção pura dos itens do ticker do hero (emendas reais mais recentes).
import { UFS, type Autor, type AutorResumo, type EmendaItem, type SiglaUf } from "@emenda/contracts";

const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e"]);
export const titleCase = (s: string) =>
  s.toLocaleLowerCase("pt-BR").split(/\s+/).map((w, i) => (i > 0 && MINUSCULAS.has(w) ? w : w.charAt(0).toLocaleUpperCase("pt-BR") + w.slice(1))).join(" ");

/** "MÚLTIPLO" -> nome da UF; "X (UF)" -> nome da UF; município -> "Nome (UF)". */
export function localLabel({ localidade, uf }: Pick<EmendaItem, "localidade" | "uf">): string {
  const nomeUf = uf && uf in UFS ? UFS[uf as SiglaUf] : null;
  if (/^M[ÚU]LTIPLO$/i.test(localidade.trim()) || /\(UF\)\s*$/i.test(localidade)) return nomeUf ?? "Vários estados";
  return uf ? `${titleCase(localidade)} (${uf})` : titleCase(localidade);
}

/** Códigos das `n` bancadas com maior valor pago. */
export const pickBancadas = (autores: AutorResumo[], n: number) =>
  autores.filter((a) => /^BANCADA\b/i.test(a.nome)).sort((a, b) => b.pago - a.pago).slice(0, n).map((a) => a.codigo);

export interface TickerItem { codigo: string; ano: number; autor: string; autorCodigo: string; local: string; funcao: string; valor: number; medida: "pago" | "empenhado" }

/** Até `perAutor` emendas do ano mais recente de cada autor, por valor; intercaladas entre autores. */
export function tickerItems(autores: Autor[], perAutor: number): TickerItem[] {
  const lists = autores.map((a) => {
    const ano = Math.max(...a.emendas.map((e) => e.ano));
    return a.emendas
      .filter((e) => e.ano === ano && Math.max(e.pago, e.empenhado) > 0)
      .sort((x, y) => (y.pago || y.empenhado) - (x.pago || x.empenhado))
      .slice(0, perAutor)
      .map((e): TickerItem => ({ codigo: e.codigo, ano: e.ano, autor: titleCase(a.nome), autorCodigo: a.codigo, local: localLabel(e), funcao: e.funcao, valor: e.pago || e.empenhado, medida: e.pago ? "pago" : "empenhado" }));
  });
  const out: TickerItem[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (l[i]) out.push(l[i]!);
  return out;
}
