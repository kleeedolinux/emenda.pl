import { describe, expect, test } from "bun:test";
import { shouldTrack, hitPayload, pingPayload, parseAviso } from "./analytics";

// Base legal: legítimo interesse (LGPD art. 7º, IX). Liga por padrão; só desliga com opt-out ou DNT/GPC.
describe("shouldTrack", () => {
  test.each([
    [{ aviso: null, dnt: false }, true],
    [{ aviso: "ciente", dnt: false }, true],
    [{ aviso: "desativado", dnt: false }, false],
    [{ aviso: "ciente", dnt: true }, false],
    [{ aviso: null, dnt: true }, false],
  ] as const)("%o -> %s", (input, out) => expect(shouldTrack(input)).toBe(out));
});

describe("parseAviso", () => {
  test.each([
    ["ciente", "ciente"],
    ["desativado", "desativado"],
    // compatibilidade com o modelo antigo de consentimento
    ["aceito", "ciente"],
    ["recusado", "desativado"],
    [null, null],
    ["lixo", null],
  ] as const)("%p -> %p", (raw, out) => expect(parseAviso(raw)).toBe(out));
});

describe("hitPayload", () => {
  test("só o caminho, sem query nem hash", () => expect(hitPayload("/uf/SP?tab=autores#x")).toBe('{"path":"/uf/SP"}'));
  test("caminho vazio vira /", () => expect(hitPayload("")).toBe('{"path":"/"}'));
});

describe("pingPayload", () => {
  test("marca ping e mantém só o caminho", () => expect(pingPayload("/uf/SP?x=1")).toBe('{"path":"/uf/SP","ping":true}'));
});
