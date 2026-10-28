import { describe, expect, test } from "bun:test";
import { buildFluxoSankey } from "./fluxo";

const fluxo = [
  { tipo: "pix" as const, funcao: "Saúde", uf: "SP", pago: 100 },
  { tipo: "pix" as const, funcao: "Saúde", uf: "RJ", pago: 50 },
  { tipo: "individual" as const, funcao: "Educação", uf: "SP", pago: 30 },
  { tipo: "individual" as const, funcao: "Urbanismo", uf: "AC", pago: 5 },
  { tipo: "bancada" as const, funcao: "Saúde", uf: "AC", pago: 0 },
];

describe("buildFluxoSankey", () => {
  const g = buildFluxoSankey(fluxo, { topFuncoes: 2, topUfs: 2 });
  const byId = new Map(g.nodes.map((n, i) => [n.id, i]));
  test("agrega funções fora do top em 'Outras funções'", () => {
    expect(byId.has("f:Outras funções")).toBe(true);
    expect(byId.has("f:Urbanismo")).toBe(false);
  });
  test("agrega UFs fora do top em 'Outras UFs'", () => {
    expect(byId.has("u:Outras UFs")).toBe(true);
    expect(byId.has("u:AC")).toBe(false);
  });
  test("conserva total pago", () => {
    const fromTipo = g.links.filter((l) => g.nodes[l.source]!.id.startsWith("t:")).reduce((a, l) => a + l.value, 0);
    const toUf = g.links.filter((l) => g.nodes[l.target]!.id.startsWith("u:")).reduce((a, l) => a + l.value, 0);
    expect(fromTipo).toBe(185);
    expect(toUf).toBe(185);
  });
  test("ignora valores zero e mescla links duplicados", () => {
    const keys = g.links.map((l) => `${l.source}-${l.target}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(g.links.every((l) => l.value > 0)).toBe(true);
    expect(byId.has("t:bancada")).toBe(false);
  });
  test("vazio -> grafo vazio", () => expect(buildFluxoSankey([], {})).toEqual({ nodes: [], links: [] }));
});
