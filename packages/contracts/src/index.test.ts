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

test("dataPath das saídas novas (pix, feed, abertas, rankings)", () => {
  expect(dataPath.pix()).toBe("/data/v1/pix.json");
  expect(dataPath.pixAno(2024)).toBe("/data/v1/pix/2024.json");
  expect(dataPath.feed()).toBe("/data/v1/feed.json");
  expect(dataPath.feedMes(202610)).toBe("/data/v1/feed/202610.json");
  expect(dataPath.abertas()).toBe("/data/v1/abertas.json");
  expect(dataPath.rankings()).toBe("/data/v1/rankings.json");
});
