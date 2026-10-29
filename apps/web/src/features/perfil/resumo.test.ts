import { describe, expect, test } from "bun:test";
import { escolherVotacaoFinal, perfilEmendas, resumoSimples, trocasCamara, trocasSenado, trocasDaLista, type ResumoInput } from "./resumo";

const base: ResumoInput = {
  nome: "Fulana", sexo: "F", cargo: "deputado", partido: "PT", uf: "SP", desde: "2019-02-01", nMandatos: 2, tempo: "5 anos e 9 meses", atual: true,
};

describe("resumoSimples", () => {
  test("frase completa como no exemplo", () => {
    expect(resumoSimples({
      ...base,
      emendas: { pago: 3_200_000_000, pctPix: 0.4, funcao: "Saúde", municipios: 12 },
      proposicoes: 120,
      votos: { sim: 41, total: 50, fonte: "nominais" },
    })).toEqual([
      "Fulana é deputada federal pelo PT-SP desde 2019 (2 mandatos, 5 anos e 9 meses).",
      "Mandou R$ 32 mi para 12 cidades, mais para Saúde. 40% foi sem dizer para quê.",
      "Apresentou 120 proposições; votou Sim em 82% das 50 votações nominais analisadas.",
    ]);
  });
  const casos: Array<[string, Partial<ResumoInput>, string]> = [
    ["masculino senador sem mandato atual", { sexo: "M", cargo: "senador", atual: false, nMandatos: 1, tempo: "8 anos", desde: "2011-02-01" },
      "Fulana foi senador pelo PT-SP a partir de 2011 (1 mandato, 8 anos)."],
    ["sexo desconhecido", { sexo: "", desde: null }, "Fulana é deputado(a) federal pelo PT-SP (2 mandatos, 5 anos e 9 meses)."],
    ["senadora", { cargo: "senador", nMandatos: 0, tempo: "" }, "Fulana é senadora pelo PT-SP desde 2019."],
  ];
  test.each(casos)("%s", (_, p, frase) => expect(resumoSimples({ ...base, ...p })[0]).toBe(frase));
  test("sem emendas no Portal", () =>
    expect(resumoSimples({ ...base, emendas: { pago: 0, pctPix: 0, funcao: null, municipios: 0 } })[1]).toBe("Não achamos dinheiro mandado por este nome que já tenha sido pago."));
  test("sem Pix e uma cidade", () =>
    expect(resumoSimples({ ...base, emendas: { pago: 100_000_00, pctPix: 0, funcao: "Educação", municipios: 1 } })[1]).toBe("Mandou R$ 100 mil para 1 cidade, mais para Educação."));
  test("só votos de pautas", () =>
    expect(resumoSimples({ ...base, votos: { sim: 3, total: 4, fonte: "pautas" } })[1]).toBe("Votou Sim em 75% das 4 votações de grandes pautas analisadas."));
  test("só proposições", () => expect(resumoSimples({ ...base, proposicoes: 1 })[1]).toBe("Apresentou 1 proposição."));
});

describe("perfilEmendas", () => {
  test("pago, % pix, função e municípios distintos", () => {
    const es = [
      { tipo: "pix", pago: 300, rapPago: 100, funcao: "Saúde", ibge: "1" },
      { tipo: "individual", pago: 500, rapPago: 0, funcao: "Saúde", ibge: "2" },
      { tipo: "individual", pago: 100, rapPago: 0, funcao: "Educação", ibge: "1" },
      { tipo: "individual", pago: 0, rapPago: 0, funcao: "Cultura", ibge: null },
    ] as const;
    expect(perfilEmendas(es)).toEqual({ pago: 1000, pctPix: 0.4, funcao: "Saúde", municipios: 2 });
  });
  test("vazio", () => expect(perfilEmendas([])).toEqual({ pago: 0, pctPix: 0, funcao: null, municipios: 0 }));
});

