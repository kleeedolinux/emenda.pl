// Linguagem simples: tipos de dinheiro, áreas de gasto e frases curtas. Puro (sem React).
import { formatBRL, UFS, type EmendaItem, type SiglaUf, type TipoEmenda } from "@emenda/contracts";
import { TIPOS_LEIGO } from "@/ui/glossario";

export interface TipoInfo {
  /** Rótulo principal, em palavras do dia a dia. Nunca depende da palavra "emenda". */
  rotulo: string;
  /** Uma frase: o que isso quer dizer para quem mora na cidade. */
  explica: string;
  /** Nome técnico (secundário, em Tip/legenda). */
  jargao: string;
  /** Chave do glossário (src/ui/glossario.ts). */
  glossario: string;
  cor: string;
  /** Merece atenção de quem fiscaliza. */
  alerta: boolean;
}

/** Ordem fixa em barras e legendas: do mais transparente ao menos. */
export const ORDEM_TIPOS: readonly TipoEmenda[] = ["individual", "bancada", "comissao", "pix", "relator", "outra"];

export const TIPO_DINHEIRO: Record<TipoEmenda, TipoInfo> = {
  individual: { ...TIPOS_LEIGO.individual, glossario: "emenda individual", cor: "#009c3b", alerta: false },
  bancada: { ...TIPOS_LEIGO.bancada, glossario: "bancada", cor: "#2563eb", alerta: false },
  comissao: { ...TIPOS_LEIGO.comissao, glossario: "comissão", cor: "#7c3aed", alerta: false },
  pix: { ...TIPOS_LEIGO.pix, glossario: "emenda pix", cor: "#e0a800", alerta: true },
  relator: { ...TIPOS_LEIGO.relator, glossario: "RP9", cor: "#dc2626", alerta: true },
  outra: { ...TIPOS_LEIGO.outra, glossario: "emenda", cor: "#64748b", alerta: false },
};

export interface Fatia { tipo: TipoEmenda; valor: number; pct: number }

/** Agrupa por tipo na ordem fixa, descarta zeros; pct soma 1. */
export function fatiasPorTipo(porTipo: ReadonlyArray<{ tipo: TipoEmenda; pago: number }>): Fatia[] {
  const soma = new Map<TipoEmenda, number>();
  for (const t of porTipo) soma.set(t.tipo, (soma.get(t.tipo) ?? 0) + Math.max(0, t.pago));
  const total = [...soma.values()].reduce((s, v) => s + v, 0);
  if (!total) return [];
  return ORDEM_TIPOS.filter((t) => (soma.get(t) ?? 0) > 0).map((t) => ({ tipo: t, valor: soma.get(t)!, pct: soma.get(t)! / total }));
}

/** Centavos por habitante -> reais inteiros. Sem população -> null. */
export function porMorador(centavos: number, populacao: number | null | undefined): number | null {
  if (!populacao || populacao <= 0) return null;
  return Math.round(centavos / 100 / populacao);
}

