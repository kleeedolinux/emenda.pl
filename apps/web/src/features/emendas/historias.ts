// Histórias do explorador /emendas: dados resumidos + filtros -> números prontos para cartões. Puro.
// Cada resultado lista os filtros que o dado não consegue separar (`ignorados`), para o cartão avisar.
import {
  chaveNome, UFS,
  type Abertas, type AutorResumo, type Brasil, type JanelaRanking, type Pagamento, type Rankings, type SiglaUf, type TipoEmenda, type Totais, type Uf,
} from "@emenda/contracts";
import { filtrarPagamentos } from "@/features/feed/feed";
import { POPULACAO_UF } from "./populacao";

export type Dim = "tipo" | "ano" | "uf";
export interface Filtros { tipo?: TipoEmenda; ano?: number; uf?: string }

const DIMS: Dim[] = ["tipo", "ano", "uf"];
/** Filtros ativos que o dado não aceita. */
const ignorar = (f: Filtros, aceitos: Dim[]): Dim[] => DIMS.filter((d) => f[d] != null && f[d] !== "" && !aceitos.includes(d));
const vazio: Totais = { n: 0, empenhado: 0, liquidado: 0, pago: 0, rapPago: 0 };
const desc = <T,>(get: (x: T) => number) => (a: T, b: T) => get(b) - get(a);

// ---------- Autor ----------
export type ClasseAutor = "pessoa" | "bancada" | "comissao" | "relator";
export function classeAutor(nome: string): ClasseAutor {
  const n = chaveNome(nome);
  if (n.startsWith("BANCADA")) return "bancada";
  if (n.startsWith("COMISSAO") || n.startsWith("COM ")) return "comissao";
  if (n.includes("RELATOR")) return "relator";
  return "pessoa";
}

// ---------- Recorte (total do filtro) ----------
/** Totais do recorte. UF vem do arquivo da UF (`null` enquanto carrega). Tipo e ano não se cruzam: vale o tipo. */
export function recorte(brasil: Brasil, uf: Uf | null, f: Filtros): { totais: Totais; ignorados: Dim[] } | null {
  if (f.uf && !uf) return null;
  const base = f.uf && uf ? uf : brasil;
  if (f.tipo) return { totais: base.porTipo.find((t) => t.tipo === f.tipo) ?? vazio, ignorados: f.ano ? ["ano"] : [] };
  if (f.ano) return { totais: base.porAno.find((a) => a.ano === f.ano) ?? vazio, ignorados: [] };
  return { totais: base.totais, ignorados: [] };
}

// ---------- Quem mais enviou ----------
export interface AutorLinha { codigo: string; nome: string; chave: string; pago: number; n: number }
const CLASSE_DO_TIPO: Partial<Record<TipoEmenda, ClasseAutor>> = { bancada: "bancada", comissao: "comissao", relator: "relator" };

/** Ranking de autores do recorte. Padrão: só parlamentares. `null` enquanto a fonte necessária carrega. */
export function autoresDoRecorte(
  src: { autores: readonly AutorResumo[]; uf?: Uf | null; pix?: readonly AutorResumo[] | null },
  f: Filtros,
): { lista: AutorLinha[]; ignorados: Dim[] } | null {
  const classe = (f.tipo && CLASSE_DO_TIPO[f.tipo]) || "pessoa";
  // Pix nacional tem ranking próprio; individual/outra não se separam do Pix no total do autor.
  const tipoOk = !!f.tipo && (f.tipo in CLASSE_DO_TIPO || (f.tipo === "pix" && !f.uf));
  let base: readonly AutorResumo[];
  if (f.uf) { if (!src.uf) return null; base = src.uf.autores; }
  else if (f.tipo === "pix") { if (!src.pix) return null; base = src.pix; }
  else base = src.autores;
  const lista = base.filter((a) => classeAutor(a.nome) === classe).sort(desc((a) => a.pago))
    .map(({ codigo, nome, chave, pago, n }) => ({ codigo, nome, chave, pago, n }));
  return { lista, ignorados: ignorar(f, tipoOk ? ["uf", "tipo"] : ["uf"]) };
}

