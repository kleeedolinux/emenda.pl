import { describe, expect, test } from "bun:test";
import { chaveNome, classificarTipo, formatBRL, parseValorBR, dataPath } from "./index";

describe("parseValorBR", () => {
  test.each([
    ["1450000,00", 145000000], ["0,00", 0], ["", 0], ["1.234,5", 123450], ["-10,01", -1001], ["7", 700],
  ])("%p -> %p", (i, o) => expect(parseValorBR(i)).toBe(o));
});

describe("classificarTipo", () => {
  test.each([
    ["Emenda Individual - Transferências Especiais", "pix"],
    ["Emenda Individual - Transferências com Finalidade Definida", "individual"],
    ["Emenda de Bancada", "bancada"],
    ["Emenda de Comissão", "comissao"],
    ["Emenda de Relator", "relator"],
    ["Sem informação", "outra"],
  ] as const)("%p -> %p", (i, o) => expect(classificarTipo(i)).toBe(o));
});

test("chaveNome normaliza acentos e pontuação", () => {
  expect(chaveNome("  Jandira  Feghali-Ásé ")).toBe("JANDIRA FEGHALI ASE");
});

test("formatBRL usa centavos", () => {
  expect(formatBRL(145000000).replace(/\s/g, " ")).toBe("R$ 1.450.000,00");
});

test("dataPath é estável (contrato de URL)", () => {
  expect(dataPath.municipio(2914406)).toBe("/data/v1/municipio/2914406.json");
  expect(dataPath.uf("ba")).toBe("/data/v1/uf/BA.json");
});
