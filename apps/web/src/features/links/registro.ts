// Hiperlinks automáticos em texto livre (ementas, tramitações, despachos, pautas). Puro.
// Registro: cada tipo de entidade é um Matcher (encontra trechos -> entidade com href).
// Precedência: mais à esquerda; no mesmo início, o mais longo; no mesmo trecho, maior prioridade.
// Outros módulos estendem com `registrarMatcher` (e, opcionalmente, um preview em ./renderers).
import { semAcento, UFS } from "@emenda/contracts";
import { COMISSOES, hrefComissao, porSigla, type ComissaoRef } from "@/features/comissoes/catalogo";
import { FEDERACOES, federacaoPorTexto } from "@/features/federacoes/dados";

export type Casa = "camara" | "senado";
export interface NomeConhecido { nome: string; href: string; descricao?: string }
export interface LinkCtx {
  /** Casa do texto: desempata siglas (CCJ, CE) e nomes de comissões. Padrão: Câmara. */
  casa?: Casa;
  /** Parlamentares conhecidos (nome exato como aparece no texto). */
  nomes?: readonly NomeConhecido[];
  /** Índice de municípios: chaveMunicipio(nome, uf) -> código IBGE. Sem ele, "Cidade/UF" não vira link. */
  municipios?: ReadonlyMap<string, number>;
}

export interface Entidade {
  tipo: string;
  /** rota interna (/partido/PT) ou URL externa (https://...) */
  href: string;
  externo?: boolean;
  /** título do cartão de pré-visualização */
  titulo: string;
  descricao?: string;
  /** dados extras para resolução preguiçosa (ex.: proposição -> id da Câmara) */
  dados?: Record<string, string | number>;
}
export interface Ocorrencia { inicio: number; fim: number; entidade: Entidade }
export interface Candidato extends Ocorrencia { prioridade: number }
export interface Matcher { tipo: string; prioridade: number; encontrar(texto: string, ctx: LinkCtx): Ocorrencia[] }
export interface Segmento { texto: string; entidade?: Entidade }

// ---------- utilidades ----------
const L = "\\p{L}\\p{N}";
/** Não colado em letra/dígito dos dois lados. */
const isolado = (src: string) => `(?<![${L}])(?:${src})(?![${L}])`;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const num = (s: string) => Number(s.replace(/\./g, ""));
const PLANALTO = "https://www.planalto.gov.br/ccivil_03";
const LEXML = "https://www.lexml.gov.br";
export const chaveMunicipio = (nome: string, uf: string) => `${semAcento(nome).toLowerCase().replace(/[\s'’-]+/g, " ").trim()}|${uf.toUpperCase()}`;

function todos(re: RegExp, t: string, f: (m: RegExpExecArray) => Ocorrencia | Ocorrencia[] | null): Ocorrencia[] {
  const out: Ocorrencia[] = [];
  re.lastIndex = 0;
  for (let m = re.exec(t); m; m = re.exec(t)) {
    const r = f(m);
    if (r) out.push(...(Array.isArray(r) ? r : [r]));
    if (m[0] === "") re.lastIndex++;
  }
  return out;
}

const UF_SIGLAS = Object.keys(UFS);
const UF_ALT = UF_SIGLAS.join("|");
const ufEnt = (uf: string): Entidade => ({ tipo: "uf", href: `/uf/${uf}`, titulo: UFS[uf as keyof typeof UFS], descricao: "Emendas, parlamentares e municípios do estado." });

// ---------- proposições ----------
const TIPOS_PROP: Record<string, string> = { PL: "PL", PLP: "PLP", PEC: "PEC", MPV: "MPV", MP: "MPV", PDL: "PDL", PLN: "PLN", PRC: "PRC", REQ: "REQ" };
const LONGOS: [string, string][] = [
  ["Projeto de Lei Complementar", "PLP"], ["Projeto de Lei do Congresso Nacional", "PLN"], ["Projeto de Lei", "PL"],
  ["Proposta de Emenda à Constituição", "PEC"], ["Proposta de Emenda Constitucional", "PEC"], ["Medida Provisória", "MPV"],
  ["Projeto de Decreto Legislativo", "PDL"], ["Projeto de Resolução", "PRC"],
];
const NUM = "\\d{1,3}(?:\\.\\d{3})+|\\d+";
const NO = "(?:n[º°o]?\\.?\\s*|nº\\s*)?";
const ANO = "(?:\\s*\\/\\s*(\\d{4})|,?\\s+de\\s+(\\d{4}))(?![\\d])";
const RE_PROP_CURTA = new RegExp(isolado(`(${Object.keys(TIPOS_PROP).join("|")})\\s+${NO}(${NUM})(?:-[A-Z])?${ANO}`), "gu");
const RE_PROP_LONGA = new RegExp(`(?<![${L}])(${LONGOS.map(([l]) => esc(l)).join("|")})\\s+${NO}(${NUM})${ANO}`, "gu");

