// "Resumo em linguagem simples" de parlamentares + trocas de partido. Puro.
import { formatBRL } from "@emenda/contracts";
import { categoriaVoto, placarDaDescricao } from "@/features/legislativo/votacao";
import { PAUTAS, type Pauta } from "@/features/legislativo/pautas";

export interface PerfilEmendas { pago: number; pctPix: number; funcao: string | null; municipios: number }
export interface ResumoInput {
  nome: string;
  sexo: "M" | "F" | "";
  cargo: "deputado" | "senador";
  partido: string;
  uf: string;
  /** ISO do primeiro mandato */
  desde: string | null;
  nMandatos: number;
  tempo: string;
  atual: boolean;
  emendas?: PerfilEmendas | null;
  proposicoes?: number | null;
  votos?: { sim: number; total: number; fonte: "nominais" | "pautas" } | null;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const plural = (n: number, s: string, p: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? s : p}`;

function cargoTexto(c: ResumoInput["cargo"], s: ResumoInput["sexo"]) {
  if (c === "senador") return s === "F" ? "senadora" : s === "M" ? "senador" : "senador(a)";
  return s === "F" ? "deputada federal" : s === "M" ? "deputado federal" : "deputado(a) federal";
}

/** Frases curtas, uma por tema, geradas só com dados disponíveis. */
export function resumoSimples(i: ResumoInput): string[] {
  const out: string[] = [];
  const quando = i.desde ? (i.atual ? ` desde ${i.desde.slice(0, 4)}` : ` a partir de ${i.desde.slice(0, 4)}`) : "";
  const extra = i.nMandatos > 0 ? ` (${plural(i.nMandatos, "mandato", "mandatos")}${i.tempo ? `, ${i.tempo}` : ""})` : "";
  out.push(`${i.nome} ${i.atual ? "é" : "foi"} ${cargoTexto(i.cargo, i.sexo)} pelo ${i.partido}-${i.uf}${quando}${extra}.`);
  const e = i.emendas;
  if (e) {
    if (e.pago <= 0) out.push("Não achamos dinheiro mandado por este nome que já tenha sido pago.");
    else {
      const para = e.municipios ? ` para ${plural(e.municipios, "cidade", "cidades")}` : "";
      const area = e.funcao ? `, mais para ${e.funcao}` : "";
      const pix = e.pctPix >= 0.005 ? ` ${pct(e.pctPix)} foi sem dizer para quê.` : "";
      out.push(`Mandou ${formatBRL(e.pago, true).replace(/\u00a0/g, " ")}${para}${area}.${pix}`);
    }
  }
  const partes: string[] = [];
  if (i.proposicoes != null) partes.push(`apresentou ${plural(i.proposicoes, "proposição", "proposições")}`);
  if (i.votos && i.votos.total > 0) {
    const de = i.votos.fonte === "pautas" ? "votações de grandes pautas analisadas" : "votações nominais analisadas";
    partes.push(`votou Sim em ${pct(i.votos.sim / i.votos.total)} das ${i.votos.total.toLocaleString("pt-BR")} ${de}`);
  }
  if (partes.length) {
    const s = partes.join("; ");
    out.push(`${s[0]!.toUpperCase()}${s.slice(1)}.`);
  }
  return out;
}

/** Pago (inclui restos a pagar pagos), % via Pix, área principal e nº de municípios atendidos. */
export function perfilEmendas(es: ReadonlyArray<{ tipo: string; pago: number; rapPago: number; funcao: string; ibge: string | null }>): PerfilEmendas {
  let pago = 0, pix = 0;
  const porFuncao = new Map<string, number>();
  const muns = new Set<string>();
  for (const e of es) {
    const v = e.pago + e.rapPago;
    if (v <= 0) continue;
    pago += v;
    if (e.tipo === "pix") pix += v;
    porFuncao.set(e.funcao, (porFuncao.get(e.funcao) ?? 0) + v);
    if (e.ibge) muns.add(e.ibge);
  }
  const funcao = [...porFuncao].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { pago, pctPix: pago ? pix / pago : 0, funcao, municipios: muns.size };
}

// ---------- trocas de partido ----------
export interface Troca { de: string; para: string; data: string }

function trocas(seq: Array<{ sigla: string; data: string }>): Troca[] {
  const s = seq.filter((x) => x.sigla && x.data).sort((a, b) => a.data.localeCompare(b.data));
  const out: Troca[] = [];
  for (let k = 1; k < s.length; k++) {
    const a = s[k - 1]!, b = s[k]!;
    if (a.sigla !== b.sigla) out.push({ de: a.sigla, para: b.sigla, data: b.data.slice(0, 10) });
  }
  return out;
}

/** Histórico da Câmara (/deputados/{id}/historico): cada mudança de `siglaPartido`. */
export const trocasCamara = (h: ReadonlyArray<{ siglaPartido: string; dataHora: string }>) =>
  trocas(h.map((x) => ({ sigla: x.siglaPartido, data: x.dataHora })));

/** Filiações do Senado (dentro de /senador/{c}/mandatos). */
export const trocasSenado = (f: ReadonlyArray<{ Sigla: string; DataFiliacao?: string; DataDesfiliacao?: string }>) =>
  trocas(f.map((x) => ({ sigla: x.Sigla, data: x.DataFiliacao ?? "" })));

/** A lista /deputados?idLegislatura=N repete o deputado a cada partido: quem aparece com 2+ siglas trocou. */
export function trocasDaLista(ds: ReadonlyArray<{ id: number; nome: string; siglaPartido: string; siglaUf: string }>) {
  const m = new Map<number, { id: number; nome: string; siglaUf: string; partidos: string[] }>();
  for (const d of ds) {
    const x = m.get(d.id) ?? { id: d.id, nome: d.nome, siglaUf: d.siglaUf, partidos: [] };
    if (x.partidos[x.partidos.length - 1] !== d.siglaPartido) x.partidos.push(d.siglaPartido);
    m.set(d.id, x);
  }
  return [...m.values()].filter((x) => new Set(x.partidos).size > 1).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

// ---------- votação de mérito de uma pauta ----------
const NAO_MERITO = /destaque|requerimento|urg[eê]ncia|adiamento|retirada|preferencia|preferência|quebra de interst/i;
export function escolherVotacaoFinal<T extends { siglaOrgao: string; descricao: string; dataHoraRegistro: string }>(vs: readonly T[]): T | null {
  const nominais = vs.filter((v) => v.siglaOrgao === "PLEN" && placarDaDescricao(v.descricao))
    .sort((a, b) => b.dataHoraRegistro.localeCompare(a.dataHoraRegistro));
  return nominais.find((v) => !NAO_MERITO.test(v.descricao)) ?? nominais[0] ?? null;
}

// ---------- apoios ----------
/** Municípios que mais receberam (pago + restos a pagar pagos). */
export function topMunicipios(es: ReadonlyArray<{ ibge: string | null; localidade: string; pago: number; rapPago: number }>, n = 10) {
  const m = new Map<string, { ibge: string; nome: string; valor: number }>();
  for (const e of es) {
    const v = e.pago + e.rapPago;
    if (!e.ibge || v <= 0) continue;
    const x = m.get(e.ibge) ?? { ibge: e.ibge, nome: e.localidade, valor: 0 };
    x.valor += v;
    m.set(e.ibge, x);
  }
  return [...m.values()].sort((a, b) => b.valor - a.valor).slice(0, n);
}

/** Conta "Sim" entre votos registrados (ignora vazio e "Sem registro"). */
export function contarSim(votos: ReadonlyArray<string | null | undefined>) {
  const reg = votos.filter((v): v is string => !!v && v !== "Sem registro");
  return { sim: reg.filter((v) => categoriaVoto(v) === "sim").length, total: reg.length };
}

/** Pauta de grande repercussão a partir da identificação do Senado ("PL 2903/2023"). */
export function pautaDoSenado(identificacao: string | null | undefined): Pauta | null {
  if (!identificacao) return null;
  const k = identificacao.replace(/\s+/g, " ").trim().toUpperCase();
  return PAUTAS.find((p) => [p.senado, p].some((r) => r && `${r.sigla} ${r.numero}/${r.ano}` === k)) ?? null;
}
