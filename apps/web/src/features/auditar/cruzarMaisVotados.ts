import { chaveNome } from "@emenda/contracts";

/** Eleito em 2022 segundo o TSE (scripts/mais-votados-2022.ts). */
export interface EleitoTse { sq: string; nome: string; partido: string; uf: string; votos: number }
export interface MaisVotadosArquivo { fonte: string; eleicao: number; deputados: EleitoTse[]; senadores: EleitoTse[] }
export interface ParlamentarAtual { casa: "deputado" | "senador"; id: string; nome: string; uf: string; partido: string; foto?: string | null }
export interface MaisVotado extends EleitoTse { id: string | null; casa: ParlamentarAtual["casa"] | null; foto: string | null; partidoAtual: string | null }

/** Liga o ranking do TSE aos parlamentares atuais por nome de urna + UF, preservando a ordem por votos. */
export function cruzarMaisVotados(tse: EleitoTse[], atuais: ParlamentarAtual[], limite: number): MaisVotado[] {
  const idx = new Map(atuais.map((a) => [`${chaveNome(a.nome)}|${a.uf}`, a]));
  return tse.slice(0, limite).map((e) => {
    const a = idx.get(`${chaveNome(e.nome)}|${e.uf}`);
    return { ...e, id: a?.id ?? null, casa: a?.casa ?? null, foto: a?.foto ?? null, partidoAtual: a?.partido ?? null };
  });
}
