import { describe, expect, test } from "bun:test";
import type { Beneficiados } from "@emenda/contracts";
import { privados } from "./beneficiados";

const b = (empresas: number[], entidades: number[]): Beneficiados => ({
  totais: { empresas: 0, entidades: 0, fundos: 0 },
  empresas: empresas.map((valor, i) => ({ documento: `e${i}`, nome: `EMPRESA ${i}`, tipo: "Pessoa Jurídica", valor, uf: "SP", municipio: "X" })),
  entidades: entidades.map((valor, i) => ({ documento: `n${i}`, nome: `ENTIDADE ${i}`, tipo: "Pessoa Jurídica", valor, uf: "SP", municipio: "X" })),
  fundos: [],
});

describe("privados", () => {
  test("todos: junta empresas e entidades por valor, marcando o grupo", () => {
    const r = privados(b([500, 100], [300]), "todos");
    expect(r.map((x) => [x.documento, x.grupo])).toEqual([["e0", "empresa"], ["n0", "entidade"], ["e1", "empresa"]]);
  });
  test.each([["empresas", ["e0", "e1"]], ["entidades", ["n0"]]] as const)("%s: só o grupo", (f, docs) => {
    expect(privados(b([500, 100], [300]), f).map((x) => x.documento)).toEqual([...docs]);
  });
});
