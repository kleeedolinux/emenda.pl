import { describe, expect, test } from "bun:test";
import { formatCNPJ, formatDocumento, toCSV, formatNumber, formatPct } from "./format";

describe("formatCNPJ", () => {
  test.each([
    ["11222333000181", "11.222.333/0001-81"],
    ["11.222.333/0001-81", "11.222.333/0001-81"],
    ["1222333000181", "01.222.333/0001-81"],
  ])("%s -> %s", (input, out) => expect(formatCNPJ(input)).toBe(out));
  test("inválido devolve original", () => expect(formatCNPJ("abc")).toBe("abc"));
});

describe("formatDocumento", () => {
  test("CNPJ de 14 dígitos", () => expect(formatDocumento("11222333000181")).toBe("11.222.333/0001-81"));
  test("CPF mascarado é mantido", () => expect(formatDocumento("***.222.333-**")).toBe("***.222.333-**"));
});

describe("toCSV", () => {
  test("cabeçalho, separador ; e escape de aspas/quebras", () => {
    const csv = toCSV(["nome", "valor"], [["Ana \"A\"", "1;2"], ["B\nC", 3]]);
    expect(csv).toBe('﻿nome;valor\r\n"Ana ""A""";"1;2"\r\n"B\nC";3');
  });
  test("null/undefined viram vazio", () => {
    expect(toCSV(["a"], [[null], [undefined]])).toBe("﻿a\r\n\r\n");
  });
  test("neutraliza injeção de fórmula", () => {
    expect(toCSV(["a"], [["=SUM(A1)"]])).toBe("﻿a\r\n'=SUM(A1)");
  });
});

describe("números", () => {
  test("formatNumber pt-BR", () => expect(formatNumber(1234567)).toBe("1.234.567"));
  test("formatPct", () => expect(formatPct(0.1234)).toBe("12,3%"));
});
