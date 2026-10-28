// Texto puro para compartilhamento: grafemas, peso de post no X, truncagem e quebra de linhas.

const seg = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter("pt-BR", { granularity: "grapheme" }) : null;
const ELLIPSIS = "…";

export function graphemes(s: string): string[] {
  return seg ? Array.from(seg.segment(s), (x) => x.segment) : Array.from(s);
}
export const graphemeCount = (s: string) => graphemes(s).length;

// twitter-text v3: faixas de peso 1; demais code points pesam 2 (conservador para emoji).
const LIGHT: ReadonlyArray<readonly [number, number]> = [[0, 4351], [8192, 8205], [8208, 8223], [8242, 8247]];
const URL_RE = /https?:\/\/\S+/g;
export const URL_WEIGHT = 23;

/** Peso de um texto no X (URLs = 23). */
export function tweetWeight(s: string): number {
  let w = 0;
  const rest = s.replace(URL_RE, () => { w += URL_WEIGHT; return ""; });
  for (const ch of rest) {
    const cp = ch.codePointAt(0)!;
    w += LIGHT.some(([a, b]) => cp >= a && cp <= b) ? 1 : 2;
  }
  return w;
}

/** Corta em `keep` grafemas, preferindo fronteira de palavra, e acrescenta "…". */
function cut(gs: string[], keep: number): string {
  let end = keep;
  const space = gs.lastIndexOf(" ", keep);
  if (space > 0 && space >= keep / 2) end = space;
  return gs.slice(0, end).join("").trimEnd() + ELLIPSIS;
}

/** Trunca para no máximo `max` grafemas (incluindo a reticência). */
export function truncate(s: string, max: number): string {
  const gs = graphemes(s);
  if (gs.length <= max) return s;
  if (max <= 0) return "";
  return cut(gs, max - 1);
}

/** Trunca para no máximo `max` de peso X. */
export function truncateWeighted(s: string, max: number, weight: (s: string) => number = tweetWeight): string {
  if (weight(s) <= max) return s;
  const gs = graphemes(s);
  const budget = max - weight(ELLIPSIS);
  let w = 0, keep = 0;
  for (const g of gs) { const gw = weight(g); if (w + gw > budget) break; w += gw; keep++; }
  return keep <= 0 ? "" : cut(gs, keep);
}

export type Measure = (s: string) => number;

/** Reduz uma linha até caber com reticência. */
function ellipsize(line: string, maxWidth: number, measure: Measure): string {
  const gs = graphemes(line);
  for (let n = gs.length; n > 0; n--) {
    const cand = gs.slice(0, n).join("").trimEnd() + ELLIPSIS;
    if (measure(cand) <= maxWidth) return cand;
  }
  return ELLIPSIS;
}

/** Quebra gulosa por palavras; palavra longa é partida por grafemas; excesso vira "…" na última linha. */
export function wrapText(text: string, maxWidth: number, measure: Measure, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  const push = () => { if (cur) lines.push(cur); cur = ""; };
  for (const word of words) {
    const cand = cur ? `${cur} ${word}` : word;
    if (measure(cand) <= maxWidth) { cur = cand; continue; }
    push();
    if (measure(word) <= maxWidth) { cur = word; continue; }
    for (const g of graphemes(word)) {
      if (cur && measure(cur + g) > maxWidth) push();
      cur += g;
    }
  }
  push();
  if (lines.length <= maxLines) return lines;
  const head = lines.slice(0, Math.max(0, maxLines - 1));
  const tail = lines.slice(maxLines - 1).join(" ");
  return maxLines <= 0 ? [] : [...head, ellipsize(tail, maxWidth, measure)];
}

export interface FitOpts { maxWidth: number; maxLines: number; sizes: number[]; measureAt: (size: number) => Measure }

/** Maior fonte em `sizes` (decrescente) cujo texto cabe sem truncar; senão a menor, truncada. */
export function fitFont(text: string, o: FitOpts): { size: number; lines: string[] } {
  for (const size of o.sizes) {
    const lines = wrapText(text, o.maxWidth, o.measureAt(size), Number.POSITIVE_INFINITY);
    if (lines.length <= o.maxLines) return { size, lines };
  }
  const size = o.sizes.at(-1) ?? 16;
  return { size, lines: wrapText(text, o.maxWidth, o.measureAt(size), o.maxLines) };
}
