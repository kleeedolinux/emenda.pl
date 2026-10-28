// Federações partidárias (Lei 14.208/2021). Curadoria conferida no TSE (lista de federações registradas)
// e nas notícias oficiais de deferimento, out/2026. Bancadas, emendas e votos vêm sempre ao vivo. Puro.
import { semAcento } from "@emenda/contracts";
import { categoriaVoto, normPartido, type VotoCamara } from "@/features/legislativo/votacao";

export interface FonteFed { label: string; href: string }
export interface Federacao {
  id: string;
  nome: string;
  /** sigla/apelido usado pelo TSE ou pela imprensa oficial */
  sigla?: string;
  /** siglas como aparecem na Câmara (ordem oficial) */
  partidos: string[];
  /** data do deferimento do registro no TSE */
  deferimento: string;
  /** rótulo usado nas orientações de bancada da Câmara (ex.: "Fdr PT-PCdoB-PV") */
  rotuloCamara?: string;
  /** variações de nome encontradas em textos oficiais */
  aliases?: string[];
  fontes: FonteFed[];
}

const TSE_LISTA: FonteFed = { label: "TSE — Federações partidárias registradas", href: "https://www.tse.jus.br/partidos/federacoes-registradas-no-tse" };
export const LEI_FEDERACOES: FonteFed = { label: "Lei 14.208/2021 (cria as federações)", href: "https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14208.htm" };
export const STF_ADI7021: FonteFed = { label: "STF — ADI 7021 (valida as federações)", href: "https://noticias.stf.jus.br/postsnoticias/stf-valida-lei-que-permite-federacoes-partidarias/" };

export const FEDERACOES: Federacao[] = [
  {
    id: "brasil-da-esperanca", nome: "Federação Brasil da Esperança", sigla: "FE BRASIL", partidos: ["PT", "PCdoB", "PV"], deferimento: "2022-05-24",
    rotuloCamara: "Fdr PT-PCdoB-PV", aliases: ["Federação Brasil da Esperança", "FE Brasil", "Fdr PT-PCdoB-PV"],
    fontes: [TSE_LISTA],
  },
  {
    id: "psdb-cidadania", nome: "Federação PSDB Cidadania", partidos: ["PSDB", "CIDADANIA"], deferimento: "2022-05-26",
    rotuloCamara: "Fdr PSDB-CIDADANIA", aliases: ["Federação PSDB Cidadania", "Federação PSDB-Cidadania", "Fdr PSDB-CIDADANIA", "Fed PSDB CIDAD."],
    fontes: [TSE_LISTA],
  },
  {
    id: "psol-rede", nome: "Federação PSOL REDE", partidos: ["PSOL", "REDE"], deferimento: "2022-05-26",
    rotuloCamara: "Fdr PSOL-REDE", aliases: ["Federação PSOL REDE", "Federação PSOL-Rede", "Fdr PSOL-REDE"],
    fontes: [TSE_LISTA],
  },
  {
    id: "renovacao-solidaria", nome: "Federação Renovação Solidária", partidos: ["PRD", "SOLIDARIEDADE"], deferimento: "2025-12-04",
    aliases: ["Federação Renovação Solidária", "Renovação Solidária", "Fdr PRD-SOLIDARIEDADE"],
    fontes: [TSE_LISTA, { label: "TSE — Aprovação da federação Renovação Solidária (dez/2025)", href: "https://www.tse.jus.br/comunicacao/noticias/2025/Dezembro/tse-aprova-criacao-da-federacao-renovacao-solidaria" }],
  },
  {
    id: "uniao-progressista", nome: "Federação União Progressista", partidos: ["UNIÃO", "PP"], deferimento: "2026-03-26",
    aliases: ["Federação União Progressista", "União Progressista", "Fdr UNIÃO-PP"],
    fontes: [TSE_LISTA, { label: "TSE — Registro da federação União Progressista (mar/2026)", href: "https://www.tse.jus.br/comunicacao/noticias/2026/Marco/tse-aprova-registro-da-federacao-uniao-progressista-1" }],
  },
];

