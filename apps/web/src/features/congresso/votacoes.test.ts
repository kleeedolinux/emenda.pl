import { expect, test } from "bun:test";
import type { VotacaoLista, VotacaoSenado } from "@/features/legislativo/api";
import { aprovadasDasVotacoes, ultimasVotacoes } from "./votacoes";

const vc = (id: string, data: string, descricao: string, aprovacao: number | null): VotacaoLista =>
  ({ id, data, dataHoraRegistro: `${data}T10:00:00`, siglaOrgao: "PLEN", descricao, aprovacao });
const vs = (codigo: number, dataSessao: string, resultadoVotacao: string | null, sim: number | null): VotacaoSenado => ({
  codigoSessaoVotacao: codigo, dataSessao, descricaoVotacao: "Votação nominal do PL 1/2026", identificacao: "PL 1/2026", ementa: "Altera a lei X.",
  resultadoVotacao, codigoMateria: 55, idProcesso: 1, votacaoSecreta: "N", totalVotosSim: sim, totalVotosNao: 2, totalVotosAbstencao: 1,
});

test("une Câmara (só nominais) e Senado, mais recentes primeiro", () => {
  const r = ultimasVotacoes(
    [vc("a", "2026-10-01", "Aprovado o PL. Sim: 300; não: 100; abstenção: 2; total: 402", 1), vc("b", "2026-10-03", "Aprovada a Redação Final.", 1)],
    [vs(7, "2026-10-02", "R", 10), vs(8, "2026-10-04", null, null)],
  );
  expect(r.map((x) => [x.casa, x.chave])).toEqual([["senado", "sen-7"], ["camara", "a"]]);
  expect(r[0]).toMatchObject({ sim: 10, nao: 2, abstencao: 1, aprovada: false, titulo: "PL 1/2026", resumo: "Altera a lei X." });
  expect(r[1]).toMatchObject({ sim: 300, nao: 100, abstencao: 2, aprovada: true, href: "/votacao/a" });
});

test("aprovadas: id da proposição vem do prefixo do id da votação, sem repetir", () => {
  const vs = [
    vc("100-5", "2026-10-03", "Aprovada a Redação Final.", 1),
    vc("100-3", "2026-10-03", "Aprovado o Projeto de Lei nº 1.", 1),
    vc("200-1", "2026-10-02", "Aprovado o Requerimento de urgência.", 1),
    vc("300-1", "2026-10-02", "Rejeitado o Projeto.", 0),
    vc("400-2", "2026-10-01", "Aprovada a Proposta de Emenda à Constituição.", 1),
  ];
  expect(aprovadasDasVotacoes(vs, 5)).toEqual([100, 400]);
  expect(aprovadasDasVotacoes(vs, 1)).toEqual([100]);
});

test("resumo ignora regime sem texto", async () => {
  const { resumir } = await import("./resumo");
  expect(resumir({ id: 1, siglaTipo: "PL", numero: 1, ano: 2026, ementa: "X", regime: "." }).texto).toBe("Projeto de lei apresentado. X.");
});
