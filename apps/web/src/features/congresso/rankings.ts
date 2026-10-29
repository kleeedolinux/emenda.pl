// Rankings do Congresso: cruzamentos de dados oficiais por parlamentar e por partido. Puro.
import type { CasaGastos, GastosRanking } from "@emenda/contracts";
import { encontrarAutor, type IndiceAutores } from "@/features/legislativo/api";
import { categoriaVoto, mapaOrientacoes, normPartido, type Orientacao, type VotoCamara } from "@/features/legislativo/votacao";
import { coesao as rice } from "@/features/bancadas/bancadas";
import { trocasDaLista } from "@/features/perfil/resumo";
import { rotuloCategoria } from "@/features/gastos/gastos";
import { chaveMembro, type Membro } from "./composicao";

export interface Linha { membro: Membro; valor: number }
export type Posicionada<T extends Linha> = T & { posicao: number };

/** Ordena (empate: nome), numera e opcionalmente corta. */
export function ranking<T extends Linha>(xs: readonly T[], dir: "asc" | "desc" = "desc", n?: number): Posicionada<T>[] {
  const s = xs.slice().sort((a, b) => (dir === "desc" ? b.valor - a.valor : a.valor - b.valor) || a.membro.nome.localeCompare(b.membro.nome, "pt-BR"));
  return (n ? s.slice(0, n) : s).map((x, i) => ({ ...x, posicao: i + 1 }));
}

// ---------- Cota parlamentar (CEAP/CEAPS) ----------
export function gastosLinhas(r: Pick<GastosRanking, "parlamentares">, ms: readonly Membro[], periodo: number | "mandato"): Linha[] {
  const idx = new Map(r.parlamentares.map((p) => [`${p.casa}:${p.id}`, p]));
  return ranking(ms.map((membro) => {
    const p = idx.get(chaveMembro(membro));
    return { membro, valor: p ? (periodo === "mandato" ? p.mandato : (p.porAno[String(periodo)] ?? 0)) : 0 };
  })).map(({ membro, valor }) => ({ membro, valor }));
}

export interface Campeao { categoria: string; valor: number; membro: Membro | null; valorMembro: number }
/** Quem mais gastou em cada categoria no ano (o maior entre os membros conhecidos). */
export function campeoesCategoria(r: Pick<GastosRanking, "categorias">, casa: CasaGastos, ano: number, ms: readonly Membro[]): Campeao[] {
  const idx = new Map(ms.filter((m) => m.casa === casa).map((m) => [m.id, m]));
  return r.categorias
    .filter((c) => c.casa === casa && c.ano === ano)
    .map((c) => {
      const t = c.top.find((x) => idx.has(x.id));
      return { categoria: rotuloCategoria(c.categoria), valor: c.valor, membro: t ? idx.get(t.id)! : null, valorMembro: t?.valor ?? 0 };
    })
    .sort((a, b) => b.valor - a.valor || a.categoria.localeCompare(b.categoria, "pt-BR"));
}

// ---------- Emendas (Portal da Transparência) ----------
export function emendasLinhas(ms: readonly Membro[], idx: IndiceAutores): Array<Linha & { codigo: string | null }> {
  return ms.map((membro) => {
    const a = encontrarAutor(idx, [membro.nome]);
    return { membro, valor: a?.pago ?? 0, codigo: a?.codigo ?? null };
  }).sort((a, b) => b.valor - a.valor || a.membro.nome.localeCompare(b.membro.nome, "pt-BR"));
}

// ---------- Presença e fidelidade ----------
export interface Presenca { presentes: number; total: number; pct: number }
export interface Fidelidade { seguiu: number; contrariou: number; pct: number }
export interface AmostraVotacao { votos: readonly VotoCamara[]; orientacoes: readonly Orientacao[] }

/**
 * Câmara: a lista de votos traz só quem votou. Presença = votações com voto registrado / votações da amostra.
 * Fidelidade = votos Sim/Não iguais à orientação Sim/Não do próprio partido (liberado/obstrução não contam).
 * Coesão do partido = índice de Rice médio nas votações em que o partido votou.
 */
