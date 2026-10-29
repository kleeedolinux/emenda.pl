import { describe, expect, test } from "bun:test";
import type { Autor, AutorResumo, Brasil, Pix } from "@emenda/contracts";
import { antesEDepois, comissoesDoTopo, resumoSecreto, somarPorAno } from "./secreto";

const brasil = {
  porTipo: [{ tipo: "relator", pago: 100 }, { tipo: "relator", pago: 50 }, { tipo: "pix", pago: 999 }],
  fluxo: [
    { tipo: "relator", funcao: "Saúde", uf: "BA", pago: 60 },
    { tipo: "relator", funcao: "Saúde", uf: "SP", pago: 30 },
    { tipo: "relator", funcao: "Urbanismo", uf: "BA", pago: 40 },
    { tipo: "pix", funcao: "Saúde", uf: "MG", pago: 999 },
  ],
} as unknown as Brasil;
const relator = { porAno: [{ ano: 2021, pago: 7 }, { ano: 2020, pago: 5 }], favorecidos: [{ documento: "1", nome: "MUNICIPIO DE BELEM", tipo: "", valor: 9 }] } as unknown as Autor;
const pix = { porAno: [{ ano: 2020, pago: 1 }, { ano: 2023, pago: 8 }] } as unknown as Pix;

describe("resumoSecreto", () => {
  const r = resumoSecreto(brasil, relator);
  test("total só do orçamento secreto", () => expect(r.total).toBe(150));
  test("estados em ordem de valor, com nome", () => expect(r.porUf).toEqual([{ uf: "BA", nome: "Bahia", pago: 100 }, { uf: "SP", nome: "São Paulo", pago: 30 }]));
  test("áreas em palavras simples", () => expect(r.areas.map((a) => a.valor)).toEqual([90, 40]));
  test("ano a ano em ordem", () => expect(r.porAno).toEqual([{ ano: 2020, pago: 5 }, { ano: 2021, pago: 7 }]));
  test("quanto do total tem estado e ano definidos (o resto é dito com clareza)", () => {
    expect(r.cobertura).toEqual({ comEstado: 130, semEstado: 20, comAno: 12, semAno: 138 });
  });
  test("quem recebeu com nome comum", () => expect(r.recebedores[0]).toEqual({ nome: "Prefeitura de Belém", valor: 9 }));
});

describe("antesEDepois (o que mudou depois)", () => {
  test("une os anos dos dois jeitos de mandar dinheiro", () => {
    expect(antesEDepois([{ ano: 2020, pago: 5 }, { ano: 2021, pago: 7 }], pix)).toEqual([
      { ano: 2020, secreto: 5, pix: 1, comissao: 0 }, { ano: 2021, secreto: 7, pix: 0, comissao: 0 }, { ano: 2023, secreto: 0, pix: 8, comissao: 0 },
    ]);
  });
});

describe("dinheiro das comissões (o que cresceu depois)", () => {
  test("escolhe as comissões que mais mandaram (não relator, não bancada, não pessoa)", () => {
    const autores = [
      { codigo: "1", nome: "COM. DA SAUDE", pago: 5 }, { codigo: "2", nome: "BANCADA DA BAHIA", pago: 99 },
      { codigo: "3", nome: "COMISSAO DE ASSUNTOS SOCIAIS - CAS", pago: 9 }, { codigo: "8100", nome: "RELATOR GERAL", pago: 100 }, { codigo: "4", nome: "FULANO", pago: 50 },
    ] as unknown as AutorResumo[];
    expect(comissoesDoTopo(autores, 5)).toEqual(["3", "1"]);
  });
  test("soma ano a ano", () => {
    const a = [{ porAno: [{ ano: 2023, pago: 2 }, { ano: 2024, pago: 3 }] }, { porAno: [{ ano: 2024, pago: 4 }] }] as unknown as Autor[];
    expect(somarPorAno(a)).toEqual([{ ano: 2023, pago: 2 }, { ano: 2024, pago: 7 }]);
  });
  test("tabela antes e depois inclui comissões", () => {
    expect(antesEDepois([{ ano: 2021, pago: 7 }], pix, [{ ano: 2023, pago: 5 }])).toEqual([
      { ano: 2020, secreto: 0, pix: 1, comissao: 0 }, { ano: 2021, secreto: 7, pix: 0, comissao: 0 }, { ano: 2023, secreto: 0, pix: 8, comissao: 5 },
    ]);
  });
});