function propEnt(sigla: string, numero: number, ano: number): Entidade {
  return {
    tipo: "proposicao", href: `/proposicoes?tipo=${sigla}&numero=${numero}&ano=${ano}`,
    titulo: `${sigla} ${numero}/${ano}`, dados: { siglaTipo: sigla, numero, ano },
  };
}
const proposicao: Matcher = {
  tipo: "proposicao", prioridade: 70,
  encontrar: (t) => [
    ...todos(RE_PROP_CURTA, t, (m) => ({ inicio: m.index, fim: m.index + m[0].length, entidade: propEnt(TIPOS_PROP[m[1]!]!, num(m[2]!), Number(m[3] ?? m[4])) })),
    ...todos(RE_PROP_LONGA, t, (m) => {
      const sig = LONGOS.find(([l]) => l === m[1])![1];
      return { inicio: m.index, fim: m.index + m[0].length, entidade: propEnt(sig, num(m[2]!), Number(m[3] ?? m[4])) };
    }),
  ],
};

// ---------- leis ----------
const MES = "janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro";
const RE_LEI = new RegExp(
  `(?<![${L}])(Lei Complementar|Lei Ordinária|Lei|Decreto-Lei|Emenda Constitucional)\\s+${NO}(${NUM})` +
  `(?:\\s*\\/\\s*(\\d{4})|,?\\s+de\\s+(?:\\d{1,2}º?\\s+de\\s+(?:${MES})\\s+de\\s+)?(\\d{4}))?(?![${L}\\/])`, "giu",
);
/** Pasta do Planalto por mandato presidencial ("_ato2023-2026"); antes de 2004 não há padrão estável. */
function atoPlanalto(ano: number): string | null {
  if (ano < 2004) return null;
  if (ano <= 2006) return "_ato2004-2006";
  const a = 2007 + Math.floor((ano - 2007) / 4) * 4;
  return `_ato${a}-${a + 3}`;
}
function leiEnt(tipo: string, n: number, ano: number | null, rotulo: string): Entidade {
  const t = semAcento(tipo).toLowerCase();
  let href: string;
  if (t === "lei complementar") href = `${PLANALTO}/leis/lcp/lcp${n}.htm`;
  else if (t === "emenda constitucional") href = `${PLANALTO}/constituicao/emendas/emc/emc${n}.htm`;
  else if (t === "decreto-lei") href = ano ? `${LEXML}/urn/urn:lex:br:federal:decreto.lei:${ano};${n}` : `${LEXML}/busca/search?keyword=${encodeURIComponent(`decreto-lei ${n}`)}`;
  else if (ano && atoPlanalto(ano)) href = `${PLANALTO}/${atoPlanalto(ano)}/${ano}/lei/l${n}.htm`;
  else if (ano) href = `${LEXML}/urn/urn:lex:br:federal:lei:${ano};${n}`;
  else href = `${LEXML}/busca/search?keyword=${encodeURIComponent(`lei ${n}`)}`;
  return { tipo: "lei", href, externo: true, titulo: rotulo, descricao: href.includes("planalto") ? "Texto oficial no Planalto." : "Texto oficial no LexML (Senado)." };
}
const lei: Matcher = {
  tipo: "lei", prioridade: 65,
  encontrar: (t) => todos(RE_LEI, t, (m) => {
    // "Lei" sozinha só com maiúscula inicial (evita "lei 123" em frases).
    if (!/^[LDE]/.test(m[1]!)) return null;
    const ano = m[3] ?? m[4];
    return { inicio: m.index, fim: m.index + m[0].length, entidade: leiEnt(m[1]!, num(m[2]!), ano ? Number(ano) : null, m[0]) };
  }),
};

