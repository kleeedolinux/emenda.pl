import { describe, expect, test } from "bun:test";
import { buscaPath, montarIndiceBusca } from "./busca";

describe("montarIndiceBusca", () => {
  const idx = montarIndiceBusca({
    geradoEm: "2026-10-28T00:00:00Z",
    municipios: [[2914406, "Iraquara", "BA"], [3550308, "São Paulo", "SP"]],
    ufs: [{ uf: "BA", municipios: [{ ibge: "2914406", pago: 260_350_000 }] }],
    deputados: [
      { id: 1, nome: "Fulano de Tal", siglaPartido: "PL", siglaUf: "MG" },
      { id: 1, nome: "Fulano de Tal", siglaPartido: "PSD", siglaUf: "MG" },
    ],
    senadores: [{ codigo: "3795", nome: "Otto Alencar", nomeCompleto: "Otto Roberto Mendonça de Alencar", partido: "PSD", uf: "BA" }],
    partidos: [{ sigla: "PL", nome: "Partido Liberal" }],
    prefeitos: [{ ibge: "2914406", nome: "NINO COUTINHO", partido: "PSD" }],
    autores: [
      { codigo: "a1", nome: "FULANO DE TAL", chave: "FULANO DE TAL", n: 1, pago: 500, empenhado: 0 },
      { codigo: "3795", nome: "OTTO ALENCAR", chave: "OTTO ALENCAR", n: 1, pago: 900, empenhado: 0 },
      { codigo: "8100", nome: "RELATOR GERAL", chave: "RELATOR GERAL", n: 1, pago: 70, empenhado: 0 },
    ],
  });
  test("cidade com valor recebido (0 se a UF não publicou)", () => {
    expect(idx.cidades).toEqual([[2914406, "Iraquara", "BA", 260_350_000], [3550308, "São Paulo", "SP", 0]]);
  });
  test("deputado sem repetição, último partido, valor mandado cruzado pelo nome", () => {
    expect(idx.deputados).toEqual([[1, "Fulano de Tal", "PSD", "MG", 500]]);
  });
  test("senador com valor", () => expect(idx.senadores).toEqual([["3795", "Otto Alencar", "PSD", "BA", 900]]));
  test("autores que não são parlamentares atuais ficam à parte", () => expect(idx.autores).toEqual([["8100", "RELATOR GERAL", 70]]));
  test("prefeitos: [ibge, nome, partido] (busca pelo prefeito acha a cidade)", () => expect(idx.prefeitos).toEqual([[2914406, "NINO COUTINHO", "PSD"]]));
  test("partidos e caminho", () => {
    expect(idx.partidos).toEqual([["PL", "Partido Liberal"]]);
    expect(buscaPath()).toBe("/data/v1/busca.json");
  });
});
