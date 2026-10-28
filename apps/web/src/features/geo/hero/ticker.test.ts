import { describe, expect, test } from "bun:test";
import type { Autor, AutorResumo, EmendaItem } from "@emenda/contracts";
import { localLabel, pickBancadas, tickerItems, titleCase } from "./ticker";

const em = (p: Partial<EmendaItem>): EmendaItem => ({
  codigo: "x", numero: "1", ano: 2026, tipo: "bancada", tipoOriginal: "", autor: { codigo: "7107", nome: "BANCADA DO CEARA" },
  localidade: "FORTALEZA", ibge: "2304400", uf: "CE", funcao: "Saúde", subfuncao: "", programa: "", acao: "",
  empenhado: 0, liquidado: 0, pago: 0, rapPago: 0, ...p,
});
const autor = (codigo: string, nome: string, emendas: EmendaItem[]): Autor => ({
  codigo, nome, chave: nome, totais: { n: 0, empenhado: 0, liquidado: 0, pago: 0, rapPago: 0 }, porAno: [], porUf: [], porTipo: [], emendas,
});

describe("titleCase", () => {
  test.each([
    ["BANCADA DO CEARA", "Bancada do Ceara"],
    ["COM. DA SAUDE", "Com. da Saude"],
    ["SÃO PAULO", "São Paulo"],
  ])("%p -> %p", (i, o) => expect(titleCase(i)).toBe(o));
});

describe("localLabel", () => {
  test.each([
    [{ localidade: "MÚLTIPLO", uf: "CE" }, "Ceará"],
    [{ localidade: "MARANHÃO (UF)", uf: "MA" }, "Maranhão"],
    [{ localidade: "FORTALEZA", uf: "CE" }, "Fortaleza (CE)"],
    [{ localidade: "MÚLTIPLO", uf: null }, "Vários estados"],
  ] as const)("%o -> %p", (i, o) => expect(localLabel(i)).toBe(o));
});

describe("pickBancadas", () => {
  test("top N bancadas por pago, ignorando outros autores", () => {
    const rs: AutorResumo[] = [
      { codigo: "1", nome: "RELATOR GERAL", chave: "", n: 1, pago: 999, empenhado: 0 },
      { codigo: "2", nome: "BANCADA DO PIAUI", chave: "", n: 1, pago: 50, empenhado: 0 },
      { codigo: "3", nome: "BANCADA DO CEARA", chave: "", n: 1, pago: 80, empenhado: 0 },
      { codigo: "4", nome: "BANCADA DO ACRE", chave: "", n: 1, pago: 10, empenhado: 0 },
    ];
    expect(pickBancadas(rs, 2)).toEqual(["3", "2"]);
  });
});

describe("tickerItems", () => {
  const a = autor("7107", "BANCADA DO CEARA", [
    em({ codigo: "a", ano: 2025, pago: 9_000 }),
    em({ codigo: "b", ano: 2026, pago: 100, funcao: "Saúde" }),
    em({ codigo: "c", ano: 2026, pago: 500, funcao: "Educação" }),
    em({ codigo: "d", ano: 2026, pago: 0, empenhado: 0 }),
  ]);
  const b = autor("7111", "BANCADA DO MARANHAO", [em({ codigo: "e", ano: 2026, pago: 300, uf: "MA", localidade: "MÚLTIPLO" })]);
  const items = tickerItems([a, b], 2);
  test("só o ano mais recente de cada autor, maiores valores primeiro, sem zeros", () => {
    expect(items.map((i) => i.codigo)).toEqual(["c", "e", "b"]);
  });
  test("campos prontos para exibir", () => {
    expect(items[0]).toMatchObject({ ano: 2026, autor: "Bancada do Ceara", autorCodigo: "7107", local: "Fortaleza (CE)", funcao: "Educação", valor: 500, medida: "pago" });
    expect(items[1]!.local).toBe("Maranhão");
  });
  test("sem pagamento: mostra empenhado e diz isso", () => {
    const x = autor("9", "BANCADA Z", [em({ codigo: "z", pago: 0, empenhado: 70 })]);
    expect(tickerItems([x], 1)[0]).toMatchObject({ valor: 70, medida: "empenhado" });
  });
  test("intercala autores (round-robin) para variedade", () => {
    const c = autor("1", "BANCADA X", [em({ codigo: "x1", pago: 10 }), em({ codigo: "x2", pago: 9 })]);
    const d = autor("2", "BANCADA Y", [em({ codigo: "y1", pago: 1 })]);
    expect(tickerItems([c, d], 2).map((i) => i.codigo)).toEqual(["x1", "y1", "x2"]);
  });
});