// ---------- Constituição ----------
const RE_CF = new RegExp(
  `(?<![${L}])(arts?\\.|artigos?)\\s+(\\d+)(?:º|°|o)?(?:-([A-Z]))?((?:\\s*(?:,|e|a)\\s*\\d+(?:º|°)?(?:-[A-Z])?)*)` +
  `(?:,?\\s*(?:§+\\s*\\d+º?|inciso\\s+[IVXLC]+|caput)[^,.;]{0,0})?\\s+da\\s+(Constituição(?: Federal| da República)?|CF(?:\\/88)?)(?![${L}])`, "giu",
);
const constituicao: Matcher = {
  tipo: "constituicao", prioridade: 65,
  encontrar: (t) => todos(RE_CF, t, (m) => {
    const ancora = `art${m[2]}${m[3] ? m[3].toLowerCase() : ""}`;
    return {
      inicio: m.index, fim: m.index + m[0].length,
      entidade: { tipo: "constituicao", href: `${PLANALTO}/constituicao/constituicao.htm#${ancora}`, externo: true, titulo: `Constituição Federal, art. ${m[2]}${m[3] ? `-${m[3]}` : ""}`, descricao: "Texto da Constituição no Planalto." },
    };
  }),
};

// ---------- partidos (+ UF em "(PT-SP)", "PT/PB") ----------
/** Siglas como a Câmara/Senado escrevem. PL só com contexto de partido: "(PL)" ou "PL-SP". */
export const PARTIDOS = [
  "PT", "PL", "PSOL", "PP", "PSD", "MDB", "UNIÃO", "REPUBLICANOS", "PSB", "PDT", "PSDB", "PODE", "PODEMOS", "AVANTE", "SOLIDARIEDADE",
  "PCdoB", "PV", "NOVO", "CIDADANIA", "REDE", "PRD", "MISSÃO", "PRTB", "AGIR", "MOBILIZA", "DC", "PMB", "PCO", "PSTU", "UP", "PCB", "Republicanos", "Novo", "Rede", "Cidadania", "Solidariedade", "Avante", "Podemos",
];
const AVULSOS = ["PT", "PSOL", "PP", "PSD", "MDB", "UNIÃO", "REPUBLICANOS", "PSB", "PDT", "PSDB", "PODE", "PODEMOS", "AVANTE", "SOLIDARIEDADE", "PCdoB", "PV", "NOVO", "CIDADANIA", "REDE", "PRD", "MISSÃO", "PRTB", "MOBILIZA"];
const longos = (xs: string[]) => [...xs].sort((a, b) => b.length - a.length).map(esc).join("|");
const RE_TAG = new RegExp(isolado(`(${longos(PARTIDOS)})\\s?[-/]\\s?(${UF_ALT})`), "gu");
const RE_PART_PAREN = new RegExp(`\\((${longos(PARTIDOS)})\\)`, "gu");
const RE_PART = new RegExp(isolado(`(${longos(AVULSOS)})`) + "(?!\\s*(?:n[º°o.]|\\d))", "gu");
const partEnt = (sigla: string): Entidade => ({ tipo: "partido", href: `/partido/${encodeURIComponent(sigla.toUpperCase() === "PCDOB" ? "PCdoB" : sigla)}`, titulo: `Partido: ${sigla}`, descricao: "Bancada, liderança e emendas do partido." });

const partido: Matcher = {
  tipo: "partido", prioridade: 40,
  encontrar: (t) => [
    ...todos(RE_TAG, t, (m) => {
      const ini = m.index;
      const ufIni = ini + m[0].length - m[2]!.length;
      return [
        { inicio: ini, fim: ini + m[1]!.length, entidade: partEnt(m[1]!) },
        { inicio: ufIni, fim: ufIni + 2, entidade: ufEnt(m[2]!) },
      ];
    }),
    ...todos(RE_PART_PAREN, t, (m) => ({ inicio: m.index + 1, fim: m.index + 1 + m[1]!.length, entidade: partEnt(m[1]!) })),
    ...todos(RE_PART, t, (m) => ({ inicio: m.index, fim: m.index + m[0].length, entidade: partEnt(m[1]!) })),
  ],
};

