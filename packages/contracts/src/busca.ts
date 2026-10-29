// Contrato v1/busca.json: índice compacto da busca universal (gerado por scripts/busca-indice.ts).
// Tuplas em vez de objetos para caber em poucas dezenas de KB com gzip. Valores em centavos.
import type { AutorResumo } from "./index";

export const buscaPath = () => `/data/v1/busca.json` as const;

export interface IndiceBusca {
  v: 1;
  geradoEm: string;
  /** [ibge, nome, uf, pago] */
  cidades: Array<[number, string, string, number]>;
  /** [id Câmara, nome, partido, uf, pago] — 57ª legislatura */
  deputados: Array<[number, string, string, string, number]>;
  /** [código Senado, nome, partido, uf, pago] — em exercício */
  senadores: Array<[string, string, string, string, number]>;
  /** [sigla, nome] */
  partidos: Array<[string, string]>;
  /** Autores do Portal que não são parlamentares atuais (bancadas, comissões, relator, ex-parlamentares): [código, nome, pago] */
  autores: Array<[string, string, number]>;
  /** Prefeito(a) eleito(a) em 2024: [ibge, nome, partido]. Opcional (aditivo). */
  prefeitos?: Array<[number, string, string]>;
}

const chave = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z ]/g, " ").replace(/\s+/g, " ").trim();

export function montarIndiceBusca(i: {
  geradoEm: string;
  municipios: ReadonlyArray<readonly [number, string, string]>;
  ufs: ReadonlyArray<{ uf: string; municipios: ReadonlyArray<{ ibge: string; pago: number }> }>;
  deputados: ReadonlyArray<{ id: number; nome: string; siglaPartido: string; siglaUf: string }>;
  senadores: ReadonlyArray<{ codigo: string; nome: string; nomeCompleto?: string; partido: string; uf: string }>;
  partidos: ReadonlyArray<{ sigla: string; nome: string }>;
  autores: readonly AutorResumo[];
  prefeitos?: ReadonlyArray<{ ibge: string; nome: string; partido: string }>;
}): IndiceBusca {
  const pagoCidade = new Map<string, number>();
  for (const u of i.ufs) for (const m of u.municipios) pagoCidade.set(m.ibge, m.pago);
  const pagoAutor = new Map<string, number>();
  for (const a of i.autores) pagoAutor.set(chave(a.chave || a.nome), a.pago);
  const usados = new Set<string>();
  const pago = (...nomes: Array<string | undefined>) => {
    for (const n of nomes) {
      if (!n) continue;
      const c = chave(n);
      if (pagoAutor.has(c)) { usados.add(c); return pagoAutor.get(c)!; }
    }
    return 0;
  };
  const deps = new Map<number, (typeof i.deputados)[number]>();
  for (const d of i.deputados) deps.set(d.id, d); // a lista repete por troca de partido: fica a última
  return {
    v: 1,
    geradoEm: i.geradoEm,
    cidades: i.municipios.map(([id, nome, uf]) => [id, nome, uf, pagoCidade.get(String(id)) ?? 0]),
    deputados: [...deps.values()].map((d) => [d.id, d.nome, d.siglaPartido, d.siglaUf, pago(d.nome)]),
    senadores: i.senadores.map((s) => [s.codigo, s.nome, s.partido, s.uf, pago(s.nome, s.nomeCompleto)]),
    partidos: i.partidos.map((p) => [p.sigla, p.nome]),
    ...(i.prefeitos ? { prefeitos: i.prefeitos.map((p): [number, string, string] => [Number(p.ibge), p.nome, p.partido]) } : {}),
    autores: i.autores.filter((a) => a.pago > 0 && !usados.has(chave(a.chave || a.nome))).map((a) => [a.codigo, a.nome, a.pago]),
  };
}
