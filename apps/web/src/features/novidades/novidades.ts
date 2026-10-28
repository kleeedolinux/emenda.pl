// Lógica pura do feed /novidades (sem React).
import { ALTA_RELEVANCIA, TIPOS_NOVIDADE, formatBRL, type Novidade, type NovidadeNumero, type TipoNovidade } from "@emenda/contracts";
import type { ShareData } from "@/features/share";

const MIN = 60_000;
const H = 60 * MIN;
const DIA = 24 * H;
const fmtDia = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone: "America/Sao_Paulo" });
const fmtDiaAno = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Sao_Paulo" });
const fmtAno = new Intl.DateTimeFormat("pt-BR", { year: "numeric", timeZone: "America/Sao_Paulo" });

const ms = (iso: string) => {
  const t = Date.parse(iso.length === 10 ? `${iso}T00:00:00-03:00` : iso);
  return Number.isNaN(t) ? 0 : t;
};

/** "agora", "há 30 min", "há 3 h", "ontem", "há 3 dias", "1 de set." (ano só se diferente). */
export function tempoRelativo(iso: string, agora = Date.now()): string {
  const t = ms(iso);
  const d = agora - t;
  if (d < MIN) return "agora"; // inclui eventos com data futura (agenda)
  if (d < H) return `há ${Math.floor(d / MIN)} min`;
  if (d < DIA) return `há ${Math.floor(d / H)} h`;
  if (d < 2 * DIA) return "ontem";
  if (d < 7 * DIA) return `há ${Math.floor(d / DIA)} dias`;
  return fmtAno.format(t) === fmtAno.format(agora) ? fmtDia.format(t) : fmtDiaAno.format(t);
}

/** Data/hora completa para o atributo title. */
export const dataCompleta = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(ms(iso));

export interface Filtro { tipos: Set<TipoNovidade>; alta: boolean }

export function filtrar(itens: Novidade[], f: Filtro): Novidade[] {
  return itens.filter((i) => (f.tipos.size === 0 || f.tipos.has(i.tipo)) && (!f.alta || i.relevancia >= ALTA_RELEVANCIA));
}

/** União por id, mais novo primeiro (datas com fusos diferentes comparadas em UTC). */
export function mesclar(...listas: Novidade[][]): Novidade[] {
  const m = new Map<string, Novidade>();
  for (const l of listas) for (const i of l) if (!m.has(i.id)) m.set(i.id, i);
  return [...m.values()].sort((a, b) => ms(b.data) - ms(a.data) || b.relevancia - a.relevancia || a.id.localeCompare(b.id));
}

const mesDe = (iso: string) => {
  const d = new Date(ms(iso) - 3 * H); // calendário de Brasília
  return d.getUTCFullYear() * 100 + d.getUTCMonth() + 1;
};

/** Próximo arquivo mensal a buscar: o mês mais novo ainda incompleto no que já temos. */
export function proximoArquivo(meses: { mes: number; n: number }[], rolante: Novidade[], carregados: number[]): number | null {
  const noRolante = new Map<number, number>();
  for (const i of rolante) noRolante.set(mesDe(i.data), (noRolante.get(mesDe(i.data)) ?? 0) + 1);
  for (const m of meses) {
    if (carregados.includes(m.mes)) continue;
    if ((noRolante.get(m.mes) ?? 0) >= m.n) continue;
    return m.mes;
  }
  return null;
}

export function formatarNumero(n: NovidadeNumero): string {
  return n.formato === "brl" ? formatBRL(n.valor, true) : new Intl.NumberFormat("pt-BR").format(n.valor);
}

/** Quantos itens são mais novos que a última visita (ISO); sem visita anterior: 0. */
export function novosDesde(itens: Novidade[], visto: string | null): number {
  if (!visto) return 0;
  const v = ms(visto);
  return itens.filter((i) => ms(i.data) > v).length;
}

export const permalink = (n: Novidade, origem = "") => `${origem}/novidades#${n.id}`;

export function textoParaCopiar(n: Novidade, origem: string): string {
  return `${n.texto} ${permalink(n, origem)}`;
}

/** Caminho interno do site (não "//host"). */
export const linkInterno = (url: string) => url.startsWith("/") && !url.startsWith("//");

export function parseTipos(s: string | null): Set<TipoNovidade> {
  return new Set((s ?? "").split(",").filter((t): t is TipoNovidade => t in TIPOS_NOVIDADE));
}
export const serializeTipos = (t: Set<TipoNovidade>) => [...t].sort().join(",");

const KIND: Record<TipoNovidade, ShareData["kind"]> = {
  votacao: "votacao", lei: "pagina", urgencia: "proposicao", proposicao: "proposicao", agenda: "agenda",
  pagamentos: "pagina", pix: "pix", gastos: "pagina", partido: "partido",
};

export function shareDe(n: Novidade): ShareData {
  const sim = n.numeros?.find((x) => x.rotulo === "sim");
  const nao = n.numeros?.find((x) => x.rotulo === "não");
  const brl = n.numeros?.find((x) => x.formato === "brl");
  return {
    kind: KIND[n.tipo],
    title: n.titulo,
    text: n.texto,
    url: permalink(n),
    ...(sim && nao ? { votes: { sim: sim.valor, nao: nao.valor, outros: 0 } } : {}),
    ...(brl ? { metric: { value: brl.valor, format: "brl" as const, label: brl.rotulo } } : {}),
  };
}

// ---------- última visita (localStorage; falha silenciosa) ----------
const CHAVE = "novidades:visto";
export function lerVisto(): string | null {
  try { return localStorage.getItem(CHAVE); } catch { return null; }
}
export function gravarVisto(iso: string) {
  try { localStorage.setItem(CHAVE, iso); } catch { /* modo privado */ }
}

// ---------- agrupamento por dia (Brasília) ----------
const fmtDiaLongo = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", timeZone: "America/Sao_Paulo" });
const fmtDiaLongoAno = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
const diaBrt = (t: number) => new Date(t - 3 * H).toISOString().slice(0, 10);

/** Grupos consecutivos por dia civil de Brasília: "Hoje", "Ontem", "20 de outubro". */
export function agruparPorDia(itens: Novidade[], agora = Date.now()): { dia: string; rotulo: string; itens: Novidade[] }[] {
  const hoje = diaBrt(agora);
  const ontem = diaBrt(agora - DIA);
  const out: { dia: string; rotulo: string; itens: Novidade[] }[] = [];
  for (const i of itens) {
    const t = ms(i.data);
    const dia = diaBrt(Math.min(t, agora)); // agenda (futuro) fica em "Hoje"
    const ult = out[out.length - 1];
    if (ult?.dia === dia) { ult.itens.push(i); continue; }
    const rotulo = dia === hoje ? "Hoje" : dia === ontem ? "Ontem"
      : (fmtAno.format(t) === fmtAno.format(agora) ? fmtDiaLongo : fmtDiaLongoAno).format(t);
    out.push({ dia, rotulo, itens: [i] });
  }
  return out;
}

/** Texto sem emoji inicial e sem repetir o título (o cartão já mostra o título em negrito). */
export function corpo(n: Pick<Novidade, "titulo" | "texto">): string {
  const t = n.texto.replace(/^[\p{Extended_Pictographic}️‍\s]+/u, "");
  const titulo = n.titulo.replace(/…$/, "");
  if (!t.startsWith(titulo)) return t;
  const r = t.slice(titulo.length).replace(/^[\s:.,;—-]+/, "");
  return r ? r[0]!.toLocaleUpperCase("pt-BR") + r.slice(1) : "";
}
