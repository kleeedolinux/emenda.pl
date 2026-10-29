import { describe, expect, test } from "bun:test";
import type { GastosRanking } from "@emenda/contracts";
import { empilhado, formatCnpjCpf, kpis, linkFornecedor, mesAno, rankingLinhas, rotuloCategoria, totalCota } from "./gastos";

describe("formatCnpjCpf", () => {
  test.each([
    ["07575651000159", "07.575.651/0001-59"],
    ["00010981101", "000.109.811-01"],
    ["", "—"],
    ["123", "123"],
  ])("%p -> %p", (i, o) => expect(formatCnpjCpf(i)).toBe(o));
});

test("linkFornecedor só para CNPJ (Portal da Transparência)", () => {
  expect(linkFornecedor("07575651000159")).toBe("https://portaldatransparencia.gov.br/pessoa-juridica/07575651000159");
  expect(linkFornecedor("00010981101")).toBeNull();
  expect(linkFornecedor("")).toBeNull();
});

describe("rotuloCategoria", () => {
  test.each([
    ["COMBUSTÍVEIS E LUBRIFICANTES.", "Combustíveis e lubrificantes"],
    ["HOSPEDAGEM ,EXCETO DO PARLAMENTAR NO DISTRITO FEDERAL.", "Hospedagem, exceto do parlamentar no distrito federal"],
    ["PASSAGEM AÉREA - SIGEPA", "Passagem aérea - SIGEPA"],
    ["Locomoção, hospedagem, alimentação, combustíveis e lubrificantes", "Locomoção, hospedagem, alimentação, combustíveis e lubrificantes"],
    ["", "Sem categoria"],
  ])("%p -> %p", (i, o) => expect(rotuloCategoria(i)).toBe(o));
});

test("mesAno", () => {
  expect(mesAno("2026-10")).toBe("out/2026");
  expect(mesAno(null)).toBe("—");
});

test("totalCota: usa o mandato; sem mandato cai na soma por categoria", () => {
  const cat = [{ categoria: "A", valor: 300, n: 1 }, { categoria: "B", valor: 200, n: 1 }];
  expect(totalCota({ mandato: { inicio: "2023-02", total: 1000, meses: 10, mediaMensal: 100 }, porCategoria: cat })).toEqual({ total: 1000, mediaMensal: 100 });
  expect(totalCota({ mandato: { inicio: "2019-02", total: 0, meses: 0, mediaMensal: 0 }, porCategoria: cat })).toEqual({ total: 500, mediaMensal: 0 });
});

test("kpis: mandato, média e % do teto da cota", () => {
  const k = kpis({ mandato: { inicio: "2023-02", total: 1000, meses: 10, mediaMensal: 100 }, cota: { ano: 2026, gasto: 75, teto: 100 } });
  expect(k).toEqual({ totalMandato: 1000, mediaMensal: 100, pctTeto: 0.75, cotaAno: 2026 });
  expect(kpis({ mandato: { inicio: "2023-02", total: 0, meses: 1, mediaMensal: 0 }, cota: null }).pctTeto).toBeNull();
  expect(kpis({ mandato: { inicio: "2023-02", total: 0, meses: 1, mediaMensal: 0 }, cota: { ano: 2026, gasto: 0, teto: 0 } }).pctTeto).toBeNull();
});

test("empilhado: top categorias + Outras, por ano", () => {
  const r = empilhado(
    [
      { ano: 2024, categoria: "A", valor: 10 },
      { ano: 2024, categoria: "B", valor: 5 },
      { ano: 2025, categoria: "A", valor: 1 },
      { ano: 2025, categoria: "C", valor: 2 },
      { ano: 2025, categoria: "D", valor: 1 },
    ],
    2,
  );
  expect(r.categorias).toEqual(["A", "B", "Outras"]);
  expect(r.anos).toEqual([
    { ano: 2024, total: 15, partes: [10, 5, 0] },
    { ano: 2025, total: 4, partes: [1, 0, 3] },
  ]);
  expect(r.max).toBe(15);
});

test("rankingLinhas: por ano ou mandato, com posição e filtros", () => {
  const r: GastosRanking = {
    anos: [2025, 2026],
    dadosAte: { camara: "2026-10", senado: "2026-10" },
    parlamentares: [
      { casa: "camara", id: "1", nome: "Ana", partido: "PT", uf: "SP", emExercicio: true, mandato: 300, porAno: { "2025": 100, "2026": 200 } },
      { casa: "camara", id: "2", nome: "Bia", partido: "PL", uf: "RJ", emExercicio: true, mandato: 500, porAno: { "2026": 50 } },
      { casa: "camara", id: "3", nome: "Caio", partido: "PL", uf: "RJ", emExercicio: false, mandato: 900, porAno: { "2026": 900 } },
      { casa: "senado", id: "9", nome: "Sen", partido: "PT", uf: "SP", emExercicio: true, mandato: 999, porAno: { "2026": 999 } },
    ],
    categorias: [],
    fornecedores: [],
  };
  expect(rankingLinhas(r, { casa: "camara", periodo: 2026 }).map((x) => [x.posicao, x.id, x.valor])).toEqual([[1, "1", 200], [2, "2", 50]]);
  expect(rankingLinhas(r, { casa: "camara", periodo: "mandato" }).map((x) => x.id)).toEqual(["2", "1"]);
  expect(rankingLinhas(r, { casa: "camara", periodo: 2026, todos: true }).map((x) => x.id)).toEqual(["3", "1", "2"]);
  expect(rankingLinhas(r, { casa: "camara", periodo: 2025 }).map((x) => x.id)).toEqual(["1"]);
});
