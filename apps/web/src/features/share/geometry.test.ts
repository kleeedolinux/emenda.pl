import { describe, expect, test } from "bun:test";
import { barLayout, hemiSeats, voteColors } from "./geometry";

describe("hemiSeats", () => {
  test.each([1, 7, 81, 503, 513])("%p cadeiras", (n) => {
    const s = hemiSeats(n);
    expect(s.length).toBe(n);
    for (const p of s) {
      expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(1.0001);
      expect(p.y).toBeLessThanOrEqual(0.0001);
    }
    // ordenadas da esquerda para a direita (ângulo decrescente)
    for (let i = 1; i < n; i++) expect(s[i]!.a).toBeLessThanOrEqual(s[i - 1]!.a + 1e-9);
  });
  test("vazio", () => expect(hemiSeats(0)).toEqual([]));
});

describe("voteColors", () => {
  test("Sim à esquerda, outros no meio, Não à direita", () => {
    expect(voteColors({ sim: 2, nao: 1, outros: 1 })).toEqual(["sim", "sim", "outros", "nao"]);
  });
});

describe("barLayout", () => {
  test("normaliza pelo maior, limita a 5 e preserva ordem", () => {
    const b = barLayout([{ label: "a", value: 10 }, { label: "b", value: 5 }, { label: "c", value: 0 }, ...Array.from({ length: 5 }, (_, i) => ({ label: `x${i}`, value: 1 }))]);
    expect(b.length).toBe(5);
    expect(b.map((x) => x.ratio)).toEqual([1, 0.5, 0, 0.1, 0.1]);
  });
  test("tudo zero não divide por zero", () => expect(barLayout([{ label: "a", value: 0 }])[0]!.ratio).toBe(0));
});
