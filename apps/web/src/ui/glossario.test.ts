import { describe, expect, test } from "bun:test";
import { GLOSSARIO, termo } from "./glossario";

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
