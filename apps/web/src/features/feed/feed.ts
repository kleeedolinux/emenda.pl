// Últimas emendas: filtros, agrupamento por mês, rankings. Puro.
import { semAcento, type JanelaRanking, type MesResumo, type Pagamento, type TipoEmenda } from "@emenda/contracts";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const mesLongo = (m: number) => `${MESES[(m % 100) - 1] ?? "?"} de ${Math.floor(m / 100)}`;
/** Para títulos: "Outubro de 2026". */
export const mesTitulo = (m: number) => { const t = mesLongo(m); return t.charAt(0).toUpperCase() + t.slice(1); };
export const mesCurto = (m: number) => `${(MESES[(m % 100) - 1] ?? "?").slice(0, 3)}/${Math.floor(m / 100)}`;

export const JANELA_ROTULO: Record<JanelaRanking, string> = { "1m": "1 mês", "3m": "3 meses", "6m": "6 meses", "12m": "12 meses" };

export interface FiltroFeed { tipo?: TipoEmenda | ""; uf?: string; autor?: string }
export function filtrarPagamentos(ps: readonly Pagamento[], f: FiltroFeed): Pagamento[] {
  const n = (s: string) => semAcento(s).toLowerCase().trim();
  const a = n(f.autor ?? "");
  return ps.filter((p) => (!f.tipo || p.tipo === f.tipo) && (!f.uf || p.municipio.uf === f.uf) && (!a || n(p.autor.nome).includes(a)));
}

export function agruparPorMes(ps: readonly Pagamento[]) {
  const m = new Map<number, Pagamento[]>();
  for (const p of ps) m.set(p.mes, [...(m.get(p.mes) ?? []), p]);
  return [...m].sort((a, b) => b[0] - a[0]).map(([mes, itens]) => ({ mes, itens, total: itens.reduce((s, x) => s + x.valor, 0) }));
}

export function opcoesFiltro(ps: readonly Pagamento[]) {
  const ufs = new Set<string>(), autores = new Set<string>();
  for (const p of ps) { if (p.municipio.uf) ufs.add(p.municipio.uf); if (p.autor.nome) autores.add(p.autor.nome); }
  const ord = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b, "pt-BR"));
  return { ufs: ord(ufs), autores: ord(autores) };
}

/** Próximo mês (desc) ainda não carregado, ou null. */
export function proximoMes(meses: readonly MesResumo[], carregados: readonly number[]): number | null {
  const c = new Set(carregados);
  return meses.find((m) => !c.has(m.mes))?.mes ?? null;
}

/** Soma por partido usando `chave` do autor -> sigla (cruzado com Câmara/Senado). `null` = não identificado (bancadas, comissões, ex-parlamentares). */
export function rankingPorPartido(
  autores: ReadonlyArray<{ chave: string; valor: number }>,
  partidoPorChave: ReadonlyMap<string, string>,
): Array<{ partido: string | null; valor: number; autores: number }> {
  const m = new Map<string | null, { valor: number; autores: number }>();
  for (const a of autores) {
    const k = partidoPorChave.get(a.chave) ?? null;
    const x = m.get(k) ?? { valor: 0, autores: 0 };
    x.valor += a.valor; x.autores++;
    m.set(k, x);
  }
  return [...m].map(([partido, x]) => ({ partido, ...x }))
    .sort((a, b) => (a.partido === null ? 1 : 0) - (b.partido === null ? 1 : 0) || b.valor - a.valor);
}
