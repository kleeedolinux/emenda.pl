// Contadores ao vivo a partir de dados oficiais: arrecadação federal (Receita) e cota parlamentar. Puro.
import type { GastosRankingParlamentar } from "@emenda/contracts";
import { rotuloCategoria } from "@/features/gastos/gastos";

/** Espelho de v1/arrecadacao.json (gerado por `emenda-arrecadacao`, crates/etl/src/arrecadacao). Centavos. */
export interface Arrecadacao {
  fonte: string;
  ate: string;
  meses: Array<{ mes: string; valor: number }>;
  anos: Array<{ ano: number; valor: number; meses: number }>;
  tributos: Array<{ nome: string; valor: number }>;
  ufs: Array<{ nome: string; valor: number }>;
}
export const ARRECADACAO_PATH = "/data/v1/arrecadacao.json";

const MES_MEDIO_S = 30.4375 * 86400;
/** Meia-noite de Brasília (UTC−3) do dia 1º de `ano`/`mes` (1–12), em ms. */
const inicioMesBrasilia = (ano: number, mes: number) => Date.UTC(ano, mes - 1, 1, 3);

export interface Estimativa { ano: number; oficial: number; porSegundo: number; valor: number; ate: string; desde: number }

/**
 * Estimativa do ano corrente: soma oficial dos meses publicados do ano + ritmo médio
 * (média mensal dos últimos 12 meses publicados ÷ segundos de um mês médio) × tempo desde o fim do último mês publicado.
 */
export function estimativaArrecadacao(a: Arrecadacao, agora: number): Estimativa | null {
  if (!a.meses.length) return null;
  const ult = a.meses.slice(-12);
  const porSegundo = ult.reduce((s, m) => s + m.valor, 0) / ult.length / MES_MEDIO_S;
  const ano = new Date(agora - 3 * 3600_000).getUTCFullYear();
  const oficial = a.meses.filter((m) => m.mes.startsWith(`${ano}-`)).reduce((s, m) => s + m.valor, 0);
  const [ya, ma] = a.ate.split("-").map(Number) as [number, number];
  const desde = Math.max(inicioMesBrasilia(ya, ma + 1), inicioMesBrasilia(ano, 1));
  return { ano, oficial, porSegundo, valor: oficial + porSegundo * Math.max(0, (agora - desde) / 1000), ate: a.ate, desde };
}

/** Cota parlamentar do ano (Câmara + Senado) e ritmo por segundo até o fim do mês com dados. */
export function custoCotaAno(ps: readonly GastosRankingParlamentar[], ano: number, dadosAte: string) {
  const total = ps.reduce((s, p) => s + (p.porAno[String(ano)] ?? 0), 0);
  const [y, m] = dadosAte.split("-").map(Number) as [number, number];
  const fim = y > ano ? Date.UTC(ano + 1, 0, 1) : Date.UTC(y, m, 1);
  const seg = Math.max(1, (fim - Date.UTC(ano, 0, 1)) / 1000);
  return { total, porSegundo: total / seg };
}

const TRIBUTOS: Record<string, string> = {
  "RECEITA PREVIDENCIÁRIA": "Contribuição previdenciária (INSS)",
  IRPF: "Imposto de renda — pessoa física",
  CSLL: "CSLL",
};
export function rotuloTributo(n: string): string {
  if (TRIBUTOS[n]) return TRIBUTOS[n]!;
  const m = /^(IRRF|IRPJ|IPI|COFINS|CSLL|CONTRIBUIÇÃO PARA O PIS\/PASEP) - (.+)$/.exec(n);
  if (m) {
    const base = m[1] === "IRRF" ? "IR retido na fonte" : m[1] === "IRPJ" ? "IR de empresas" : m[1] === "COFINS" ? "Cofins" : m[1] === "CONTRIBUIÇÃO PARA O PIS/PASEP" ? "PIS/Pasep" : m[1]!;
    const det = rotuloCategoria(m[2]!).toLowerCase().replace(/^rendimentos d[oe]s? /, "");
    return `${base} (${det})`;
  }
  return rotuloCategoria(n);
}
