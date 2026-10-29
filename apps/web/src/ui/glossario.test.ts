import { describe, expect, test } from "bun:test";
import { GLOSSARIO, TIPOS_LEIGO, termo } from "./glossario";

const OBRIGATORIOS = [
  "empenhado", "liquidado", "pago", "restos a pagar", "emenda pix", "transferência especial",
  "emenda individual", "bancada", "comissão", "relator", "RP9", "PL", "PEC", "PLP", "MPV", "PDL", "PLN",
  "votação nominal", "orientação de bancada", "quórum", "legislatura", "CNPJ", "CPF mascarado",
  "favorecido", "convênio", "função orçamentária", "ação orçamentária", "prefeito",
  "cota parlamentar", "CEAP", "tramitação", "regime de urgência",
];

describe("GLOSSARIO", () => {
  test.each(OBRIGATORIOS)("define %s", (k) => {
    const d = termo(k);
    expect(d).toBeDefined();
    expect(d!.length).toBeGreaterThan(30);
  });
  test("busca ignora caixa e acento", () => expect(termo("QUORUM")).toBe(GLOSSARIO["quórum"]));
  test("definições terminam com ponto", () => {
    for (const v of Object.values(GLOSSARIO)) expect(v.trim().endsWith(".")).toBe(true);
  });
});

describe("TIPOS_LEIGO (mapa único: Tip e painel do gráfico)", () => {
  test("palavras do dia a dia", () => {
    expect(TIPOS_LEIGO.pix.explica).toBe("Dinheiro mandado sem dizer para quê.");
    expect(TIPOS_LEIGO.relator.rotulo).toBe("Orçamento secreto");
    expect(TIPOS_LEIGO.bancada.explica).toBe("Dinheiro que os deputados e senadores de um estado decidem juntos para onde vai.");
  });
  test.each([["pix", "emenda pix"], ["relator", "RP9"], ["bancada", "bancada"], ["comissao", "comissão"], ["individual", "emenda individual"]] as const)(
    "glossário de %s começa pela mesma frase simples", (tipo, k) => {
      expect(termo(k)!.startsWith(TIPOS_LEIGO[tipo].explica)).toBe(true);
      expect(termo(k)).toContain(TIPOS_LEIGO[tipo].jargao);
    });
});
