import type { Beneficiado, Beneficiados } from "@emenda/contracts";

export type Grupo = "empresa" | "entidade";
export type FiltroPrivados = "todos" | "empresas" | "entidades";
export type Privado = Beneficiado & { grupo: Grupo };

/** Empresas e entidades privadas numa lista só, do maior para o menor valor. */
export function privados(b: Beneficiados, filtro: FiltroPrivados = "todos"): Privado[] {
  const e = filtro === "entidades" ? [] : b.empresas.map((x) => ({ ...x, grupo: "empresa" as const }));
  const n = filtro === "empresas" ? [] : b.entidades.map((x) => ({ ...x, grupo: "entidade" as const }));
  return [...e, ...n].sort((a, z) => z.valor - a.valor);
}

export const ROTULO_GRUPO: Record<Grupo, string> = { empresa: "Empresa", entidade: "Sem fins lucrativos" };
