import { describe, expect, test } from "bun:test";
import type { GastosFornecedores, GastosRanking } from "@emenda/contracts";
import { GRUPOS, comNomes } from "./contratadas";

const ranking = {
  parlamentares: [
    { casa: "camara", id: "1", nome: "Ana Lima", partido: "PT", uf: "BA", emExercicio: true, mandato: 0, porAno: {} },
    { casa: "senado", id: "1", nome: "Beto Souza", partido: "PL", uf: "SP", emExercicio: true, mandato: 0, porAno: {} },
  ],
} as unknown as GastosRanking;
const f: GastosFornecedores["grupos"][number]["fornecedores"][number] = {
  cnpjCpf: "9", nome: "GRAFICA X", valor: 300, n: 3, parlamentares: 3,
  contratantes: [{ casa: "senado", id: "1", valor: 200 }, { casa: "camara", id: "1", valor: 90 }, { casa: "camara", id: "7", valor: 10 }],
};

describe("contratadas", () => {
  test("contratantes ganham nome, partido, estado e link pela casa certa", () => {
    expect(comNomes(f, ranking)).toEqual([
      { casa: "senado", id: "1", valor: 200, nome: "Beto Souza", partido: "PL", uf: "SP", href: "/senador/1" },
      { casa: "camara", id: "1", valor: 90, nome: "Ana Lima", partido: "PT", uf: "BA", href: "/deputado/1" },
      { casa: "camara", id: "7", valor: 10, nome: "Deputado 7", partido: null, uf: null, href: "/deputado/7" },
    ]);
  });
  test("todo grupo tem rótulo do dia a dia", () => {
    for (const g of ["passagens", "divulgacao", "carros", "consultorias", "escritorio", "hospedagem", "seguranca", "outros"] as const)
      expect(GRUPOS[g].rotulo.length).toBeGreaterThan(3);
  });
});

describe("empresaDe", () => {
  const { empresaDe } = require("./contratadas") as typeof import("./contratadas");
  const forn = { grupos: [
    { grupo: "divulgacao", valor: 9, fornecedores: [{ ...f, cnpjCpf: "13347016000117", valor: 300, parlamentares: 3 }] },
    { grupo: "escritorio", valor: 9, fornecedores: [{ ...f, cnpjCpf: "13347016000117", valor: 500, parlamentares: 1, contratantes: [{ casa: "camara" as const, id: "1", valor: 500 }] }] },
  ] } as GastosFornecedores;
  const ben = { totais: { empresas: 0, entidades: 0, fundos: 0 }, empresas: [{ documento: "13347016000117", nome: "GRAFICA X", tipo: "PJ", valor: 70, uf: "SP", municipio: "X" }], entidades: [], fundos: [] };
  test("junta cota (todos os tipos) e dinheiro de emendas; soma quem contratou em mais de um tipo", () => {
    const e = empresaDe("13347016000117", forn, ben, ranking)!;
    expect(e.cota).toBe(800);
    expect(e.emendas).toBe(70);
    expect(e.parlamentares).toBe(3);
    expect(e.grupos.map((g) => g.grupo)).toEqual(["escritorio", "divulgacao"]);
    expect(e.contratantes.map((c) => [c.casa, c.id, c.valor, c.nome])).toEqual([
      ["camara", "1", 590, "Ana Lima"], ["senado", "1", 200, "Beto Souza"], ["camara", "7", 10, "Deputado 7"],
    ]);
  });
  test("CNPJ desconhecido: null", () => expect(empresaDe("1", forn, ben, ranking)).toBeNull());
});
