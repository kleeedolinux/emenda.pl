import { describe, expect, test } from "bun:test";
import { pickTargets } from "./HeroBrasil";

describe("pickTargets", () => {
  test("determinístico e ponderado", () => {
    const w = { a: 90, b: 10, c: 0 };
    const t = pickTargets(w, 20);
    expect(t).toEqual(pickTargets(w, 20));
    expect(t.filter((x) => x === "a").length).toBeGreaterThan(t.filter((x) => x === "b").length);
    expect(t).not.toContain("c");
  });
  test("sem pesos -> vazio", () => expect(pickTargets({}, 5)).toEqual([]));
});
