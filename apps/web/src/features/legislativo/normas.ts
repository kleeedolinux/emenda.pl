// Desfecho de proposições: norma gerada, sanção/veto, presidente na data. Puro.
import { semAcento } from "@emenda/contracts";

export interface Presidente { nome: string; inicio: string; fim: string | null; interino?: boolean }

/** Presidentes desde 1995 (datas oficiais de posse/término). */
export const PRESIDENTES: Presidente[] = [
  { nome: "Fernando Henrique Cardoso", inicio: "1995-01-01", fim: "2002-12-31" },
  { nome: "Luiz Inácio Lula da Silva", inicio: "2003-01-01", fim: "2010-12-31" },
  { nome: "Dilma Rousseff", inicio: "2011-01-01", fim: "2016-05-11" },
  { nome: "Michel Temer", inicio: "2016-05-12", fim: "2016-08-30", interino: true },
  { nome: "Michel Temer", inicio: "2016-08-31", fim: "2018-12-31" },
  { nome: "Jair Bolsonaro", inicio: "2019-01-01", fim: "2022-12-31" },
  { nome: "Luiz Inácio Lula da Silva", inicio: "2023-01-01", fim: null },
];

export function presidenteNaData(data: string): Presidente | null {
  const d = data.slice(0, 10);
  return PRESIDENTES.find((p) => d >= p.inicio && (p.fim === null || d <= p.fim)) ?? null;
}

export type TipoNorma = "lei" | "lei.complementar" | "emenda.constitucional" | "decreto.legislativo" | "resolucao" | "medida.provisoria";
export interface Norma { tipo: TipoNorma; rotulo: string; numero: number; data: string }

const ROTULOS: [RegExp, TipoNorma, string][] = [
  [/^emenda constitucional/, "emenda.constitucional", "Emenda Constitucional"],
  [/^lei complementar/, "lei.complementar", "Lei Complementar"],
  [/^decreto legislativo/, "decreto.legislativo", "Decreto Legislativo"],
  [/^resolucao/, "resolucao", "Resolução"],
  [/^medida provisoria/, "medida.provisoria", "Medida Provisória"],
  [/^lei/, "lei", "Lei"],
];

/** "Lei nº 14.902 de 27/06/2024" -> norma. */
export function parseNormaGerada(s: string | null | undefined): Norma | null {
  const t = semAcento(s ?? "").toLowerCase().trim();
  const m = /n[ºo°.]*\s*([\d.]+)\s*,?\s*de\s*(\d{2})\/(\d{2})\/(\d{4})/.exec(t);
  const r = ROTULOS.find(([re]) => re.test(t));
  if (!m || !r) return null;
  return { tipo: r[1], rotulo: r[2], numero: Number(m[1]!.replace(/\./g, "")), data: `${m[4]}-${m[3]}-${m[2]}` };
}

function atoPlanalto(ano: number): string | null {
  const faixas: [number, number][] = [[2004, 2006], [2007, 2010], [2011, 2014], [2015, 2018], [2019, 2022], [2023, 2026], [2027, 2030]];
  const f = faixas.find(([a, b]) => ano >= a && ano <= b);
  return f ? `_ato${f[0]}-${f[1]}` : null;
}

export function linksNorma(n: Norma) {
  const urn = `urn:lex:br:federal:${n.tipo}:${n.data};${n.numero}`;
  const ano = Number(n.data.slice(0, 4));
  let planalto: string | null = null;
  const base = "https://www.planalto.gov.br/ccivil_03";
  if (n.tipo === "lei") { const a = atoPlanalto(ano); planalto = a ? `${base}/${a}/${ano}/lei/l${n.numero}.htm` : null; }
  else if (n.tipo === "lei.complementar") planalto = `${base}/leis/lcp/lcp${n.numero}.htm`;
  else if (n.tipo === "emenda.constitucional") planalto = `${base}/constituicao/emendas/emc/emc${n.numero}.htm`;
  return { urn, lexml: `https://www.lexml.gov.br/urn/${urn}`, normas: `https://normas.leg.br/?urn=${urn}`, planalto };
}

export type TipoDesfecho = "lei" | "vetada" | "rejeitada" | "arquivada" | "tramitando";
export interface Desfecho {
  tipo: TipoDesfecho;
  rotulo: string;
  veto: "parcial" | "total" | null;
  norma: Norma | null;
  presidente: Presidente | null;
  promulgadaCongresso: boolean;
}

