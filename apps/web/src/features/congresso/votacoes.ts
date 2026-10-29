// Últimas votações nominais do Plenário (Câmara e Senado) numa forma só. Puro.
import { fontes, type VotacaoLista, type VotacaoSenado } from "@/features/legislativo/api";
import { placarDaDescricao } from "@/features/legislativo/votacao";

export interface VotacaoResumo {
  casa: "camara" | "senado";
  chave: string;
  data: string;
  titulo: string;
  resumo: string;
  sim: number; nao: number; abstencao: number;
  aprovada: boolean | null;
  /** rota interna ou URL oficial */
  href: string;
  externo: boolean;
}

export function ultimasVotacoes(cam: readonly VotacaoLista[], sen: readonly VotacaoSenado[], n = 12): VotacaoResumo[] {
  const a: VotacaoResumo[] = cam.flatMap((v) => {
    const p = placarDaDescricao(v.descricao);
    if (!p) return [];
    return [{
      casa: "camara" as const, chave: v.id, data: v.dataHoraRegistro || v.data, titulo: v.proposicaoObjeto || "Votação nominal na Câmara",
      resumo: v.descricao.replace(/\s*Sim:\s*\d+.*$/is, "").trim(), sim: p.sim, nao: p.nao, abstencao: p.abstencao,
      aprovada: v.aprovacao === 1 ? true : v.aprovacao === 0 ? false : null, href: `/votacao/${v.id}`, externo: false,
    }];
  });
  const b: VotacaoResumo[] = sen.flatMap((v) => {
    if (v.totalVotosSim == null) return [];
    return [{
      casa: "senado" as const, chave: `sen-${v.codigoSessaoVotacao}`, data: v.dataSessao, titulo: v.identificacao, resumo: v.ementa,
      sim: v.totalVotosSim ?? 0, nao: v.totalVotosNao ?? 0, abstencao: v.totalVotosAbstencao ?? 0,
      aprovada: v.resultadoVotacao === "A" ? true : v.resultadoVotacao === "R" ? false : null,
      href: fontes.materiaSenado(v.codigoMateria)[0]!.href, externo: true,
    }];
  });
  return [...a, ...b].sort((x, y) => y.data.localeCompare(x.data)).slice(0, n);
}

/** Proposições aprovadas no Plenário da Câmara, mais recentes primeiro (id da votação = "<idProposicao>-<seq>"). */
export function aprovadasDasVotacoes(vs: readonly VotacaoLista[], n: number): number[] {
  const out: number[] = [];
  for (const v of vs) {
    if (v.aprovacao !== 1 || !/^aprovad[ao] (o|a) (projeto|proposta|substitutivo|medida|reda[cç][aã]o final)/i.test(v.descricao)) continue;
    const id = Number(v.id.split("-")[0]);
    if (Number.isFinite(id) && id > 0 && !out.includes(id)) out.push(id);
    if (out.length >= n) break;
  }
  return out;
}
