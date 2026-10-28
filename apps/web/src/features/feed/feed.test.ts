import { describe, expect, test } from "bun:test";
import type { Pagamento } from "@emenda/contracts";
import { agruparPorMes, filtrarPagamentos, mesLongo, mesCurto, opcoesFiltro, proximoMes, rankingPorPartido, JANELA_ROTULO } from "./feed";

const p = (mes: number, tipo: Pagamento["tipo"], uf: string, autor: string, valor: number): Pagamento => ({
  mes, codigoEmenda: `${mes}${autor}`, autor: { codigo: autor, nome: `AUTOR ${autor}` }, tipo,
  favorecido: { nome: "X", documento: "1", tipo: "Pessoa Jurídica" }, municipio: { ibge: null, nome: "Y", uf }, valor,
});
const itens = [p(202610, "pix", "SP", "1", 10), p(202610, "bancada", "RJ", "2", 30), p(202609, "pix", "RJ", "1", 5)];

describe("feed", () => {
  test.each([[202610, "outubro de 2026"], [202501, "janeiro de 2025"]] as const)("mesLongo(%p)", (m, s) => expect(mesLongo(m)).toBe(s));
  test("mesCurto", () => expect(mesCurto(202603)).toBe("mar/2026"));
  test("filtros combinados", () => {
    expect(filtrarPagamentos(itens, { tipo: "pix" }).length).toBe(2);
    expect(filtrarPagamentos(itens, { tipo: "pix", uf: "RJ" }).map((x) => x.valor)).toEqual([5]);
    expect(filtrarPagamentos(itens, { autor: "autor 2" }).map((x) => x.valor)).toEqual([30]);
    expect(filtrarPagamentos(itens, {}).length).toBe(3);
  });
  test("agrupa por mês desc com total", () =>
    expect(agruparPorMes(itens).map((g) => [g.mes, g.total, g.itens.length])).toEqual([[202610, 40, 2], [202609, 5, 1]]));
  test("opções de filtro (UFs e autores ordenados)", () =>
    expect(opcoesFiltro(itens)).toEqual({ ufs: ["RJ", "SP"], autores: ["AUTOR 1", "AUTOR 2"] }));
  test("próximo mês a carregar no scroll infinito", () => {
    const meses = [{ mes: 202610, n: 1, valor: 1 }, { mes: 202609, n: 1, valor: 1 }, { mes: 202608, n: 1, valor: 1 }];
    expect(proximoMes(meses, [202610, 202609])).toBe(202608);
    expect(proximoMes(meses, [202610, 202609, 202608])).toBeNull();
  });
  test("rótulos das janelas", () => expect(JANELA_ROTULO["12m"]).toBe("12 meses"));
});

describe("rankingPorPartido", () => {
  test("soma por partido via chave do nome; sem correspondência vira 'Não identificado'", () => {
    const autores = [
      { codigo: "1", nome: "ANA", chave: "ANA", valor: 100, pagamentos: 2 },
      { codigo: "2", nome: "BIA", chave: "BIA", valor: 50, pagamentos: 1 },
      { codigo: "3", nome: "BANCADA DE SP", chave: "BANCADA DE SP", valor: 500, pagamentos: 9 },
      { codigo: "4", nome: "CAU", chave: "CAU", valor: 70, pagamentos: 1 },
    ];
    const partido = new Map([["ANA", "PT"], ["BIA", "PT"], ["CAU", "PL"]]);
    expect(rankingPorPartido(autores, partido)).toEqual([
      { partido: "PT", valor: 150, autores: 2 },
      { partido: "PL", valor: 70, autores: 1 },
      { partido: null, valor: 500, autores: 1 },
    ]);
  });
});
