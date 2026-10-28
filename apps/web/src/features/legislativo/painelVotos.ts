// Painel "quem votou como": enriquecimento, filtro e agrupamento dos votos nominais. Puro.
import { semAcento } from "@emenda/contracts";
import { categoriaVoto, mapaOrientacoes, normPartido, type Orientacao, type VotoCamara, type VotoCat } from "./votacao";

export type Lado = "sim" | "nao" | "outro";
export const LADOS: Lado[] = ["sim", "nao", "outro"];
export const LADO_LABEL: Record<Lado, string> = { sim: "A favor (Sim)", nao: "Contra (Não)", outro: "Outros (abstenção, obstrução, presidente…)" };

export interface VotoItem {
  id: number; nome: string; partido: string; uf: string; foto: string;
  voto: string; cat: VotoCat; lado: Lado; orientacao: string | null; contra: boolean;
}

/** Votou diferente da orientação do partido? "Liberado"/"Artigo 17"/ausência de orientação não contam. */
export function contraOrientacao(voto: string, orientacao: string | null | undefined): boolean {
  if (!orientacao) return false;
  const c = categoriaVoto(voto), oc = categoriaVoto(orientacao);
  return c !== "outro" && oc !== "outro" && c !== oc;
}

export function enriquecerVotos(votos: VotoCamara[], orientacoes: Orientacao[] = []): VotoItem[] {
  const { partidos } = mapaOrientacoes(orientacoes);
  return votos.map((v) => {
    const d = v.deputado_;
    const partido = d.siglaPartido || "S/PART";
    const orientacao = partidos.get(normPartido(partido)) ?? null;
    const cat = categoriaVoto(v.tipoVoto);
    return {
      id: d.id, nome: d.nome, partido, uf: d.siglaUf || "—", foto: d.urlFoto, voto: v.tipoVoto || "—",
      cat, lado: cat === "sim" || cat === "nao" ? cat : "outro", orientacao, contra: contraOrientacao(v.tipoVoto, orientacao),
    };
  });
}

export interface FiltroVotos { busca?: string; partidos?: readonly string[]; ufs?: readonly string[]; soContra?: boolean }
const k = (s: string) => semAcento(s).toLowerCase();

export function filtrarVotos(itens: VotoItem[], f: FiltroVotos): VotoItem[] {
  const q = k(f.busca ?? "").trim();
  const ps = f.partidos?.length ? new Set(f.partidos) : null;
  const us = f.ufs?.length ? new Set(f.ufs) : null;
  return itens.filter((i) =>
    (!q || k(`${i.nome} ${i.partido} ${i.uf}`).includes(q)) && (!ps || ps.has(i.partido)) && (!us || us.has(i.uf)) && (!f.soContra || i.contra));
}

export interface GrupoVoto { lado: Lado; itens: VotoItem[]; partidos?: { partido: string; itens: VotoItem[] }[] }
const porNome = (a: VotoItem, b: VotoItem) => a.nome.localeCompare(b.nome, "pt-BR");

/** Grupos A favor / Contra / Outros (vazios omitidos), nomes em ordem; opcionalmente subgrupos por partido (maior primeiro). */
export function gruposVoto(itens: VotoItem[], porPartido: boolean): GrupoVoto[] {
  return LADOS.flatMap((lado) => {
    const xs = itens.filter((i) => i.lado === lado).sort(porNome);
    if (!xs.length) return [];
    const g: GrupoVoto = { lado, itens: xs };
    if (porPartido) {
      const m = new Map<string, VotoItem[]>();
      for (const i of xs) (m.get(i.partido) ?? m.set(i.partido, []).get(i.partido)!).push(i);
      g.partidos = [...m].map(([partido, its]) => ({ partido, itens: its }))
        .sort((a, b) => b.itens.length - a.itens.length || a.partido.localeCompare(b.partido, "pt-BR"));
    }
    return [g];
  });
}

export function opcoesFiltro(itens: VotoItem[]) {
  const conta = (f: (i: VotoItem) => string) => {
    const m = new Map<string, number>();
    for (const i of itens) m.set(f(i), (m.get(f(i)) ?? 0) + 1);
    return [...m].map(([valor, n]) => ({ valor, n })).sort((a, b) => b.n - a.n || a.valor.localeCompare(b.valor, "pt-BR"));
  };
  return { partidos: conta((i) => i.partido), ufs: conta((i) => i.uf) };
}
