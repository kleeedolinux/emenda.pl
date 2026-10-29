import { describe, expect, test } from "bun:test";
import { UFS } from "@emenda/contracts";
import { MAP } from "./GlassMap";
import { HERO_UF } from "./paths";

// Caminhos do mapa do hero pré-calculados (scripts/hero-paths.ts): sem d3/topojson nem fetch no hero.
describe("HERO_UF", () => {
  test("27 UFs, cada uma com caminho e centroide dentro do viewBox", () => {
    expect(HERO_UF.map((s) => s.key).sort()).toEqual(Object.keys(UFS).sort());
    for (const s of HERO_UF) {
      expect(s.d.startsWith("M")).toBe(true);
      expect(s.c[0]).toBeGreaterThan(0); expect(s.c[0]).toBeLessThan(MAP.w);
      expect(s.c[1]).toBeGreaterThan(0); expect(s.c[1]).toBeLessThan(MAP.h);
    }
  });
  test("compacto: comandos relativos, 1 casa decimal, < 30 KB", () => {
    expect(HERO_UF.every((s) => !/\d\.\d{2}/.test(s.d) && /l/.test(s.d))).toBe(true);
    expect(HERO_UF.reduce((n, s) => n + s.d.length, 0)).toBeLessThan(30_000);
  });
});
