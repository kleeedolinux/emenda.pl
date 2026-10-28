// Leve: entra no chunk comum das páginas (sem dependências de texto/formatação).
import type { ShareData } from "./links";

/** "Como meu deputado votou": /votacao/:id?dep=:depId. */
export function votoShare(o: {
  votacaoId: string; titulo: string; voto: string;
  deputado: { id: number; nome: string; siglaPartido?: string; siglaUf?: string };
  placar?: { sim: number; nao: number; outros: number };
}): ShareData {
  const { deputado: p } = o;
  const tag = [p.siglaPartido, p.siglaUf].filter(Boolean).join("-");
  return {
    kind: "voto", title: o.titulo, url: `/votacao/${o.votacaoId}?dep=${p.id}`, ogId: o.votacaoId,
    pessoa: tag ? `${p.nome} (${tag})` : p.nome, voto: o.voto, votes: o.placar,
    subtitle: tag ? `${p.nome} · ${tag}` : p.nome,
  };
}
