import { describe, expect, test } from "bun:test";
import { shouldTrack, hitPayload } from "./analytics";

describe("shouldTrack", () => {
  test.each([
    [{ consent: null, dnt: false }, true],
    [{ consent: "aceito", dnt: false }, true],
    [{ consent: "recusado", dnt: false }, false],
    [{ consent: "aceito", dnt: true }, false],
    [{ consent: null, dnt: true }, false],
  ] as const)("%o -> %s", (input, out) => expect(shouldTrack(input)).toBe(out));
});

describe("hitPayload", () => {
  test("só o caminho, sem query nem hash", () => expect(hitPayload("/uf/SP?tab=autores#x")).toBe('{"path":"/uf/SP"}'));
  test("caminho vazio vira /", () => expect(hitPayload("")).toBe('{"path":"/"}'));
});
