import { expect, test } from "bun:test";
import { ASSEMBLEIAS, CADEIRAS_FEDERAIS, cadeirasAssembleia } from "./assembleias";

test.each([[8, 24], [12, 36], [17, 41], [53, 77], [70, 94]])("cadeirasAssembleia(%d) = %d", (f, e) => expect(cadeirasAssembleia(f)).toBe(e));
test("27 casas, uma por UF, todas https", () => {
  expect(new Set(ASSEMBLEIAS.map((a) => a.uf)).size).toBe(27);
  expect(ASSEMBLEIAS.every((a) => a.site.startsWith("https://"))).toBe(true);
});
test("total de deputados estaduais/distritais = 1059", () =>
  expect(Object.values(CADEIRAS_FEDERAIS).reduce((s, f) => s + cadeirasAssembleia(f), 0)).toBe(1059));
test("bancada federal soma 513", () => expect(Object.values(CADEIRAS_FEDERAIS).reduce((a, b) => a + b, 0)).toBe(513));
