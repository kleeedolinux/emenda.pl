import { describe, expect, test } from "bun:test";
import { anosDaLegislatura, filtrosToSearch, parseFiltros } from "./filtros";

describe("filtros na URL", () => {
  test.each([
    ["", { casa: "ambas", partido: "", uf: "", leg: 57 }],
    ["casa=senado&uf=sp&partido=PT", { casa: "senado", partido: "PT", uf: "SP", leg: 57 }],
    ["casa=xx&leg=56", { casa: "ambas", partido: "", uf: "", leg: 56 }],
    ["leg=10&uf=ZZ", { casa: "ambas", partido: "", uf: "", leg: 57 }],
  ])("%s", (q, esperado) => {
    expect(parseFiltros(new URLSearchParams(q))).toEqual(esperado as never);
  });

  test("ida e volta omite padrões", () => {
    const f = parseFiltros(new URLSearchParams("casa=camara&uf=RJ"));
    expect(filtrosToSearch(f).toString()).toBe("casa=camara&uf=RJ");
    expect(filtrosToSearch(parseFiltros(new URLSearchParams(""))).toString()).toBe("");
  });

  test("preserva outros parâmetros", () => {
    const base = new URLSearchParams("tab=x&uf=SP");
    expect(filtrosToSearch({ casa: "ambas", partido: "", uf: "", leg: 57 }, base).toString()).toBe("tab=x");
  });
});

test.each([
  [57, 2026, [2023, 2024, 2025, 2026]],
  [57, 2024, [2023, 2024]],
  [56, 2026, [2019, 2020, 2021, 2022]],
])("anos da legislatura %i em %i", (leg, atual, anos) => {
  expect(anosDaLegislatura(leg, atual)).toEqual(anos);
});
