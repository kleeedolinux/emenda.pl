// Toda rota do router tem exemplo na auditoria de responsividade (e2e/rotas.ts).
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { ROTAS } from "../../e2e/rotas";

const router = readFileSync(new URL("../router.tsx", import.meta.url), "utf8");
const padroes = [...router.matchAll(/path: "([^"]+)"/g)].map((m) => m[1]!);

test("router tem rotas", () => expect(padroes.length).toBeGreaterThan(20));
test.each(padroes)("rota %p auditada", (p) => expect(ROTAS.some((r) => r.padrao === p)).toBe(true));
test("exemplos batem com o padrão", () => {
  for (const r of ROTAS) {
    if (r.padrao === "*" || r.padrao === "/") continue;
    const re = new RegExp("^/" + r.padrao.replace(/:[a-z]+/gi, "[^/]+") + "(\\?.*)?$");
    expect(r.path).toMatch(re);
  }
});
