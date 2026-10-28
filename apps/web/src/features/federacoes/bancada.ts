// Bancada combinada de uma federação e escolha da votação de referência de cada pauta. Puro.
import { dedupeDeputados, encontrarAutor, type DeputadoLista, type IndiceAutores, type SenadorResumo, type VotacaoLista } from "@/features/legislativo/api";
import { normPartido, placarDaDescricao } from "@/features/legislativo/votacao";
import type { Federacao } from "./dados";

export interface BancadaFed {
  deputados: (DeputadoLista & { pago: number | null })[];
  senadores: (SenadorResumo & { pago: number | null })[];
  porPartido: { partido: string; deputados: number; senadores: number; pago: number }[];
  /** centavos; null sem índice de autores */
  pago: number | null;
  /** parlamentares encontrados no índice de autores de emendas */
  encontrados: number;
}

export function bancadaFederacao(f: Pick<Federacao, "partidos">, deps: DeputadoLista[], sens: SenadorResumo[], idx: IndiceAutores | null): BancadaFed {
  const doPartido = (p: string) => f.partidos.find((x) => normPartido(x) === normPartido(p));
  const pagoDe = (nomes: string[]) => (idx ? encontrarAutor(idx, nomes)?.pago ?? null : null);
  const deputados = dedupeDeputados(deps).filter((d) => doPartido(d.siglaPartido)).map((d) => ({ ...d, pago: pagoDe([d.nome]) }));
  const senadores = sens.filter((s) => doPartido(s.partido)).map((s) => ({ ...s, pago: pagoDe([s.nome, s.nomeCompleto]) }));
  const porPartido = f.partidos.map((partido) => {
    const ds = deputados.filter((d) => doPartido(d.siglaPartido) === partido);
    const ss = senadores.filter((s) => doPartido(s.partido) === partido);
    return { partido, deputados: ds.length, senadores: ss.length, pago: [...ds, ...ss].reduce((t, x) => t + (x.pago ?? 0), 0) };
  });
  const todos = [...deputados, ...senadores];
  return {
    deputados, senadores, porPartido,
    pago: idx ? todos.reduce((t, x) => t + (x.pago ?? 0), 0) : null,
    encontrados: todos.filter((x) => x.pago !== null).length,
  };
}

/** Votação nominal do Plenário com mais votos (a decisão principal sobre a pauta). */
export function votacaoPrincipal(vs: VotacaoLista[]): VotacaoLista | null {
  let best: VotacaoLista | null = null;
  let max = -1;
  for (const v of vs) {
    if (v.siglaOrgao !== "PLEN") continue;
    const p = placarDaDescricao(v.descricao);
    if (!p) continue;
    const t = p.total || p.sim + p.nao + p.abstencao;
    if (t > max || (t === max && best && v.dataHoraRegistro > best.dataHoraRegistro)) { best = v; max = t; }
  }
  return best;
}
