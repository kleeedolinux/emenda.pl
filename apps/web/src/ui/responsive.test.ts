// Regras de layout móvel (iOS/overflow) que vivem em CSS: travadas por teste.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const src = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");

describe("layout móvel", () => {
  test("itens de grid podem encolher (sem trilha implícita maior que a tela)", () => expect(css).toMatch(/:where\(\.grid, \.inline-grid\) > \* \{ min-width: 0; \}/));
  test("carrossel snap-x não vira rolagem vertical aninhada", () => expect(css).toMatch(/\.snap-x \{ overflow-y: hidden;/));
  test("altura de viewport dinâmica (sem 100vh/h-screen)", () => {
    expect(css).toContain("100dvh");
    for (const f of ["./AppShell.tsx", "./DataTable.tsx", "./primitives.tsx"]) expect(src(f)).not.toMatch(/h-screen|100vh/);
  });
  test("tabela: sem rolagem vertical aninhada no celular", () => expect(src("./DataTable.tsx")).toMatch(/overflow-x-auto[^"]*lg:max-h-\[70vh\] lg:overflow-y-auto/));
});