export function presencaFidelidadeCamara(amostra: readonly AmostraVotacao[], ms: readonly Membro[]) {
  const dep = ms.filter((m) => m.casa === "camara");
  const presentes = new Map<string, number>();
  const fid = new Map<string, { seguiu: number; contrariou: number }>();
  const ricePorPartido = new Map<string, number[]>();
  for (const v of amostra) {
    const { partidos } = mapaOrientacoes(v.orientacoes as Orientacao[]);
    const placar = new Map<string, { sim: number; nao: number }>();
    for (const x of v.votos) {
      const id = String(x.deputado_.id);
      presentes.set(id, (presentes.get(id) ?? 0) + 1);
      const c = categoriaVoto(x.tipoVoto ?? "");
      const p = x.deputado_.siglaPartido || "S/PART";
      const pl = placar.get(p) ?? placar.set(p, { sim: 0, nao: 0 }).get(p)!;
      if (c === "sim") pl.sim++; else if (c === "nao") pl.nao++;
      const o = partidos.get(normPartido(p));
      const oc = o ? categoriaVoto(o) : "outro";
      if ((oc === "sim" || oc === "nao") && (c === "sim" || c === "nao")) {
        const f = fid.get(id) ?? fid.set(id, { seguiu: 0, contrariou: 0 }).get(id)!;
        if (c === oc) f.seguiu++; else f.contrariou++;
      }
    }
    for (const [p, { sim, nao }] of placar) {
      const r = rice(sim, nao);
      if (r !== null) (ricePorPartido.get(p) ?? ricePorPartido.set(p, []).get(p)!).push(r);
    }
  }
  const total = amostra.length;
  const presenca = new Map<string, Presenca>();
  const fidelidade = new Map<string, Fidelidade>();
  for (const m of dep) {
    const n = presentes.get(m.id) ?? 0;
    presenca.set(m.id, { presentes: n, total, pct: total ? n / total : 0 });
    const f = fid.get(m.id);
    if (f) fidelidade.set(m.id, { ...f, pct: f.seguiu / (f.seguiu + f.contrariou) });
  }
  const coesao = new Map([...ricePorPartido].map(([p, rs]) => [p, rs.reduce((s, x) => s + x, 0) / rs.length]));
  return { presenca, fidelidade, coesao };
}

/** Senado: códigos de afastamento justificado saem do denominador (licenças, missão, atividade parlamentar, representação). */
const JUSTIFICADA = /^(L[A-Z]*|MIS|AP|REP|LAP|LC|LS|LP|LG|LAA|LANT|SAP)$/i;
const AUSENTE = /^NCom$/i;

export function presencaSenado(vs: ReadonlyArray<{ votos?: ReadonlyArray<{ codigoParlamentar: number; siglaVotoParlamentar: string }> }>): Map<string, Presenca> {
  const m = new Map<string, { presentes: number; total: number }>();
  for (const v of vs) {
    for (const x of v.votos ?? []) {
      const s = (x.siglaVotoParlamentar ?? "").trim();
      if (!s || JUSTIFICADA.test(s)) continue;
      const id = String(x.codigoParlamentar);
      const r = m.get(id) ?? m.set(id, { presentes: 0, total: 0 }).get(id)!;
      r.total++;
      if (!AUSENTE.test(s)) r.presentes++;
    }
  }
  return new Map([...m].map(([id, r]) => [id, { ...r, pct: r.total ? r.presentes / r.total : 0 }]));
}

// ---------- Trocas de partido ----------
export function trocasLinhas(
  lista: ReadonlyArray<{ id: number; nome: string; siglaPartido: string; siglaUf: string }>, ms: readonly Membro[],
): Array<Linha & { partidos: string[] }> {
  const idx = new Map(ms.filter((m) => m.casa === "camara").map((m) => [m.id, m]));
  return trocasDaLista(lista)
    .filter((t) => idx.has(String(t.id)))
    .map((t) => ({ membro: idx.get(String(t.id))!, valor: t.partidos.length - 1, partidos: t.partidos }))
    .sort((a, b) => b.valor - a.valor || a.membro.nome.localeCompare(b.membro.nome, "pt-BR"));
}

// ---------- Comparativo de partidos ----------
export interface CardPartido {
  partido: string; camara: number; senado: number; total: number; mulheres: number;
  /** média por parlamentar com dado (centavos) */
  gastoMedio: number | null;
  /** emendas pagas somadas (centavos) */
  emendas: number;
  coesao: number | null;
}

export function comparativoPartidos(
  ms: readonly Membro[],
  d: { gastos: ReadonlyMap<string, number>; emendas: ReadonlyMap<string, number>; coesao: ReadonlyMap<string, number> },
): CardPartido[] {
  const m = new Map<string, CardPartido & { gSoma: number; gN: number }>();
  for (const x of ms) {
    const c = m.get(x.partido) ?? m.set(x.partido, {
      partido: x.partido, camara: 0, senado: 0, total: 0, mulheres: 0, gastoMedio: null, emendas: 0, coesao: d.coesao.get(x.partido) ?? null, gSoma: 0, gN: 0,
    }).get(x.partido)!;
    c[x.casa]++; c.total++;
    if (x.sexo === "F") c.mulheres++;
    const g = d.gastos.get(chaveMembro(x));
    if (g) { c.gSoma += g; c.gN++; }
    c.emendas += d.emendas.get(chaveMembro(x)) ?? 0;
  }
  return [...m.values()]
    .map(({ gSoma, gN, ...c }) => ({ ...c, gastoMedio: gN ? Math.round(gSoma / gN) : null }))
    .sort((a, b) => b.total - a.total || a.partido.localeCompare(b.partido, "pt-BR"));
}

/** Maior e menor valor (> 0) de uma lista. */
export function destaques<T extends Linha>(xs: readonly T[]): { mais: T | null; menos: T | null } {
  const v = xs.filter((x) => x.valor > 0);
  if (!v.length) return { mais: null, menos: null };
  const s = ranking(v);
  return { mais: s[0]!, menos: s[s.length - 1]! } as { mais: T; menos: T };
}
