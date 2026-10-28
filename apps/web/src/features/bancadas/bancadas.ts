// Bancadas: agregações puras sobre frentes parlamentares (Câmara) e votações nominais.
import { semAcento, type GastosRanking } from "@emenda/contracts";
import { encontrarAutor, type IndiceAutores } from "@/features/legislativo/api";
import { categoriaVoto, type VotoCamara } from "@/features/legislativo/votacao";
import { BANCADAS_TEMATICAS, bancadaPorId, bancadaPorSlug } from "./catalogo";

export interface FrenteLista { id: number; titulo: string; idLegislatura?: number }
export interface MembroFrente {
  id: number; nome: string; siglaPartido: string; siglaUf: string; urlFoto: string; titulo: string;
}
export interface FrenteDetalhe extends FrenteLista {
  telefone: string | null; email: string | null; situacao: string | null; urlWebsite: string | null; urlDocumento: string | null;
  coordenador: { id: number; nome: string; siglaPartido: string; siglaUf: string; urlFoto: string } | null;
}

const k = (s: string) => semAcento(s).toLowerCase().replace(/\s+/g, " ").trim();

/** Índice de Rice: |Sim − Não| / (Sim + Não). 1 = todos votaram igual; 0 = divisão meio a meio. */
export function coesao(sim: number, nao: number): number | null {
  const t = sim + nao;
  return t > 0 ? Math.abs(sim - nao) / t : null;
}

export interface VotoGrupo {
  sim: number; nao: number; outros: number;
  /** membros sem voto registrado nesta votação */
  ausentes: number;
  votantes: number;
  /** Sim / (Sim + Não) */
  pctSim: number | null;
  coesao: number | null;
}

/** Placar de um grupo numa votação. Sem `membros` = plenário inteiro. */
export function votoGrupo(votos: readonly VotoCamara[], membros?: ReadonlySet<number>): VotoGrupo {
  let sim = 0, nao = 0, outros = 0;
  const viu = new Set<number>();
  for (const v of votos) {
    const id = v.deputado_.id;
    if (membros && !membros.has(id)) continue;
    viu.add(id);
    const c = categoriaVoto(v.tipoVoto);
    if (c === "sim") sim++; else if (c === "nao") nao++; else outros++;
  }
  const votantes = sim + nao + outros;
  return {
    sim, nao, outros, votantes,
    ausentes: membros ? membros.size - viu.size : 0,
    pctSim: sim + nao > 0 ? sim / (sim + nao) : null,
    coesao: coesao(sim, nao),
  };
}

/** Contagem por chave (partido, UF...), maior primeiro. */
export function composicao<T>(xs: readonly T[], chave: (x: T) => string): Array<{ label: string; value: number }> {
  const m = new Map<string, number>();
  for (const x of xs) {
    const c = chave(x) || "S/PART";
    m.set(c, (m.get(c) ?? 0) + 1);
  }
  return [...m].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "pt-BR"));
}

/** Primeira data ("dd/mm/aaaa") do histórico de situação = recebimento do pedido de registro. */
export function dataRegistro(situacao: string | null | undefined): string | null {
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(situacao ?? "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Busca sem acento no título oficial e nos apelidos do catálogo. */
export function buscarFrentes<T extends FrenteLista>(fs: readonly T[], q: string): T[] {
  const t = k(q);
  if (!t) return [...fs];
  return fs.filter((f) => {
    const b = bancadaPorId(f.id);
    const alvo = k([f.titulo, b?.apelido ?? "", ...(b?.aliases ?? [])].join(" | "));
    return alvo.includes(t);
  });
}

export function ordenarFrentes<T extends { id: number; titulo: string }>(fs: readonly T[], por: "nome" | "tamanho", tamanhos: ReadonlyMap<number, number>): T[] {
  const nome = (a: T, b: T) => a.titulo.localeCompare(b.titulo, "pt-BR");
  if (por === "nome") return [...fs].sort(nome);
  return [...fs].sort((a, b) => (tamanhos.get(b.id) ?? -1) - (tamanhos.get(a.id) ?? -1) || nome(a, b));
}

/** "/bancada/54477" ou "/bancada/evangelica" -> id da frente. */
export function resolverBancada(param: string | undefined): number | null {
  const p = (param ?? "").trim();
  if (/^\d+$/.test(p)) return Number(p);
  return p ? (bancadaPorSlug(p.toLowerCase())?.id ?? null) : null;
}

/** Emendas pagas somadas dos membros (cruzamento por nome com autores.json). */
export function somaEmendas(ms: readonly Pick<MembroFrente, "nome">[], idx: IndiceAutores) {
  let pago = 0, encontrados = 0;
  for (const m of ms) {
    const a = encontrarAutor(idx, [m.nome]);
    if (a) { pago += a.pago; encontrados++; }
  }
  return { pago, encontrados, total: ms.length };
}

/** Cota parlamentar (legislatura corrente) somada dos membros, pelo id da Câmara. */
export function somaGastos(ms: readonly Pick<MembroFrente, "id">[], r: Pick<GastosRanking, "parlamentares">) {
  const porId = new Map(r.parlamentares.filter((p) => p.casa === "camara").map((p) => [p.id, p.mandato]));
  let valor = 0, encontrados = 0;
  for (const m of ms) {
    const g = porId.get(String(m.id));
    if (g != null) { valor += g; encontrados++; }
  }
  return { valor, encontrados, total: ms.length };
}

export interface BancadaUf { uf: string; deputados: number; senadores: number; total: number }
export function bancadasPorUf(deps: readonly { siglaUf: string }[], sens: readonly { uf: string }[]): BancadaUf[] {
  const m = new Map<string, BancadaUf>();
  const get = (uf: string) => m.get(uf) ?? m.set(uf, { uf, deputados: 0, senadores: 0, total: 0 }).get(uf)!;
  for (const d of deps) if (d.siglaUf) { const r = get(d.siglaUf); r.deputados++; r.total++; }
  for (const s of sens) if (s.uf) { const r = get(s.uf); r.senadores++; r.total++; }
  return [...m.values()].sort((a, b) => a.uf.localeCompare(b.uf));
}

export const IDS_TEMATICAS = BANCADAS_TEMATICAS.map((b) => b.id);