// ---------- federações ----------
const FED_NOMES = [...new Set(FEDERACOES.flatMap((f) => [f.nome, f.rotuloCamara, ...(f.aliases ?? [])].filter((x): x is string => !!x)))];
const RE_FED = new RegExp(isolado(`${longos(FED_NOMES)}|Fdr\\s+[A-Za-zÀ-ú]+(?:-[A-Za-zÀ-ú]+)+`), "gu");
const federacao: Matcher = {
  tipo: "federacao", prioridade: 60,
  encontrar: (t) => todos(RE_FED, t, (m) => {
    const f = federacaoPorTexto(m[0]);
    return f ? { inicio: m.index, fim: m.index + m[0].length, entidade: { tipo: "federacao", href: `/federacao/${f.id}`, titulo: f.nome, descricao: `Federação partidária: ${f.partidos.join(", ")}.` } } : null;
  }),
};

// ---------- UF (sigla entre parênteses; nome por extenso) ----------
const AMBIGUOS = new Set(["SP", "RJ"]); // nome do estado = nome da capital: só com "Estado de"
const NOMES_UF = Object.entries(UFS);
const RE_UF_PAREN = new RegExp(`\\((${UF_ALT})\\)`, "gu");
const RE_UF_ESTADO = new RegExp(`(?<![${L}])Estado d[eoa] (${longos(NOMES_UF.map(([, n]) => n))})(?![${L}])`, "gu");
const RE_UF_NOME = new RegExp(isolado(longos(NOMES_UF.filter(([s]) => !AMBIGUOS.has(s)).map(([, n]) => n))), "gu");
const ufPorNome = (n: string) => NOMES_UF.find(([, x]) => x === n)?.[0] ?? null;
const uf: Matcher = {
  tipo: "uf", prioridade: 50,
  encontrar: (t) => [
    ...todos(RE_UF_PAREN, t, (m) => ({ inicio: m.index + 1, fim: m.index + 3, entidade: ufEnt(m[1]!) })),
    ...todos(RE_UF_ESTADO, t, (m) => { const s = ufPorNome(m[1]!); return s ? { inicio: m.index, fim: m.index + m[0].length, entidade: ufEnt(s) } : null; }),
    ...todos(RE_UF_NOME, t, (m) => { const s = ufPorNome(m[0]); return s ? { inicio: m.index, fim: m.index + m[0].length, entidade: ufEnt(s) } : null; }),
  ],
};

// ---------- municípios "Cidade/UF" ----------
const PAL = "[A-ZÀ-Ý][\\p{Ll}'’]+";
const RE_MUN = new RegExp(`(?<![${L}])(${PAL}(?:(?:[ -](?:d[aeo]s? |e )?)${PAL})*)\\s?\\/\\s?(${UF_ALT})(?![${L}])`, "gu");
const municipio: Matcher = {
  tipo: "municipio", prioridade: 55,
  encontrar: (t, ctx) => {
    const idx = ctx.municipios;
    if (!idx) return [];
    return todos(RE_MUN, t, (m) => {
      const nome = m[1]!;
      // tenta do trecho mais longo ao mais curto ("Prefeitura de Iraquara" -> "Iraquara")
      const cortes = [0, ...[...nome.matchAll(/[ -]/g)].map((x) => x.index! + 1)];
      for (const c of cortes) {
        const n = nome.slice(c);
        if (!/^[A-ZÀ-Ý]/.test(n)) continue;
        const ibge = idx.get(chaveMunicipio(n, m[2]!));
        if (ibge) return { inicio: m.index + c, fim: m.index + m[0].length, entidade: { tipo: "municipio", href: `/municipio/${ibge}`, titulo: `${n}/${m[2]}`, descricao: "Emendas recebidas pelo município." } };
      }
      return null;
    });
  },
};

