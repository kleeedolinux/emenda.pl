import { describe, expect, test } from "bun:test";
import { fitFont, graphemeCount, truncate, truncateWeighted, tweetWeight, wrapText } from "./text";

// Medida monoespaçada: 10 px por caractere (determinística).
const mono = (s: string) => [...s].length * 10;

describe("tweetWeight", () => {
  test.each([
    ["", 0],
    ["abc", 3],
    ["ação", 4],
    ["veja https://emenda.online/uf/SP agora", 5 + 23 + 6],
    ["日本", 4],
    ["🗳️", 4], // U+1F5F3 + VS16 (ambos peso 2)
    ["“aspas”", 7], // pontuação geral pesa 1
  ])("%p -> %p", (s, w) => expect(tweetWeight(s)).toBe(w));
});

describe("truncate", () => {
  test.each([
    ["curto", 10, "curto"],
    ["exatamente10", 12, "exatamente10"],
    ["Proposta de emenda constitucional", 20, "Proposta de emenda…"],
    ["Palavraenormesemespaço", 10, "Palavraen…"],
    ["abc", 0, ""],
    ["abc", 1, "…"],
  ])("%p (%p) -> %p", (s, n, out) => {
    const r = truncate(s, n);
    expect(r).toBe(out);
    expect(graphemeCount(r)).toBeLessThanOrEqual(n);
  });

  test("não quebra emoji composto", () => {
    expect(truncate("👨‍👩‍👧 família grande demais", 3)).toBe("👨‍👩‍👧…");
    expect(graphemeCount(truncate("👨‍👩‍👧👨‍👩‍👧👨‍👩‍👧", 2))).toBe(2);
  });
});

describe("truncateWeighted", () => {
  test("respeita o peso máximo", () => {
    const long = "Votação da PEC ".repeat(40);
    const out = truncateWeighted(long, 100);
    expect(tweetWeight(out)).toBeLessThanOrEqual(100);
    expect(out.endsWith("…")).toBe(true);
  });
  test("não altera o que cabe", () => expect(truncateWeighted("oi", 10)).toBe("oi"));
});

describe("wrapText", () => {
  test("quebra por palavras sem passar da largura", () => {
    const lines = wrapText("emendas parlamentares para o seu município", 130, mono, 5);
    expect(lines).toEqual(["emendas", "parlamentares", "para o seu", "município"]);
    for (const l of lines) expect(mono(l)).toBeLessThanOrEqual(130);
  });

  test.each([
    ["a b c d e f", 30, 10, ["a b", "c d", "e f"]],
    ["um dois três quatro", 1000, 3, ["um dois três quatro"]],
    ["", 100, 3, []],
    ["   espaços   extras  ", 1000, 2, ["espaços extras"]],
  ])("%p w=%p", (txt, w, max, out) => expect(wrapText(txt, w, mono, max)).toEqual(out));

  test("palavra maior que a largura é partida por caracteres", () => {
    const lines = wrapText("abcdefghijkl", 50, mono, 5);
    expect(lines).toEqual(["abcde", "fghij", "kl"]);
  });

  test("excesso de linhas vira reticências na última", () => {
    const lines = wrapText("um dois três quatro cinco seis", 90, mono, 2);
    expect(lines.length).toBe(2);
    expect(lines[1]!.endsWith("…")).toBe(true);
    for (const l of lines) expect(mono(l)).toBeLessThanOrEqual(90);
  });
});

describe("fitFont", () => {
  // medida proporcional ao tamanho: 0.5 * size por caractere
  const at = (size: number) => (s: string) => [...s].length * size * 0.5;
  test("escolhe o maior tamanho que cabe sem reticências", () => {
    const r = fitFont("Câmara aprova reforma", { maxWidth: 400, maxLines: 2, sizes: [96, 72, 56, 40], measureAt: at });
    expect(r.size).toBe(56);
    expect(r.lines.join(" ")).toBe("Câmara aprova reforma");
  });
  test("cai para o menor tamanho e trunca", () => {
    const r = fitFont("x ".repeat(200), { maxWidth: 100, maxLines: 2, sizes: [40, 20], measureAt: at });
    expect(r.size).toBe(20);
    expect(r.lines.length).toBe(2);
    expect(r.lines[1]!.endsWith("…")).toBe(true);
  });
});
