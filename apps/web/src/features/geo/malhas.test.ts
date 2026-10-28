import { describe, expect, test } from "bun:test";
import { compactMunicipios, expandMunicipios, toFeatureCollection } from "./malhas";

const topo = {
  type: "Topology",
  arcs: [[[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]]],
  objects: { foo: { type: "GeometryCollection", geometries: [{ type: "Polygon", arcs: [[0]], properties: { codarea: "35" } }] } },
};

describe("toFeatureCollection", () => {
  test("TopoJSON vira FeatureCollection com codarea", () => {
    const fc = toFeatureCollection(topo);
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]!.properties.codarea).toBe("35");
    expect(fc.features[0]!.geometry.type).toBe("Polygon");
  });
  test("GeoJSON passa intacto", () => {
    const g = { type: "FeatureCollection", features: [] };
    expect(toFeatureCollection(g)).toBe(g as never);
  });
});

describe("municípios compactos", () => {
  const api = [
    { id: 3550308, nome: "São Paulo", microrregiao: { nome: "x", mesorregiao: { nome: "y", UF: { sigla: "SP", nome: "São Paulo" } } } },
    { id: 5300108, nome: "Brasília", microrregiao: null, "regiao-imediata": { nome: "z", "regiao-intermediaria": { nome: "w", UF: { sigla: "DF", nome: "Distrito Federal" } } } },
  ];
  test("compacta para [id, nome, uf] ordenado por id", () => {
    expect(compactMunicipios(api)).toEqual([[3550308, "São Paulo", "SP"], [5300108, "Brasília", "DF"]]);
  });
  test("ida e volta preserva id, nome e UF", () => {
    expect(expandMunicipios(compactMunicipios(api))).toEqual([{ id: 3550308, nome: "São Paulo", uf: "SP" }, { id: 5300108, nome: "Brasília", uf: "DF" }]);
  });
});
