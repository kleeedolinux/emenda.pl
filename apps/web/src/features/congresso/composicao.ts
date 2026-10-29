// Composição do Congresso: membros normalizados das duas Casas, hemiciclo e recortes. Puro.
import type { Seat } from "@/ui";
import { partyColor } from "@/lib/colors";
import type { DeputadoLista, SenadorResumo } from "@/features/legislativo/api";
import { federacaoDoPartido } from "@/features/federacoes/dados";
import type { FiltrosCongresso } from "./filtros";

export interface Membro {
  casa: "camara" | "senado";
  /** id da Câmara ou código do Senado */
  id: string;
  nome: string;
  partido: string;
  uf: string;
  foto: string;
  sexo: "M" | "F" | "";
  href: string;
}

export const chaveMembro = (m: Pick<Membro, "casa" | "id">) => `${m.casa}:${m.id}`;

export function deputadoMembro(d: DeputadoLista, sexo: Membro["sexo"]): Membro {
  return { casa: "camara", id: String(d.id), nome: d.nome, partido: d.siglaPartido || "S/PART", uf: d.siglaUf, foto: d.urlFoto, sexo, href: `/deputado/${d.id}` };
}

export function senadorMembro(s: SenadorResumo): Membro {
  return { casa: "senado", id: s.codigo, nome: s.nome, partido: s.partido || "S/PART", uf: s.uf, foto: s.foto, sexo: s.sexo, href: `/senador/${s.codigo}` };
}

export function filtrarMembros(ms: readonly Membro[], f: Pick<FiltrosCongresso, "casa" | "partido" | "uf"> & Partial<FiltrosCongresso>): Membro[] {
  return ms.filter((m) => (f.casa === "ambas" || m.casa === f.casa) && (!f.partido || m.partido === f.partido) && (!f.uf || m.uf === f.uf));
}

/** Contagem por chave, maior primeiro (empate: nome). */
export function contar<T>(xs: readonly T[], chave: (x: T) => string): Array<{ label: string; value: number }> {
  const m = new Map<string, number>();
  for (const x of xs) m.set(chave(x), (m.get(chave(x)) ?? 0) + 1);
  return [...m].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "pt-BR"));
}

export type ModoHemiciclo = "partido" | "federacao";
const grupoFederacao = (p: string) => federacaoDoPartido(p)?.nome ?? p;

/** Assentos agrupados (maior grupo primeiro; dentro do grupo, por partido e nome). */
export function assentos(ms: readonly Membro[], modo: ModoHemiciclo): Seat[] {
  const grupo = (m: Membro) => (modo === "federacao" ? grupoFederacao(m.partido) : m.partido);
  const tam = new Map(contar(ms, grupo).map((c) => [c.label, c.value]));
  return ms
    .slice()
    .sort((a, b) => tam.get(grupo(b))! - tam.get(grupo(a))! || grupo(a).localeCompare(grupo(b), "pt-BR") ||
      a.partido.localeCompare(b.partido, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR"))
    .map((m) => {
      const g = grupo(m);
      return { key: `${m.casa}-${m.id}`, color: partyColor(g === m.partido ? m.partido : (federacaoDoPartido(m.partido)?.partidos[0] ?? m.partido)), group: g, label: `${m.nome} (${m.partido}-${m.uf})` };
    });
}

export function genero(ms: readonly Pick<Membro, "sexo">[]) {
  const mulheres = ms.filter((m) => m.sexo === "F").length;
  const homens = ms.filter((m) => m.sexo === "M").length;
  return { mulheres, homens, semInfo: ms.length - mulheres - homens, pctMulheres: mulheres + homens ? mulheres / (mulheres + homens) : 0 };
}

/** Novato = não aparece na lista da legislatura anterior. */
export function novatos(atuais: readonly string[], anteriores: ReadonlySet<string>) {
  const veteranos = atuais.filter((id) => anteriores.has(id)).length;
  return { novatos: atuais.length - veteranos, veteranos };
}

const ANO = 365.25;
export const FAIXAS_TEMPO = ["Até 4 anos", "4 a 8 anos", "8 a 16 anos", "Mais de 16 anos"] as const;
export function faixaTempo(dias: number): (typeof FAIXAS_TEMPO)[number] {
  const a = dias / ANO;
  return a <= 4.05 ? FAIXAS_TEMPO[0] : a <= 8.05 ? FAIXAS_TEMPO[1] : a <= 16.05 ? FAIXAS_TEMPO[2] : FAIXAS_TEMPO[3];
}
export function faixasTempo(dias: readonly number[]) {
  const n = new Map<string, number>(FAIXAS_TEMPO.map((f) => [f, 0]));
  for (const d of dias) n.set(faixaTempo(d), n.get(faixaTempo(d))! + 1);
  return FAIXAS_TEMPO.map((label) => ({ label, value: n.get(label)! }));
}

/** Idade completa em `hoje` (AAAA-MM-DD). */
export function idade(nasc: string | null | undefined, hoje: string): number | null {
  if (!nasc || !/^\d{4}-\d{2}-\d{2}/.test(nasc)) return null;
  const a = Number(hoje.slice(0, 4)) - Number(nasc.slice(0, 4));
  return hoje.slice(5, 10) < nasc.slice(5, 10) ? a - 1 : a;
}
export const FAIXAS_ETARIAS = ["Até 30", "31 a 40", "41 a 50", "51 a 60", "61 a 70", "Mais de 70"] as const;
export function faixaEtaria(i: number): (typeof FAIXAS_ETARIAS)[number] {
  return i <= 30 ? "Até 30" : i <= 40 ? "31 a 40" : i <= 50 ? "41 a 50" : i <= 60 ? "51 a 60" : i <= 70 ? "61 a 70" : "Mais de 70";
}