// ---------- Estados por habitante ----------
export interface UfPerCapita { uf: string; nome: string; pago: number; pop: number; perCapita: number }
export function ufsPerCapita(brasil: Brasil, f: Filtros): { ranking: UfPerCapita[]; destaque: (UfPerCapita & { posicao: number }) | null; ignorados: Dim[] } {
  const pagos = new Map<string, number>();
  if (f.tipo) for (const x of brasil.fluxo) { if (x.tipo === f.tipo) pagos.set(x.uf, (pagos.get(x.uf) ?? 0) + x.pago); }
  else for (const u of brasil.porUf) pagos.set(u.uf, u.pago);
  const ranking = [...pagos].flatMap(([uf, pago]) => {
    const pop = POPULACAO_UF[uf as SiglaUf];
    return pop && pago > 0 ? [{ uf, nome: UFS[uf as SiglaUf], pago, pop, perCapita: pago / pop }] : [];
  }).sort(desc((x) => x.perCapita));
  const i = f.uf ? ranking.findIndex((x) => x.uf === f.uf) : -1;
  const d = ranking[i];
  return { ranking, destaque: d ? { ...d, posicao: i + 1 } : null, ignorados: ignorar(f, ["tipo", "uf"]) };
}

// ---------- Municípios ----------
export interface MunicipioLinha { ibge: string; nome: string; uf: string; valor: number }
/** Sem UF: ranking dos últimos 12 meses (pagamentos). Com UF: histórico da UF (pago). */
export function municipiosDoRecorte(rankings: Rankings | null | undefined, uf: Uf | null, f: Filtros): { lista: MunicipioLinha[]; fonte: "12m" | "historico"; ignorados: Dim[] } | null {
  const ignorados = ignorar(f, ["uf"]);
  if (f.uf) {
    if (!uf) return null;
    return { fonte: "historico", ignorados, lista: uf.municipios.map((m) => ({ ibge: m.ibge, nome: m.nome, uf: uf.uf, valor: m.pago })).sort(desc((m) => m.valor)) };
  }
  const j = rankings?.janelas.find((x) => x.janela === "12m");
  if (!j) return null;
  return { fonte: "12m", ignorados, lista: j.municipios.map((m) => ({ ibge: m.ibge, nome: m.nome, uf: m.uf, valor: m.valor })).sort(desc((m) => m.valor)) };
}

// ---------- Tipos / Pix ----------
export function parteTipos(porTipo: ReadonlyArray<{ tipo: TipoEmenda; pago: number }>) {
  const total = porTipo.reduce((s, t) => s + t.pago, 0);
  const tipos = porTipo.map((t) => ({ tipo: t.tipo, pago: t.pago, pct: total ? t.pago / total : 0 })).sort(desc((t) => t.pago));
  return { total, tipos, pix: tipos.find((t) => t.tipo === "pix")?.pct ?? 0 };
}

// ---------- Em aberto ----------
/** Um recorte por vez: UF > tipo > ano. */
export function abertoDoRecorte(a: Abertas, f: Filtros) {
  const serie = a.porAno.map((x) => ({ ano: x.ano, aberto: x.aberto })).sort((x, y) => x.ano - y.ano);
  const pick = (x: { n: number; aberto: number } | undefined) => ({ n: x?.n ?? 0, aberto: x?.aberto ?? 0 });
  if (f.uf) return { ...pick(a.porUf.find((x) => x.uf === f.uf)), serie, ignorados: ignorar(f, ["uf"]) };
  if (f.tipo) return { ...pick(a.porTipo.find((x) => x.tipo === f.tipo)), serie, ignorados: ignorar(f, ["tipo"]) };
  if (f.ano) return { ...pick(a.porAno.find((x) => x.ano === f.ano)), serie, ignorados: [] as Dim[] };
  return { n: a.totais.n, aberto: a.totais.aberto, serie, ignorados: [] as Dim[] };
}

// ---------- Pagamentos (feed) ----------
const doFiltro = (ps: readonly Pagamento[], f: Filtros) =>
  filtrarPagamentos(ps, { tipo: f.tipo, uf: f.uf }).filter((p) => !f.ano || Math.floor(p.mes / 100) === f.ano);

export const maioresPagamentos = (ps: readonly Pagamento[], f: Filtros, n: number): Pagamento[] =>
  doFiltro(ps, f).sort((a, b) => b.valor - a.valor).slice(0, n);
export const maiorPagamento = (ps: readonly Pagamento[], f: Filtros): Pagamento | null => maioresPagamentos(ps, f, 1)[0] ?? null;

