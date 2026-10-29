import { UFS } from "@emenda/contracts";

// Busca universal: normalização, ranqueamento tolerante a acento/erro, leis por "PL 2630/2020" e recentes. Puro.

export type TipoBusca = "cidade" | "estado" | "deputado" | "senador" | "partido" | "lei" | "autor";

export interface ItemBusca {
  id: string;
  tipo: TipoBusca;
  titulo: string;
  href: string;
  /** Texto auxiliar que também casa (UF, partido, nome completo). */
  extra?: string;
  /** Linha secundária exibida. */
  sub?: string;
  /** Foto/logo/bandeira. */
  img?: string;
  /** Sigla de UF ou partido para selo colorido quando não há imagem. */
  selo?: string;
  /** Valor recebido/mandado (centavos), quando conhecido. */
  valor?: number;
  /** Popularidade 0..100 para desempate. */
  peso?: number;
  /** UF do item (cidade, deputado, senador, estado): base do filtro encadeado. */
  uf?: string;
}

export function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Distância de edição (Levenshtein) com corte: retorna max+1 se exceder. */
function distancia(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let menor = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < menor) menor = v;
    }
    if (menor > max) return max + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

/** Pontos do termo contra as palavras: 3 prefixo, 1.5 aproximado (>= 4 letras, 1 erro), 0 nada. */
function casaTermo(t: string, palavras: readonly string[]): number {
  if (palavras.some((w) => w.startsWith(t))) return 3;
  if (t.length >= 4) {
    for (const w of palavras) {
      for (const n of [t.length - 1, t.length, t.length + 1]) if (n > 0 && n <= w.length && distancia(t, w.slice(0, n), 1) <= 1) return 1.5;
    }
  }
  return 0;
}

export function pontuar(item: ItemBusca, q: string): number {
  const nq = normalizar(q);
  if (!nq) return 0;
  const nt = normalizar(item.titulo);
  const desempate = (item.peso ?? 0) * 0.5 - nt.length * 0.1;
  if (nt === nq) return 1000 + desempate;
  if (nt.startsWith(nq)) return 800 + desempate;
  const palavras = nt.split(" ");
  const extra = item.extra ? normalizar(item.extra).split(" ") : [];
  let soma = 0, noTitulo = false;
  for (const t of nq.split(" ")) {
    const p = casaTermo(t, palavras);
    if (p) { soma += p; noTitulo = true; continue; }
    if (extra.some((w) => w.startsWith(t))) { soma += 1; continue; }
    return 0;
  }
  return noTitulo ? 300 + soma * 20 + desempate : 0;
}

/** `uf`: filtro encadeado (escolheu Estado=MG) — itens com outra UF saem; itens sem UF (partido) ficam. */
export function rankear(itens: readonly ItemBusca[], q: string, o: { tipos?: readonly TipoBusca[]; limite?: number; uf?: string | null } = {}): ItemBusca[] {
  if (!normalizar(q)) return [];
  const out: Array<[ItemBusca, number]> = [];
  for (const it of itens) {
    if (o.tipos && !o.tipos.includes(it.tipo)) continue;
    if (o.uf && it.uf && it.uf !== o.uf) continue;
    const s = pontuar(it, q);
    if (s > 0) out.push([it, s]);
  }
  out.sort((a, b) => b[1] - a[1] || a[0].titulo.localeCompare(b[0].titulo, "pt-BR"));
  return out.slice(0, o.limite ?? 50).map((x) => x[0]);
}

// ---------- Filtros (modo + estado) na URL ----------
export const MODOS_BUSCA = ["tudo", "cidade", "estado", "deputado", "senador", "partido", "lei"] as const;
export type ModoBusca = (typeof MODOS_BUSCA)[number];
export interface FiltrosBusca { q: string; modo: ModoBusca; uf: string | null }

export function filtrosParaUrl(f: FiltrosBusca): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.modo !== "tudo") p.set("modo", f.modo);
  if (f.uf) p.set("uf", f.uf);
  return p.toString();
}

export function filtrosDaUrl(sp: URLSearchParams): FiltrosBusca {
  const modo = sp.get("modo") as ModoBusca;
  const uf = (sp.get("uf") ?? "").toUpperCase();
  return { q: sp.get("q") ?? "", modo: MODOS_BUSCA.includes(modo) ? modo : "tudo", uf: uf in UFS ? uf : null };
}

// ---------- Leis ----------
export interface Lei { sigla: string; numero: number; ano: number | null }
const LEI = /^(pl|pec|plp|mpv|mp|pdl|pln)\s*(?:n\s*[º°o.]?\s*)?(\d[\d.]*)(?:\s*[/\s-]\s*(\d{4}|\d{2}))?$/i;

/** "PL 2630/2020", "pec nº 45/2019", "mp 1.185/23" -> {sigla, numero, ano}. */
export function detectarLei(q: string, anoAtual = new Date().getFullYear()): Lei | null {
  const m = LEI.exec(q.trim().replace(/\s+/g, " "));
  if (!m) return null;
  const sigla = m[1]!.toUpperCase() === "MP" ? "MPV" : m[1]!.toUpperCase();
  const numero = Number(m[2]!.replace(/\./g, ""));
  let ano: number | null = m[3] ? Number(m[3]) : null;
  if (ano !== null && ano < 100) ano += ano <= anoAtual % 100 ? 2000 : 1900;
  return numero > 0 ? { sigla, numero, ano } : null;
}

export function hrefLei(l: Lei): string {
  return `/proposicoes?tipo=${l.sigla}&numero=${l.numero}${l.ano ? `&ano=${l.ano}` : ""}`;
}

// ---------- Recentes ----------
export interface Armazenamento { getItem(k: string): string | null; setItem(k: string, v: string): void }
const CHAVE = "emenda:busca:recentes";
const MAX_RECENTES = 6;

export function lerRecentes(s: Armazenamento | null | undefined): ItemBusca[] {
  try {
    const v = JSON.parse(s?.getItem(CHAVE) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is ItemBusca => !!x && typeof x.id === "string" && typeof x.href === "string").slice(0, MAX_RECENTES) : [];
  } catch {
    return [];
  }
}

export function salvarRecente(s: Armazenamento | null | undefined, item: ItemBusca): void {
  try {
    const lista = [item, ...lerRecentes(s).filter((x) => x.id !== item.id)].slice(0, MAX_RECENTES);
    s?.setItem(CHAVE, JSON.stringify(lista));
  } catch {
    /* modo privado / cota cheia: recentes são só conveniência */
  }
}
