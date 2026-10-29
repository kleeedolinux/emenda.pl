import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { rewindForD3, toFeatureCollection } from "./malhas";
import { paraEnquadrar } from "./enquadrar";

const dir = new URL("../../../public/geo/uf/", import.meta.url);
const malha = (f: string) => rewindForD3(toFeatureCollection(JSON.parse(readFileSync(new URL(f, dir), "utf8"))));

describe("paraEnquadrar", () => {
  test("PE: Fernando de Noronha fica fora do enquadramento", () => {
    const fc = malha("PE.json");
    const codes = paraEnquadrar(fc).features.map((f) => String(f.properties.codarea));
    expect(codes).not.toContain("2605459");
    expect(codes.length).toBe(fc.features.length - 1);
  });
  test.each(readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "PE.json"))("%s: nenhum município do continente é descartado", (f) => {
    const fc = malha(f);
    expect(paraEnquadrar(fc).features.length).toBe(fc.features.length);
  });
});