/** Mês mais recente primeiro; no mesmo mês, maior valor. */
export function ultimosPagamentos(ps: readonly Pagamento[], f: Filtros, n = 5): Pagamento[] {
  return doFiltro(ps, f).sort((a, b) => b.mes - a.mes || b.valor - a.valor).slice(0, n);
}

// ---------- Rankings recentes ----------
export interface Slide {
  janela: JanelaRanking; desde: number; ate: number; valor: number; pagamentos: number;
  valorTipo: number | null;
  top: Array<{ label: string; value: number; href: string }>;
  ignorados: Dim[];
}
export function slidesRanking(r: Rankings, f: Filtros, janelas: JanelaRanking[] = ["1m", "3m", "12m"], n = 5): Slide[] {
  return janelas.flatMap((jn) => {
    const j = r.janelas.find((x) => x.janela === jn);
    if (!j) return [];
    const u = f.uf ? j.ufs.find((x) => x.uf === f.uf) : null;
    const top = f.uf
      ? j.municipios.filter((m) => m.uf === f.uf).slice(0, n).map((m) => ({ label: m.nome, value: m.valor, href: `/municipio/${m.ibge}` }))
      : j.autores.slice(0, n).map((a) => ({ label: a.nome, value: a.valor, href: `/autor/${a.codigo}` }));
    return [{
      janela: jn, desde: j.desde, ate: j.ate,
      valor: f.uf ? (u?.valor ?? 0) : j.valor, pagamentos: f.uf ? (u?.pagamentos ?? 0) : j.pagamentos,
      valorTipo: f.tipo && !f.uf ? (j.tipos.find((t) => t.tipo === f.tipo)?.valor ?? 0) : null,
      top, ignorados: ignorar(f, f.uf ? ["uf"] : ["tipo"]),
    }];
  });
}

// ---------- Comparar ----------
export interface Comparavel { nome: string; pago: number; empenhado: number; n: number }
const ROTULOS = { pago: "Pago", empenhado: "Empenhado (reservado)", n: "Nº de emendas" } as const;
export function comparar(a: Comparavel, b: Comparavel) {
  const linhas = (["pago", "empenhado", "n"] as const).map((chave) => ({ chave, label: ROTULOS[chave], a: a[chave], b: b[chave], max: Math.max(a[chave], b[chave]) }));
  const lider = a.pago === b.pago ? null : a.pago > b.pago ? "a" : "b";
  const [hi, lo] = lider === "b" ? [b.pago, a.pago] : [a.pago, b.pago];
  return { linhas, lider, razao: lo > 0 ? hi / lo : null } as const;
}
const vezes = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const um = vezes;
export function fraseComparacao(a: Comparavel, b: Comparavel): string {
  const { lider, razao } = comparar(a, b);
  if (!lider) return `${a.nome} e ${b.nome} têm o mesmo valor pago em emendas.`;
  const [hi, lo] = lider === "a" ? [a, b] : [b, a];
  if (razao === null) return `${hi.nome} tem emendas pagas; ${lo.nome}, nenhuma.`;
  if (razao < 1.05) return `Quase empate: ${hi.nome} recebeu só ${valorExtenso(hi.pago - lo.pago)} a mais que ${lo.nome}.`;
  if (razao < 2) return `${hi.nome} recebeu ${Math.round((razao - 1) * 100)}% a mais que ${lo.nome} em emendas pagas.`;
  return `${hi.nome} recebeu ${vezes.format(razao)} vezes mais que ${lo.nome} em emendas pagas.`;
}

// ---------- Série / sparkline ----------
export const serieAnual = (porAno: ReadonlyArray<{ ano: number; pago: number }>, anos: readonly number[]) => {
  const m = new Map(porAno.map((x) => [x.ano, x.pago]));
  return anos.map((a) => m.get(a) ?? 0);
};
/** Caminho SVG da série dentro de w×h (y=0 no topo). */
export function sparkPath(vs: readonly number[], w: number, h: number): string {
  if (vs.length < 2) return "";
  const max = Math.max(...vs), min = Math.min(...vs, 0);
  const span = max - min || 1;
  const r = (n: number) => Math.round(n * 10) / 10;
  return vs.map((v, i) => `${i ? "L" : "M"}${r((i / (vs.length - 1)) * w)},${r(h - ((v - min) / span) * h)}`).join("");
}

