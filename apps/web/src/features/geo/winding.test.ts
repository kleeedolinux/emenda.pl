import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { geoArea, geoMercator, geoPath } from "d3-geo";
import { toFeatureCollection } from "./malhas";

// d3-geo: anel exterior em sentido horário (esférico). Anel invertido = "globo menos o estado" (área ~4π).
const load = (p: string) => toFeatureCollection(JSON.parse(readFileSync(new URL(`../../../public/geo/${p}`, import.meta.url), "utf8")));
const area = (f: unknown) => geoArea(f as never);

describe("malhas estáticas prontas para d3", () => {
  test.each(["br-uf.json", "uf/SP.json", "uf/AM.json", "uf/DF.json"])("%s: toda feição tem área pequena", (p) => {
    const fc = load(p);
    expect(fc.features.length).toBeGreaterThan(0);
    for (const f of fc.features) expect(area(f)).toBeLessThan(0.1);
  });
  test("Brasil projetado cabe no viewport", () => {
    const fc = load("br-uf.json");
    const proj = geoMercator().fitSize([640, 560], fc as never);
    const [[x0, y0], [x1, y1]] = geoPath(proj).bounds(fc as never);
    expect(x0).toBeGreaterThanOrEqual(-1); expect(y0).toBeGreaterThanOrEqual(-1);
    expect(x1).toBeLessThanOrEqual(641); expect(y1).toBeLessThanOrEqual(561);
    expect(x1 - x0).toBeGreaterThan(300);
  });
});

describe("GeoJSON RFC 7946 (anti-horário) é corrigido", () => {
  // quadrado ~1°, anti-horário (RFC 7946) -> d3 o lê como o globo inteiro menos o quadrado
  const ccw = { type: "FeatureCollection", features: [{ type: "Feature", properties: { codarea: "53" }, geometry: { type: "Polygon", coordinates: [[[-48, -16], [-47, -16], [-47, -15], [-48, -15], [-48, -16]]] } }] };
  const multi = { type: "FeatureCollection", features: [{ type: "Feature", properties: { codarea: "1" }, geometry: { type: "MultiPolygon", coordinates: [ccw.features[0]!.geometry.coordinates] } }] };
  test.each([["Polygon", ccw], ["MultiPolygon", multi]] as const)("%s", (_, g) => {
    expect(area(toFeatureCollection(structuredClone(g)).features[0])).toBeLessThan(0.1);
  });
});
