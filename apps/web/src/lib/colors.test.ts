import { describe, expect, test } from "bun:test";
import { partyColor, sequentialScale, contrastText } from "./colors";

describe("partyColor", () => {
  test("determinístico", () => {
    expect(partyColor("XYZ")).toBe(partyColor("XYZ"));
    expect(partyColor("xyz")).toBe(partyColor("XYZ"));
  });
  test("partidos conhecidos têm cor fixa", () => {
    expect(partyColor("PT")).toBe("#c4122d");
    expect(partyColor("PL")).toBe(partyColor("pl"));
  });
  test("cores distintas para siglas distintas (amostra)", () => {
    const s = new Set(["AAA", "BBB", "CCC", "DDD"].map(partyColor));
    expect(s.size).toBeGreaterThan(1);
  });
  test("formato hex/hsl válido", () => expect(partyColor("NOVO_X")).toMatch(/^(#[0-9a-f]{6}|hsl\()/));
});

describe("sequentialScale", () => {
  const s = sequentialScale([0, 100]);
  test("extremos distintos", () => expect(s(0)).not.toBe(s(100)));
  test("monotônico em luminância (mais valor = mais escuro)", () => {
    const lum = (c: string) => {
      const m = c.match(/\d+/g)!.map(Number);
      return 0.2126 * m[0]! + 0.7152 * m[1]! + 0.0722 * m[2]!;
    };
    expect(lum(s(0))).toBeGreaterThan(lum(s(50)));
    expect(lum(s(50))).toBeGreaterThan(lum(s(100)));
  });
  test("domínio vazio não quebra", () => expect(typeof sequentialScale([0, 0])(0)).toBe("string"));
  test("valor nulo -> cor neutra", () => expect(s(null)).toBe("var(--color-mapa-vazio)"));
});

describe("contrastText", () => {
  test("fundo claro -> texto escuro", () => expect(contrastText("#ffdf00")).toBe("#0b1220"));
  test("fundo escuro -> texto claro", () => expect(contrastText("#002776")).toBe("#ffffff"));
});