// ---------- Fotos e partidos (Câmara + Senado) ----------
export interface Parlamentar { nome: string; foto: string; partido: string; uf: string; href: string; casa: "Câmara" | "Senado" }
export type IndiceParlamentares = Map<string, Parlamentar>;
const TITULOS = /^(DEP|DEPUTADO|DEPUTADA|SEN|SENADOR|SENADORA)\s+/;

export function indiceParlamentares(
  deps: ReadonlyArray<{ id: number; nome: string; siglaPartido: string; siglaUf: string; urlFoto: string }>,
  sens: ReadonlyArray<{ codigo: string; nome: string; nomeCompleto: string; foto: string; partido: string; uf: string }>,
): IndiceParlamentares {
  const m: IndiceParlamentares = new Map();
  for (const d of deps) m.set(chaveNome(d.nome), { nome: d.nome, foto: d.urlFoto, partido: d.siglaPartido, uf: d.siglaUf, href: `/deputado/${d.id}`, casa: "Câmara" });
  for (const s of sens) {
    const p: Parlamentar = { nome: s.nome, foto: s.foto, partido: s.partido, uf: s.uf, href: `/senador/${s.codigo}`, casa: "Senado" };
    m.set(chaveNome(s.nome), p);
    if (!m.has(chaveNome(s.nomeCompleto))) m.set(chaveNome(s.nomeCompleto), p);
  }
  return m;
}
export function parlamentarDe(idx: IndiceParlamentares, chave: string): Parlamentar | null {
  const c = chaveNome(chave);
  return idx.get(c) ?? idx.get(c.replace(TITULOS, "")) ?? null;
}

// ---------- Texto ----------
const MINUSCULAS = new Set(["DA", "DAS", "DE", "DO", "DOS", "E"]);
/** "VENEZIANO VITAL DO REGO" -> "Veneziano Vital do Rego". Siglas curtas após hífen ficam (CAS). */
export function nomeProprio(s: string): string {
  return s.split(/\s+/).map((w, i, ws) => {
    if (i > 0 && MINUSCULAS.has(w)) return w.toLowerCase();
    if (ws[i - 1] === "-" && w.length <= 4) return w;
    return w.charAt(0) + w.slice(1).toLowerCase();
  }).join(" ");
}

/** Centavos -> "R$ 194,6 bilhões" (leitura em voz alta, sem abreviação). */
export function valorExtenso(centavos: number): string {
  const r = centavos / 100;
  const escalas: Array<[number, string, string]> = [[1e9, "bilhão", "bilhões"], [1e6, "milhão", "milhões"], [1e3, "mil", "mil"]];
  for (const [base, sing, plur] of escalas) {
    if (r >= base) { const v = Math.round((r / base) * 10) / 10; return `R$ ${um.format(v)} ${v < 2 ? sing : plur}`; }
  }
  return `R$ ${um.format(Math.round(r))}`;
}

const ARTIGO: Partial<Record<SiglaUf, "no" | "na">> = {
  AC: "no", AM: "no", AP: "no", CE: "no", DF: "no", ES: "no", MA: "no", MT: "no", MS: "no", PA: "no", PR: "no",
  PI: "no", RJ: "no", RN: "no", RS: "no", TO: "no", BA: "na", PB: "na",
};
/** "BA" -> "na Bahia"; "SP" -> "em São Paulo". */
export const noEstado = (uf: string) => `${ARTIGO[uf as SiglaUf] ?? "em"} ${UFS[uf as SiglaUf] ?? uf}`;

const TIPO_CURTO: Record<TipoEmenda, string> = { pix: "Emenda Pix", individual: "emendas individuais", bancada: "emendas de bancada", comissao: "emendas de comissão", relator: "emendas de relator", outra: "outras emendas" };
/** Descrição do recorte só com os filtros que o dado respeitou. */
export function recorteTexto(f: Filtros, ignorados: readonly Dim[]): string {
  const ok = (d: Dim) => !!f[d] && !ignorados.includes(d);
  return [ok("tipo") && TIPO_CURTO[f.tipo!], ok("ano") && `em ${f.ano}`, ok("uf") && noEstado(f.uf!)].filter(Boolean).join(" ");
}
