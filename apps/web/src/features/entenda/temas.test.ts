import { describe, expect, test } from "bun:test";
import { TEMAS, temaPorSlug, vizinhos } from "./temas";

const OBRIGATORIOS = [
  "o-que-e-emenda", "emenda-individual", "emenda-pix", "emenda-de-bancada", "emenda-de-comissao", "emenda-de-relator",
  "ciclo-do-dinheiro", "o-que-esta-aberto", "como-ler-uma-votacao", "tipos-de-proposicao", "como-uma-lei-nasce", "mandatos", "troca-de-partido",
];

describe("temas do Entenda", () => {
  test("todos os temas pedidos existem, sem duplicata", () => {
    expect(TEMAS.map((t) => t.slug).sort()).toEqual([...OBRIGATORIOS].sort());
  });
  test.each(TEMAS.map((t) => [t.slug, t] as const))("%s: passos, fontes oficiais https e links internos", (_, t) => {
    expect(t.titulo.length).toBeGreaterThan(3);
    expect(t.resumo.length).toBeGreaterThan(20);
    expect(t.passos.length).toBeGreaterThanOrEqual(2);
    expect(t.fontes.length).toBeGreaterThanOrEqual(1);
    for (const f of t.fontes) expect(f.href).toMatch(/^https:\/\//);
    for (const v of t.veja) expect(v.to).toMatch(/^\//);
  });
  test("busca por slug e vizinhos", () => {
    expect(temaPorSlug("emenda-pix")?.titulo).toBe("Emenda Pix");
    expect(temaPorSlug("nao-existe")).toBeNull();
    expect(vizinhos("o-que-e-emenda").anterior).toBeNull();
    expect(vizinhos("o-que-e-emenda").proximo?.slug).toBe(TEMAS[1]!.slug);
  });
  test("fontes exigidas citadas", () => {
    const todas = TEMAS.flatMap((t) => t.fontes.map((f) => f.label)).join(" | ");
    for (const s of ["arts. 165 a 166", "LDO", "ADPF 850", "ADPF 851", "ADPF 854", "EC 105/2019", "EC 126/2022"]) expect(todas).toContain(s);
  });
});
