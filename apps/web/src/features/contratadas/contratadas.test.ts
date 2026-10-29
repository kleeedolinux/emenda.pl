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