export const federacaoPorId = (id: string) => FEDERACOES.find((f) => f.id === id) ?? null;

export function federacaoDoPartido(sigla: string): Federacao | null {
  const k = normPartido(sigla);
  if (!k) return null;
  return FEDERACOES.find((f) => f.partidos.some((p) => normPartido(p) === k)) ?? null;
}

const chave = (s: string) => semAcento(s).toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

/** "Fdr PT-PCdoB-PV", "Federação PSDB Cidadania", "FE BRASIL"... -> federação. */
export function federacaoPorTexto(t: string): Federacao | null {
  const k = chave(t);
  if (!k) return null;
  const direto = FEDERACOES.find((f) => [f.nome, f.sigla, f.rotuloCamara, ...(f.aliases ?? [])].some((a) => a && chave(a) === k));
  if (direto) return direto;
  // "Fdr A-B-C" / "Fed A B": mesmo conjunto de partidos (aceita abreviações como "CIDAD.")
  const m = /^(?:FDR|FED|FEDERACAO)\s+(.+)$/.exec(k);
  if (!m) return null;
  const toks = m[1]!.split(" ").filter(Boolean);
  return FEDERACOES.find((f) => f.partidos.length === toks.length && toks.every((x) => f.partidos.some((p) => normPartido(p).startsWith(x)))) ?? null;
}

/** Lei 14.208/2021: os partidos ficam na federação por no mínimo 4 anos. */
export function vigencia(f: Pick<Federacao, "deferimento">, hoje = new Date().toISOString().slice(0, 10)) {
  const minimoAte = `${Number(f.deferimento.slice(0, 4)) + 4}${f.deferimento.slice(4, 10)}`;
  return { minimoAte, cumpriuMinimo: hoje >= minimoAte };
}

// ---------- coesão nas votações ----------
export type Posicao = "sim" | "nao" | "dividido" | null;
export interface PlacarPartido { partido: string; sim: number; nao: number; outros: number; total: number; posicao: Posicao }
export interface Coesao {
  partidos: PlacarPartido[];
  sim: number; nao: number; outros: number; total: number;
  posicao: Posicao;
  /** fatia dos votos Sim/Não que seguiram a posição majoritária da federação (null sem votos) */
  coesao: number | null;
  /** todos os partidos com voto tomaram a mesma posição majoritária */
  unida: boolean;
}

const posicao = (sim: number, nao: number): Posicao => (sim + nao === 0 ? null : sim === nao ? "dividido" : sim > nao ? "sim" : "nao");

export function coesaoFederacao(votos: VotoCamara[], f: Pick<Federacao, "partidos">): Coesao {
  const partidos: PlacarPartido[] = f.partidos.map((partido) => ({ partido, sim: 0, nao: 0, outros: 0, total: 0, posicao: null }));
  for (const v of votos) {
    const p = partidos.find((x) => normPartido(x.partido) === normPartido(v.deputado_.siglaPartido));
    if (!p) continue;
    const c = categoriaVoto(v.tipoVoto);
    if (c === "sim") p.sim++; else if (c === "nao") p.nao++; else p.outros++;
    p.total++;
  }
  for (const p of partidos) p.posicao = posicao(p.sim, p.nao);
  const sim = partidos.reduce((s, p) => s + p.sim, 0);
  const nao = partidos.reduce((s, p) => s + p.nao, 0);
  const outros = partidos.reduce((s, p) => s + p.outros, 0);
  const pos = posicao(sim, nao);
  const com = partidos.filter((p) => p.posicao !== null);
  return {
    partidos, sim, nao, outros, total: sim + nao + outros, posicao: pos,
    coesao: sim + nao ? Math.max(sim, nao) / (sim + nao) : null,
    unida: pos !== null && pos !== "dividido" && com.every((p) => p.posicao === pos),
  };
}
