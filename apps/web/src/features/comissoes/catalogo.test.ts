import { describe, expect, test } from "bun:test";
import { COMISSOES, doCatalogo, hrefComissao, hrefOrgao, idComissao, oQueFaz, oQueFazDerivado, parseIdComissao, porSigla } from "./catalogo";

describe("parseIdComissao", () => {
  test.each([
    ["camara-2003", { casa: "camara", id: 2003 }],
    ["senado-38", { casa: "senado", id: 38 }],
    ["SENADO-1664", { casa: "senado", id: 1664 }],
    // CMO pela Câmara vira a mista (composição das duas Casas no Senado)
    ["camara-6855", { casa: "senado", id: 1664 }],
    ["CMO", { casa: "senado", id: 1664 }],
    ["CCJC", { casa: "camara", id: 2003 }],
    ["xyz", null],
    ["camara-", null],
  ] as const)("%s", (raw, exp) => expect(parseIdComissao(raw)).toEqual(exp as never));
});

describe("porSigla", () => {
  test.each([
    ["CCJ", "camara", "CCJC"], // na Câmara, "CCJ" é o apelido da CCJC
    ["CCJ", "senado", "CCJ"],
    ["CE", "camara", "CE"],
    ["CMO", "senado", "CMO"],
  ] as const)("%s em %s", (s, casa, sig) => expect(porSigla(s, casa)?.sigla).toBe(sig));
  test("CE desempata pela Casa", () => {
    expect(porSigla("CE", "camara")?.camaraId).toBe(2009);
    expect(porSigla("CE", "senado")?.senadoCodigo).toBe(47);
  });
  test("apelido", () => expect(porSigla("Comissão Mista de Orçamento")?.sigla).toBe("CMO"));
});

describe("ids", () => {
  test("únicos e reversíveis", () => {
    const ids = COMISSOES.map(idComissao);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of COMISSOES) expect(doCatalogo(parseIdComissao(idComissao(c))!)).toBe(c);
  });
  test("href", () => expect(hrefComissao(porSigla("CFT")!)).toBe("/comissao/camara-2010"));
  test("todas têm o que faz", () => expect(COMISSOES.every((c) => (c.oQueFaz ?? "").length > 20)).toBe(true));
});

describe("oQueFazDerivado", () => {
  test.each([
    ["Comissão Parlamentar de Inquérito destinada a investigar esquemas de manipulação de resultados", "Investiga: investigar esquemas de manipulação de resultados."],
    ["CPI da Pedofilia - 2026", "Investiga: pedofilia - 2026."],
    ["Comissão Especial destinada a proferir parecer ao Projeto de Lei nº 808/2025", "Dá o parecer sobre Projeto de Lei nº 808/2025."],
    ["Comissão Mista da Medida Provisória n° 1335, de 2026", "Analisa a Medida Provisória n° 1335, de 2026 antes da votação nos plenários."],
    ["Comissão de Turismo", "Analisa propostas sobre turismo."],
    ["Comissão Mista Permanente sobre Mudanças Climáticas", "Analisa propostas sobre mudanças climáticas."],
    ["Conselho de Ética", "Colegiado do Congresso que analisa propostas e fiscaliza temas da sua área."],
  ])("%s", (nome, exp) => expect(oQueFazDerivado(nome)).toBe(exp));
  test("curado tem prioridade", () => expect(oQueFaz({ sigla: "CMO", nome: "x" })).toContain("emendas"));
});

describe("hrefOrgao (sigla de tramitação/órgão da Câmara)", () => {
  test.each([
    ["CCULT", undefined, "/comissao/camara-536996"],
    ["CMO", undefined, "/comissao/senado-1664"],
    ["PEC03215", "https://dadosabertos.camara.leg.br/api/v2/orgaos/539858", "/comissao/camara-539858"],
    ["PEC03215", 539858, "/comissao/camara-539858"],
    ["PLEN", "https://dadosabertos.camara.leg.br/api/v2/orgaos/180", null],
    ["MESA", 4, null],
    ["CCP", 5, null],
    ["XYZ", undefined, null],
  ] as const)("%s", (s, id, exp) => expect(hrefOrgao(s, id)).toBe(exp));
});