/** Junta situação da Câmara e do Senado num desfecho legível. */
export function desfecho(i: { situacaoCamara?: string | null; situacaoSenado?: string | null; normaGerada?: string | null; norma?: Norma | null; veto?: "parcial" | "total" | null }): Desfecho {
  const t = semAcento(`${i.situacaoCamara ?? ""} | ${i.situacaoSenado ?? ""}`).toLowerCase();
  const norma = parseNormaGerada(i.normaGerada) ?? i.norma ?? null;
  const veto = i.veto ?? (/veto parcial|vetado parcialmente/.test(t) ? "parcial" : /veto total|vetad[oa] totalmente/.test(t) ? "total" : null);
  let tipo: TipoDesfecho = "tramitando";
  if (/norma juridica/.test(t) || norma) tipo = "lei";
  else if (veto === "total") tipo = "vetada";
  else if (/rejeitad/.test(t)) tipo = "rejeitada";
  else if (/arquivad/.test(t)) tipo = "arquivada";
  const promulgadaCongresso = norma?.tipo === "emenda.constitucional" || norma?.tipo === "decreto.legislativo" || norma?.tipo === "resolucao";
  const rotulo = { lei: "Virou lei", vetada: "Vetada pelo presidente", rejeitada: "Rejeitada", arquivada: "Arquivada", tramitando: "Ainda em discussão" }[tipo];
  return { tipo, rotulo, veto, norma, presidente: norma && !promulgadaCongresso ? presidenteNaData(norma.data) : null, promulgadaCongresso };
}

/** Lê a norma gerada nas tramitações da Câmara ("Transformado na Lei Ordinária 14902/2024"). */
export function normaDaTramitacao(ts: { dataHora: string; descricaoTramitacao: string; despacho: string }[]) {
  let norma: Norma | null = null;
  let veto: "parcial" | "total" | null = null;
  let vetoDerrubado = false;
  for (const t of ts) {
    const txt = semAcento(`${t.descricaoTramitacao} ${t.despacho}`).toLowerCase();
    if (/rejeicao de veto|veto (foi )?derrubado/.test(txt)) vetoDerrubado = true;
    if (/vetado parcialmente|veto parcial/.test(txt)) veto = "parcial";
    else if (/vetado totalmente|veto total/.test(txt)) veto = "total";
    const m = /transformad[oa] n[ao]s?\s+(lei ordinaria|lei complementar|emenda constitucional|decreto legislativo|resolucao|lei)\s*(?:n[º°.o]*\s*)?([\d.]+)\s*\/\s*(\d{4})/.exec(txt);
    if (m && !norma) {
      const tipo: TipoNorma = m[1] === "lei complementar" ? "lei.complementar" : m[1] === "emenda constitucional" ? "emenda.constitucional"
        : m[1] === "decreto legislativo" ? "decreto.legislativo" : m[1] === "resolucao" ? "resolucao" : "lei";
      const rotulo = ROTULOS.find(([, t2]) => t2 === tipo)![2];
      norma = { tipo, rotulo, numero: Number(m[2]!.replace(/\./g, "")), data: t.dataHora.slice(0, 10) };
    }
  }
  return { norma, veto, vetoDerrubado };
}

export type StatusLeigo = "Virou lei" | "Vetada" | "Rejeitada" | "Arquivada" | "No Senado" | "Esperando o presidente" | "Em votação na Câmara" | "Parada";
/** `statusProposicao.descricaoSituacao` -> uma palavra que qualquer pessoa entende. */
export function statusLeigo(situacao: string | null | undefined): StatusLeigo {
  const d = desfecho({ situacaoCamara: situacao });
  if (d.tipo === "lei") return "Virou lei";
  if (d.tipo === "vetada") return "Vetada";
  if (d.tipo === "rejeitada") return "Rejeitada";
  if (d.tipo === "arquivada") return "Arquivada";
  const t = semAcento(situacao ?? "").toLowerCase();
  if (/sancao|promulgac/.test(t)) return "Esperando o presidente";
  if (/senado/.test(t)) return "No Senado";
  if (/pronta para pauta|plenario|deliberacao|em votacao/.test(t)) return "Em votação na Câmara";
  return "Parada";
}
