// Emenda Pix: filtros da lista anual. Puro.
import { semAcento, type PixItem } from "@emenda/contracts";

const norm = (s: string) => semAcento(s).toLowerCase();

export interface FiltroPix { uf?: string; autor?: string; q?: string }
export function filtrarPix(xs: readonly PixItem[], f: FiltroPix): PixItem[] {
  const q = norm(f.q ?? "").trim();
  return xs.filter((x) => (!f.uf || x.uf === f.uf) && (!f.autor || x.autor.codigo === f.autor) &&
    (!q || norm(`${x.localidade} ${x.autor.nome} ${x.codigo}`).includes(q)));
}

export function opcoesPix(xs: readonly PixItem[]) {
  const ufs = new Set<string>();
  const autores = new Map<string, string>();
  for (const x of xs) { if (x.uf) ufs.add(x.uf); autores.set(x.autor.codigo, x.autor.nome); }
  return {
    ufs: [...ufs].sort(),
    autores: [...autores].map(([codigo, nome]) => ({ codigo, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
  };
}

export const partePix = (pix: number, total: number) => (total > 0 ? pix / total : 0);