// ---------- comissões ----------
const SIGLAS_COM = [...new Set(COMISSOES.flatMap((c) => [c.sigla, ...(c.aliases ?? []).filter((a) => !a.includes(" "))]))];
const NOMES_COM = [...new Set(COMISSOES.flatMap((c) => [c.nome, ...(c.aliases ?? []).filter((a) => a.includes(" "))]))];
/** Siglas curtas demais/ambíguas só valem no Senado. */
const SO_SENADO = new Set(["CI"]);
const RE_COM_SIGLA = new RegExp(isolado(`(${longos(SIGLAS_COM)})`), "gu");
const RE_COM_NOME = new RegExp(`(?<![${L}])(${longos(NOMES_COM)})(?![${L}])`, "giu");
const comEnt = (c: ComissaoRef): Entidade => ({ tipo: "comissao", href: hrefComissao(c), titulo: `${c.sigla} — ${c.nome}`, descricao: c.oQueFaz });
function porNome(n: string, casa: Casa): ComissaoRef | null {
  const k = semAcento(n).toLowerCase();
  const hits = COMISSOES.filter((c) => [c.nome, ...(c.aliases ?? [])].some((a) => semAcento(a).toLowerCase() === k));
  return hits.find((c) => c.casa === casa) ?? hits.find((c) => c.casa === "cn") ?? hits[0] ?? null;
}
const comissao: Matcher = {
  tipo: "comissao", prioridade: 30,
  encontrar: (t, ctx) => {
    const casa = ctx.casa ?? "camara";
    return [
      ...todos(RE_COM_SIGLA, t, (m) => {
        if (SO_SENADO.has(m[1]!) && casa !== "senado") return null;
        const c = porSigla(m[1]!, casa);
        return c ? { inicio: m.index, fim: m.index + m[0].length, entidade: comEnt(c) } : null;
      }),
      ...todos(RE_COM_NOME, t, (m) => { const c = porNome(m[1]!, casa); return c ? { inicio: m.index, fim: m.index + m[0].length, entidade: comEnt(c) } : null; }),
    ];
  },
};

// ---------- parlamentares por nome (contexto) ----------
const cacheNomes = new WeakMap<readonly NomeConhecido[], { re: RegExp; por: Map<string, NomeConhecido> }>();
const parlamentar: Matcher = {
  tipo: "deputado", prioridade: 45,
  encontrar: (t, ctx) => {
    const ns = ctx.nomes;
    if (!ns?.length) return [];
    let c = cacheNomes.get(ns);
    if (!c) {
      const validos = ns.filter((n) => n.nome.trim().length >= 4);
      c = { re: new RegExp(isolado(longos(validos.map((n) => n.nome))), "gu"), por: new Map(validos.map((n) => [n.nome, n])) };
      cacheNomes.set(ns, c);
    }
    const por = c.por;
    return todos(c.re, t, (m) => {
      const n = por.get(m[0]);
      if (!n) return null;
      const tipo = n.href.startsWith("/senador") ? "senador" : "deputado";
      return { inicio: m.index, fim: m.index + m[0].length, entidade: { tipo, href: n.href, titulo: n.nome, descricao: n.descricao } };
    });
  },
};

// ---------- registro ----------
export const MATCHERS: Matcher[] = [proposicao, lei, constituicao, federacao, municipio, uf, parlamentar, partido, comissao];

/** Registra um tipo de entidade (outros módulos). Devolve a função que desfaz o registro. */
export function registrarMatcher(m: Matcher): () => void {
  MATCHERS.push(m);
  return () => { const i = MATCHERS.indexOf(m); if (i >= 0) MATCHERS.splice(i, 1); };
}

/** Resolve sobreposições: mais à esquerda; mesmo início -> mais longo; mesmo trecho -> maior prioridade. */
export function escolher(cs: Candidato[]): Candidato[] {
  const ord = cs.filter((c) => c.fim > c.inicio).sort((a, b) => a.inicio - b.inicio || (b.fim - b.inicio) - (a.fim - a.inicio) || b.prioridade - a.prioridade);
  const out: Candidato[] = [];
  let fim = -1;
  for (const c of ord) if (c.inicio >= fim) { out.push(c); fim = c.fim; }
  return out;
}

/** Texto -> segmentos (texto puro ou entidade). A concatenação dos textos é o original. */
export function autolink(texto: string, ctx: LinkCtx = {}, matchers: readonly Matcher[] = MATCHERS): Segmento[] {
  if (!texto) return [];
  const cs: Candidato[] = matchers.flatMap((m) => m.encontrar(texto, ctx).map((o) => ({ ...o, prioridade: m.prioridade })));
  const out: Segmento[] = [];
  let pos = 0;
  for (const c of escolher(cs)) {
    if (c.inicio > pos) out.push({ texto: texto.slice(pos, c.inicio) });
    out.push({ texto: texto.slice(c.inicio, c.fim), entidade: c.entidade });
    pos = c.fim;
  }
  if (pos < texto.length) out.push({ texto: texto.slice(pos) });
  return out;
}
