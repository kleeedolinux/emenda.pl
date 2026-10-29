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
  test("toque: controles têm alvo ≥44px e links ≥24px sem mudar o layout (pseudo-elemento)", () => {
    const m = css.match(/@media \(pointer: coarse\) \{([\s\S]*?)\n\s{2}\}/);
    expect(m).not.toBeNull();
    const bloco = m![1]!;
    expect(bloco).toContain("calc((100% - 44px) / 2)");
    expect(bloco).toContain("calc((100% - 28px) / 2)"); // 24px + folga: WebKit arredonda o inset para baixo
    // não quebra o padrão "link esticado" (after:absolute after:inset-0) nem o sheen
    expect(bloco).toContain(':not([class*="after:"])');
    // campos (sem pseudo-elemento) ganham altura mínima real
    expect(bloco).toMatch(/:where\(select, input:not\(\[type=checkbox\], \[type=radio\], \[type=hidden\]\)\) \{ min-height: 44px; \}/);
    // .sheen corta o próprio ::after (overflow hidden): ganha altura real
    expect(bloco).toMatch(/:where\(\.sheen\) \{ min-height: 44px; \}/);
    // faixas com rolagem lateral cortam o ::after na vertical: filhos diretos ganham altura real
    expect(bloco).toMatch(/:where\(\.overflow-x-auto, \.snap-x\) > :where\(button, a\[href\], \[role=tab\]\) \{ min-height: 44px; \}/);
    // link que corta o próprio conteúdo (truncate/line-clamp) corta o ::after: altura real de 24px
    expect(bloco).toMatch(/:where\(a\[href\]\.truncate, a\[href\]\[class\*="line-clamp"\]\) \{ min-height: 24px; \}/);
  });
  test("dica de rolagem horizontal (sombras com background-attachment local)", () => {
    const m = css.match(/@utility scroll-fade-x \{([\s\S]*?)\n\}/);
    expect(m).not.toBeNull();
    expect(m![1]).toContain("local");
  });
  test("código/URL inline quebra em vez de vazar em 280px", () => expect(css).toMatch(/:where\(code, samp\) \{ overflow-wrap: anywhere; \}/));
});
