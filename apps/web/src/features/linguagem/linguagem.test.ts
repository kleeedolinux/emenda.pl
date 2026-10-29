import { describe, expect, test } from "bun:test";
import { areaSimples, fatiasPorTipo, fatosBrasil, fraseChegou, ORDEM_TIPOS, parsePopulacaoIbge, porMorador, TIPO_DINHEIRO, tipoAutor, topPorTipo, topUfPorTipo } from "./linguagem";
import type { EmendaItem } from "@emenda/contracts";

describe("TIPO_DINHEIRO", () => {
  test("todo tipo tem rótulo leigo, jargão e cor", () => {
    for (const t of ORDEM_TIPOS) {
      const d = TIPO_DINHEIRO[t];
      expect(d.rotulo.length).toBeGreaterThan(3);
      expect(d.jargao.length).toBeGreaterThan(3);
      expect(d.cor).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
  test("rótulos não dependem da palavra 'emenda'", () => {
    for (const t of ORDEM_TIPOS) expect(TIPO_DINHEIRO[t].rotulo.toLowerCase()).not.toContain("emenda");
  });
  test("Pix e RP9 em palavras simples", () => {
    expect(TIPO_DINHEIRO.pix.rotulo).toBe("Sem dizer para quê");
    expect(TIPO_DINHEIRO.relator.rotulo).toBe("Orçamento secreto");
  });
});

describe("fatiasPorTipo", () => {
  const porTipo = [
    { tipo: "relator" as const, pago: 0 },
    { tipo: "pix" as const, pago: 70 },
    { tipo: "individual" as const, pago: 190 },
  ];
  test("ordem fixa, sem zeros, pct soma 1", () => {
    const f = fatiasPorTipo(porTipo);
    expect(f.map((x) => x.tipo)).toEqual(["individual", "pix"]);
    expect(f.reduce((s, x) => s + x.pct, 0)).toBeCloseTo(1);
    expect(f[1]!.pct).toBeCloseTo(70 / 260);
  });
  test("vazio quando total é zero", () => {
    expect(fatiasPorTipo([{ tipo: "pix", pago: 0 }])).toEqual([]);
  });
  test("soma tipos repetidos", () => {
    expect(fatiasPorTipo([{ tipo: "pix", pago: 1 }, { tipo: "pix", pago: 3 }])).toEqual([{ tipo: "pix", valor: 4, pct: 1 }]);
  });
});

describe("porMorador", () => {
  test.each([
    [260_350_000, 24_759, 105],
    [100, 0, null],
    [100, undefined, null],
    [0, 1000, 0],
  ] as const)("%p centavos / %p hab -> %p reais", (c, p, r) => {
    expect(porMorador(c, p)).toBe(r);
  });
});

describe("fraseChegou", () => {
  test("frase curta com políticos e parte sem destino", () => {
    expect(fraseChegou({ nome: "Iraquara", pago: 260_350_000, politicos: 4, pctPix: 0.27 }))
      .toBe("Iraquara recebeu R$ 2,6 mi de 4 políticos. 27% veio sem dizer para quê.");
  });
  test("singular e sem Pix", () => {
    expect(fraseChegou({ nome: "X", pago: 100_000, politicos: 1, pctPix: 0 })).toBe("X recebeu R$ 1 mil de 1 político.");
  });
  test("nada recebido", () => {
    expect(fraseChegou({ nome: "X", pago: 0, politicos: 0, pctPix: 0 })).toBe("X ainda não recebeu dinheiro mandado por políticos neste período.");
  });
});

describe("areaSimples", () => {
  test.each([
    ["Saúde", "Saúde"],
    ["Encargos especiais", "Sem área definida"],
    ["Urbanismo", "Obras na cidade"],
    ["Desconhecida", "Desconhecida"],
  ])("%p -> %p", (f, r) => expect(areaSimples(f).rotulo).toBe(r));
});

describe("parsePopulacaoIbge", () => {
  test("lê a série do agregado 6579", () => {
    const j = [{ id: "9324", resultados: [{ series: [{ localidade: { id: "2914406" }, serie: { "2024": "24759" } }] }] }];
    expect(parsePopulacaoIbge(j)).toEqual({ ano: 2024, populacao: 24_759 });
  });
  test("formato inesperado -> null", () => {
    expect(parsePopulacaoIbge({})).toBeNull();
    expect(parsePopulacaoIbge([{ resultados: [{ series: [{ serie: { "2024": "..." } }] }] }])).toBeNull();
  });
});

describe("tipoAutor", () => {
  test.each([
    ["BANCADA DA BAHIA", "bancada"],
    ["COM. DA SAUDE", "comissao"],
    ["COMISSAO DE EDUCACAO", "comissao"],
    ["RELATOR GERAL", "relator"],
    ["OTTO ALENCAR", "pessoa"],
  ] as const)("%p -> %p", (n, r) => expect(tipoAutor(n)).toBe(r));
});

describe("fatosBrasil", () => {
  const b = {
    totais: { pago: 1000 },
    porTipo: [{ tipo: "pix" as const, pago: 250 }, { tipo: "relator" as const, pago: 100 }, { tipo: "individual" as const, pago: 650 }],
    porUf: [{ uf: "AP", pago: 300_000 }, { uf: "SP", pago: 400_000 }, { uf: "XX", pago: 5 }],
  };
  const pop = { AP: 1, SP: 40 } as Record<string, number>;
  test("parte sem destino, orçamento secreto e diferença por morador", () => {
    const f = fatosBrasil(b, pop);
    expect(f.pctPix).toBeCloseTo(0.25);
    expect(f.relator).toBe(100);
    expect(f.maisPorMorador?.uf).toBe("AP");
    expect(f.menosPorMorador?.uf).toBe("SP");
    expect(f.vezes).toBe(30);
  });
  test("sem dados", () => {
    const f = fatosBrasil({ totais: { pago: 0 }, porTipo: [], porUf: [] }, pop);
    expect(f).toEqual({ pctPix: 0, relator: 0, maisPorMorador: null, menosPorMorador: null, vezes: null });
  });
});

const em = (tipo: EmendaItem["tipo"], autor: string, pago: number, localidade = "IRAQUARA - BA", ibge: string | null = "2914406", uf: string | null = "BA") =>
  ({ tipo, pago, autor: { codigo: autor, nome: autor }, localidade, ibge, uf }) as unknown as EmendaItem;

describe("topPorTipo (painel do gráfico)", () => {
  const emendas = [em("pix", "ANA", 50), em("pix", "BETO", 70), em("pix", "ANA", 40), em("individual", "CAIO", 999), em("pix", "DIA", 0)];
  test("soma por autor só no tipo pedido, maior primeiro, sem zeros", () => {
    expect(topPorTipo(emendas, "pix", "autor")).toEqual([
      { chave: "ANA", nome: "ANA", href: "/autor/ANA", pago: 90 },
      { chave: "BETO", nome: "BETO", href: "/autor/BETO", pago: 70 },
    ]);
  });
  test("por destino: cidade com IBGE vira link do município; sem IBGE vai para a UF", () => {
    const r = topPorTipo([em("bancada", "X", 5), em("bancada", "X", 9, "BAHIA (UF)", null, "BA")], "bancada", "destino");
    expect(r.map((x) => x.href)).toEqual(["/uf/BA", "/municipio/2914406"]);
  });
  test("limite", () => expect(topPorTipo(emendas, "pix", "autor", 1).length).toBe(1));
});

describe("topUfPorTipo", () => {
  test("soma o fluxo por UF no tipo", () => {
    const fluxo = [{ tipo: "pix", funcao: "Saúde", uf: "BA", pago: 3 }, { tipo: "pix", funcao: "Educação", uf: "BA", pago: 4 }, { tipo: "pix", funcao: "Saúde", uf: "SP", pago: 5 }, { tipo: "relator", funcao: "Saúde", uf: "MG", pago: 99 }] as const;
    expect(topUfPorTipo(fluxo, "pix")).toEqual([
      { chave: "BA", nome: "Bahia", href: "/uf/BA", pago: 7 },
      { chave: "SP", nome: "São Paulo", href: "/uf/SP", pago: 5 },
    ]);
  });
});