describe("trocas de partido", () => {
  test("Câmara: só mudanças de sigla, em ordem cronológica", () => {
    const h = [
      { siglaPartido: "PL", dataHora: "2022-03-30T10:00" },
      { siglaPartido: "PSL", dataHora: "2019-02-01T10:00" },
      { siglaPartido: "PSL", dataHora: "2020-01-01T10:00" },
      { siglaPartido: "UNIÃO", dataHora: "2022-02-10T00:00" },
      { siglaPartido: "", dataHora: "2022-02-11T00:00" },
    ];
    expect(trocasCamara(h)).toEqual([
      { de: "PSL", para: "UNIÃO", data: "2022-02-10" },
      { de: "UNIÃO", para: "PL", data: "2022-03-30" },
    ]);
  });
  test("Senado: filiações ordenadas por data de filiação", () => {
    expect(trocasSenado([
      { Sigla: "PODEMOS", DataFiliacao: "2019-06-01" },
      { Sigla: "REDE", DataFiliacao: "2015-01-01", DataDesfiliacao: "2019-05-30" },
      { Sigla: "PODEMOS", DataFiliacao: "2019-06-01" },
    ])).toEqual([{ de: "REDE", para: "PODEMOS", data: "2019-06-01" }]);
  });
  test("lista da Câmara repete o deputado por partido", () => {
    const ds = [
      { id: 1, nome: "A", siglaPartido: "PSL", siglaUf: "SP" },
      { id: 1, nome: "A", siglaPartido: "PL", siglaUf: "SP" },
      { id: 2, nome: "B", siglaPartido: "PT", siglaUf: "RJ" },
      { id: 3, nome: "C", siglaPartido: "MDB", siglaUf: "BA" },
      { id: 3, nome: "C", siglaPartido: "MDB", siglaUf: "BA" },
    ];
    expect(trocasDaLista(ds)).toEqual([{ id: 1, nome: "A", siglaUf: "SP", partidos: ["PSL", "PL"] }]);
  });
});

describe("escolherVotacaoFinal", () => {
  test("última nominal de mérito do plenário (evita destaques); cai para qualquer nominal", () => {
    const vs = [
      { id: "a", data: "2023-07-06", dataHoraRegistro: "2023-07-06T20:00", siglaOrgao: "PLEN", descricao: "Aprovado o texto. Sim: 382; Não: 118; Total: 500", aprovacao: 1 },
      { id: "b", data: "2023-07-07", dataHoraRegistro: "2023-07-07T01:00", siglaOrgao: "PLEN", descricao: "Aprovada a redação final (simbólica)", aprovacao: 1 },
      { id: "c", data: "2023-07-07", dataHoraRegistro: "2023-07-07T00:30", siglaOrgao: "PLEN", descricao: "Rejeitado destaque. Sim: 100; Não: 300; Total: 400", aprovacao: 0 },
      { id: "d", data: "2023-08-01", dataHoraRegistro: "2023-08-01T00:00", siglaOrgao: "CCJC", descricao: "Sim: 30; Não: 10; Total: 40", aprovacao: 1 },
    ];
    expect(escolherVotacaoFinal(vs)?.id).toBe("a");
    expect(escolherVotacaoFinal([vs[2]!])?.id).toBe("c");
    expect(escolherVotacaoFinal([])).toBeNull();
  });
});

import { contarSim, pautaDoSenado, topMunicipios } from "./resumo";

describe("apoios do perfil", () => {
  test("top municípios por pago (inclui restos a pagar), ignora sem IBGE", () => {
    const es = [
      { ibge: "1", localidade: "A - SP", pago: 10, rapPago: 5 },
      { ibge: "2", localidade: "B - RJ", pago: 30, rapPago: 0 },
      { ibge: "1", localidade: "A - SP", pago: 20, rapPago: 0 },
      { ibge: null, localidade: "NACIONAL", pago: 99, rapPago: 0 },
      { ibge: "3", localidade: "C - BA", pago: 0, rapPago: 0 },
    ];
    expect(topMunicipios(es, 5)).toEqual([{ ibge: "1", nome: "A - SP", valor: 35 }, { ibge: "2", nome: "B - RJ", valor: 30 }]);
  });
  test("contarSim ignora sem registro", () =>
    expect(contarSim(["Sim", "Não", "Sim", "Obstrução", null, "Sem registro"])).toEqual({ sim: 2, total: 4 }));
  test.each([
    ["PL 2903/2023", "Marco temporal das terras indígenas"],
    ["PEC 45/2019", "Reforma tributária"],
    ["PLP 68/2024", "Regulamentação da reforma tributária"],
    ["PL 1/2023", null],
    [null, null],
    [undefined, null],
  ])("pauta do Senado %s", (id, apelido) => expect(pautaDoSenado(id)?.apelido ?? null).toBe(apelido));
});
