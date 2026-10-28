import { describe, expect, test } from "bun:test";
import { qrMatrix } from "./qr";

describe("qrMatrix", () => {
  const m = qrMatrix("https://emenda.online/municipio/3509502");
  test("quadrada e versão compatível", () => {
    expect(m.size).toBeGreaterThanOrEqual(21);
    expect((m.size - 17) % 4).toBe(0);
    expect(m.dark.length).toBe(m.size * m.size);
  });
  test("padrões localizadores nos três cantos", () => {
    const at = (r: number, c: number) => m.dark[r * m.size + c] === 1;
    for (const [r0, c0] of [[0, 0], [0, m.size - 7], [m.size - 7, 0]] as const) {
      for (let i = 0; i < 7; i++) {
        expect(at(r0, c0 + i)).toBe(true); expect(at(r0 + 6, c0 + i)).toBe(true);
        expect(at(r0 + i, c0)).toBe(true); expect(at(r0 + i, c0 + 6)).toBe(true);
      }
      expect(at(r0 + 1, c0 + 1)).toBe(false);
      expect(at(r0 + 3, c0 + 3)).toBe(true);
    }
  });
  test("determinística", () => expect(qrMatrix("https://emenda.online/x").dark).toEqual(qrMatrix("https://emenda.online/x").dark));
});