const brl = (c: number) => formatBRL(c, true).replace(/ /g, " ");
const plural = (n: number, s: string, p: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? s : p}`;

/** "Iraquara recebeu R$ 2,6 mi de 4 políticos. 27% veio sem dizer para quê." */
export function fraseChegou(i: { nome: string; pago: number; politicos: number; pctPix: number }): string {
  if (i.pago <= 0) return `${i.nome} ainda não recebeu dinheiro mandado por políticos neste período.`;
  const de = i.politicos > 0 ? ` de ${plural(i.politicos, "político", "políticos")}` : "";
  const pix = i.pctPix >= 0.01 ? ` ${Math.round(i.pctPix * 100)}% veio sem dizer para quê.` : "";
  return `${i.nome} recebeu ${brl(i.pago)}${de}.${pix}`;
}

// ---------- Áreas (função orçamentária) em palavras simples ----------
export type IconeArea = "saude" | "educacao" | "obras" | "campo" | "social" | "seguranca" | "esporte" | "cultura" | "transporte" | "ambiente" | "semArea" | "outro";

const AREAS: Record<string, { rotulo: string; icone: IconeArea }> = {
  "saude": { rotulo: "Saúde", icone: "saude" },
  "educacao": { rotulo: "Educação", icone: "educacao" },
  "urbanismo": { rotulo: "Obras na cidade", icone: "obras" },
  "saneamento": { rotulo: "Água e esgoto", icone: "obras" },
  "habitacao": { rotulo: "Moradia", icone: "obras" },
  "agricultura": { rotulo: "Agricultura", icone: "campo" },
  "organizacao agraria": { rotulo: "Agricultura", icone: "campo" },
  "assistencia social": { rotulo: "Assistência social", icone: "social" },
  "direitos da cidadania": { rotulo: "Direitos e cidadania", icone: "social" },
  "seguranca publica": { rotulo: "Segurança", icone: "seguranca" },
  "defesa nacional": { rotulo: "Defesa", icone: "seguranca" },
  "desporto e lazer": { rotulo: "Esporte e lazer", icone: "esporte" },
  "cultura": { rotulo: "Cultura", icone: "cultura" },
  "transporte": { rotulo: "Estradas e transporte", icone: "transporte" },
  "gestao ambiental": { rotulo: "Meio ambiente", icone: "ambiente" },
  "encargos especiais": { rotulo: "Sem área definida", icone: "semArea" },
};

const chave = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Função orçamentária -> rótulo do dia a dia + ícone. Desconhecida fica como veio. */
export function areaSimples(funcao: string): { rotulo: string; icone: IconeArea } {
  return AREAS[chave(funcao)] ?? { rotulo: funcao || "Não informado", icone: "outro" };
}

/** Soma por área simples (várias funções podem virar a mesma área). */
export function porArea(itens: ReadonlyArray<{ funcao: string; valor: number }>) {
  const m = new Map<string, { rotulo: string; icone: IconeArea; valor: number }>();
  for (const x of itens) {
    if (x.valor <= 0) continue;
    const a = areaSimples(x.funcao);
    const cur = m.get(a.rotulo) ?? { ...a, valor: 0 };
    cur.valor += x.valor;
    m.set(a.rotulo, cur);
  }
  return [...m.values()].sort((a, b) => b.valor - a.valor);
}

// ---------- Quem mandou ----------
export type TipoAutor = "bancada" | "comissao" | "relator" | "pessoa";
/** Autor do Portal: grupo do estado, comissão, relator (orçamento secreto) ou uma pessoa. */
export function tipoAutor(nome: string): TipoAutor {
  const n = chave(nome).toUpperCase().replace(/[^A-Z ]/g, " ").replace(/\s+/g, " ").trim();
  if (n.startsWith("BANCADA")) return "bancada";
  if (n.startsWith("COMISSAO") || n.startsWith("COM ")) return "comissao";
  if (n.includes("RELATOR")) return "relator";
  return "pessoa";
}

// ---------- Fatos do Brasil (home) ----------
export interface PorMoradorUf { uf: string; reais: number }
/** Parte sem destino (Pix), total do orçamento secreto e a diferença por morador entre estados. */
export function fatosBrasil(
  b: { totais: { pago: number }; porTipo: ReadonlyArray<{ tipo: TipoEmenda; pago: number }>; porUf: ReadonlyArray<{ uf: string; pago: number }> },
  populacao: Readonly<Record<string, number>>,
) {
  const pix = b.porTipo.filter((t) => t.tipo === "pix").reduce((s, t) => s + t.pago, 0);
  const relator = b.porTipo.filter((t) => t.tipo === "relator").reduce((s, t) => s + t.pago, 0);
  const pm = b.porUf
    .map((u) => ({ uf: u.uf, reais: porMorador(u.pago, populacao[u.uf]) }))
    .filter((x): x is PorMoradorUf => x.reais !== null)
    .sort((a, c) => c.reais - a.reais);
  const mais = pm[0] ?? null, menos = pm.at(-1) ?? null;
  return {
    pctPix: b.totais.pago ? pix / b.totais.pago : 0,
    relator,
    maisPorMorador: mais,
    menosPorMorador: menos,
    vezes: mais && menos && mais !== menos && menos.reais > 0 ? Math.round(mais.reais / menos.reais) : null,
  };
}

// ---------- População (IBGE, agregado 6579: estimativa anual) ----------
/** `/api/ibge/v3/agregados/6579/periodos/-1/variaveis/9324?localidades=N6[id]` -> {ano, populacao}. */
export function parsePopulacaoIbge(json: unknown): { ano: number; populacao: number } | null {
  const serie = (json as Array<{ resultados?: Array<{ series?: Array<{ serie?: Record<string, string> }> }> }>)?.[0]?.resultados?.[0]?.series?.[0]?.serie;
  if (!serie) return null;
  const [ano, v] = Object.entries(serie).sort((a, b) => Number(b[0]) - Number(a[0]))[0] ?? [];
  const n = Number(v);
  return ano && Number.isFinite(n) && n > 0 ? { ano: Number(ano), populacao: n } : null;
}

/** Linha do painel de detalhe de um tipo: quem mandou ou quem recebeu. */
export interface TopItem { chave: string; nome: string; href?: string; pago: number }

const ordenar = (m: Map<string, TopItem>, n: number) => [...m.values()].filter((x) => x.pago > 0).sort((a, b) => b.pago - a.pago).slice(0, n);

/** Maiores autores ("autor") ou destinos ("destino") dentro de um tipo de dinheiro. */
export function topPorTipo(emendas: readonly EmendaItem[], tipo: TipoEmenda, por: "autor" | "destino", n = 5): TopItem[] {
  const m = new Map<string, TopItem>();
  for (const e of emendas) {
    if (e.tipo !== tipo) continue;
    const k = por === "autor" ? e.autor.codigo : e.ibge ? `m:${e.ibge}` : e.uf ? `uf:${e.uf}` : e.localidade;
    const atual = m.get(k) ?? (por === "autor"
      ? { chave: e.autor.codigo, nome: e.autor.nome, href: `/autor/${encodeURIComponent(e.autor.codigo)}`, pago: 0 }
      : { chave: k, nome: e.localidade, href: e.ibge ? `/municipio/${e.ibge}` : e.uf ? `/uf/${e.uf}` : undefined, pago: 0 });
    atual.pago += Math.max(0, e.pago);
    m.set(k, atual);
  }
  return ordenar(m, n);
}

/** Maiores estados de destino num tipo, a partir do fluxo nacional. */
export function topUfPorTipo(fluxo: ReadonlyArray<{ tipo: TipoEmenda; uf: string; pago: number }>, tipo: TipoEmenda, n = 5): TopItem[] {
  const m = new Map<string, TopItem>();
  for (const f of fluxo) {
    if (f.tipo !== tipo) continue;
    const atual = m.get(f.uf) ?? { chave: f.uf, nome: UFS[f.uf as SiglaUf] ?? f.uf, href: `/uf/${f.uf}`, pago: 0 };
    atual.pago += Math.max(0, f.pago);
    m.set(f.uf, atual);
  }
  return ordenar(m, n);
}
