// Agregação pura do fluxo tipo -> função -> UF para o Sankey.
import { TIPOS_EMENDA, type Brasil, type TipoEmenda } from "@emenda/contracts";

export interface SankeyNodeIn { id: string; label: string; group: "tipo" | "funcao" | "uf" }
export interface SankeyLinkIn { source: number; target: number; value: number }
export interface SankeyGraph { nodes: SankeyNodeIn[]; links: SankeyLinkIn[] }

export const OUTRAS_FUNCOES = "Outras funções";
export const OUTRAS_UFS = "Outras UFs";

function topKeys(rows: Brasil["fluxo"], key: "funcao" | "uf", n: number): Set<string> {
  const tot = new Map<string, number>();
  for (const r of rows) tot.set(r[key], (tot.get(r[key]) ?? 0) + r.pago);
  return new Set([...tot].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k));
}

export function buildFluxoSankey(
  fluxo: Brasil["fluxo"],
  { topFuncoes = 8, topUfs = 10 }: { topFuncoes?: number; topUfs?: number },
): SankeyGraph {
  const rows = fluxo.filter((r) => r.pago > 0);
  if (!rows.length) return { nodes: [], links: [] };
  const fs = topKeys(rows, "funcao", topFuncoes);
  const us = topKeys(rows, "uf", topUfs);
  const nodes: SankeyNodeIn[] = [];
  const idx = new Map<string, number>();
  const node = (id: string, label: string, group: SankeyNodeIn["group"]) => {
    let i = idx.get(id);
    if (i === undefined) { i = nodes.length; idx.set(id, i); nodes.push({ id, label, group }); }
    return i;
  };
  const acc = new Map<string, SankeyLinkIn>();
  const add = (s: number, t: number, v: number) => {
    const k = `${s}-${t}`;
    const l = acc.get(k);
    if (l) l.value += v; else acc.set(k, { source: s, target: t, value: v });
  };
  for (const r of rows) {
    const f = fs.has(r.funcao) ? r.funcao : OUTRAS_FUNCOES;
    const u = us.has(r.uf) ? r.uf : OUTRAS_UFS;
    const t = node(`t:${r.tipo}`, TIPOS_EMENDA[r.tipo as TipoEmenda] ?? r.tipo, "tipo");
    const fi = node(`f:${f}`, f, "funcao");
    const ui = node(`u:${u}`, u, "uf");
    add(t, fi, r.pago);
    add(fi, ui, r.pago);
  }
  return { nodes, links: [...acc.values()] };
}
