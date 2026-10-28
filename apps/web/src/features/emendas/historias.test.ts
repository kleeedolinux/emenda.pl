import { describe, expect, test } from "bun:test";
import type { Abertas, AutorResumo, Brasil, Pagamento, Rankings, Totais, Uf } from "@emenda/contracts";
import {
  abertoDoRecorte, autoresDoRecorte, maioresPagamentos, classeAutor, comparar, fraseComparacao, indiceParlamentares, maiorPagamento,
  municipiosDoRecorte, noEstado, nomeProprio, recorteTexto, valorExtenso, parlamentarDe, parteTipos, recorte, serieAnual, slidesRanking, sparkPath, ufsPerCapita, ultimosPagamentos,
} from "./historias";
import { POPULACAO_UF } from "./populacao";

const T = (pago: number, n = 1): Totais => ({ pago, n, empenhado: pago * 2, liquidado: pago, rapPago: 0 });
const autor = (codigo: string, nome: string, pago: number): AutorResumo => ({ codigo, nome, chave: nome, n: 1, pago, empenhado: pago });

const brasil: Brasil = {
  totais: T(1000, 10),
  porAno: [{ ano: 2024, ...T(400) }, { ano: 2025, ...T(600) }],
  porTipo: [{ tipo: "individual", ...T(700) }, { tipo: "pix", ...T(200) }, { tipo: "bancada", ...T(100) }],
  porFuncao: [],
  porUf: [{ uf: "SP", nome: "São Paulo", ...T(600) }, { uf: "AC", nome: "Acre", ...T(100) }, { uf: "RJ", nome: "Rio de Janeiro", ...T(300) }],
  fluxo: [
    { tipo: "pix", funcao: "Saúde", uf: "AC", pago: 80 },
    { tipo: "pix", funcao: "Saúde", uf: "SP", pago: 100 },
    { tipo: "pix", funcao: "Educação", uf: "SP", pago: 20 },
    { tipo: "individual", funcao: "Saúde", uf: "RJ", pago: 300 },
  ],
};
const sp: Uf = {
  uf: "SP", nome: "São Paulo", totais: T(600, 6),
  porTipo: [{ tipo: "individual", ...T(400) }, { tipo: "pix", ...T(150) }, { tipo: "bancada", ...T(50) }],
  porAno: [{ ano: 2024, ...T(250) }],
  municipios: [{ ibge: "1", nome: "Campinas", ...T(50) }, { ibge: "2", nome: "São Paulo", ...T(300) }],
  autores: [autor("10", "BANCADA DE SAO PAULO", 90), autor("11", "FULANO", 60), autor("12", "BELTRANA", 70)],
};

describe("classeAutor", () => {
  test.each([
    ["BANCADA DO CEARA", "bancada"], ["COM. DA SAUDE", "comissao"], ["COMISSAO DE ASSUNTOS SOCIAIS - CAS", "comissao"],
    ["RELATOR GERAL", "relator"], ["EDUARDO BRAGA", "pessoa"], ["Comandante Allan", "pessoa"],
  ] as const)("%s -> %s", (nome, classe) => expect(classeAutor(nome)).toBe(classe));
});

describe("recorte", () => {
  test("sem filtro: totais do Brasil", () => expect(recorte(brasil, null, {})).toEqual({ totais: brasil.totais, ignorados: [] }));
  test("tipo", () => expect(recorte(brasil, null, { tipo: "pix" })?.totais.pago).toBe(200));
  test("ano", () => expect(recorte(brasil, null, { ano: 2025 })?.totais.pago).toBe(600));
  test("tipo + ano: usa tipo e avisa que ano não se cruza", () => expect(recorte(brasil, null, { tipo: "pix", ano: 2025 })).toMatchObject({ totais: { pago: 200 }, ignorados: ["ano"] }));
  test("UF usa o arquivo da UF", () => expect(recorte(brasil, sp, { uf: "SP", tipo: "pix" })?.totais.pago).toBe(150));
  test("UF ainda carregando -> null", () => expect(recorte(brasil, null, { uf: "SP" })).toBeNull());
  test("ano sem dados -> zero", () => expect(recorte(brasil, null, { ano: 1999 })?.totais.pago).toBe(0));
});

describe("autoresDoRecorte", () => {
  const lista = [autor("1", "RELATOR GERAL", 999), autor("2", "BANCADA DO ACRE", 500), autor("3", "ANA", 100), autor("4", "BIA", 300)];
  test("padrão: só parlamentares, ordem por pago", () => expect(autoresDoRecorte({ autores: lista }, {})?.lista.map((a) => a.nome)).toEqual(["BIA", "ANA"]));
  test("tipo bancada mostra bancadas", () => expect(autoresDoRecorte({ autores: lista }, { tipo: "bancada" })?.lista.map((a) => a.codigo)).toEqual(["2"]));
  test("tipo pix usa pix.json", () => {
    const r = autoresDoRecorte({ autores: lista, pix: [autor("9", "CAIO", 5)] }, { tipo: "pix" });
    expect(r?.lista.map((a) => a.nome)).toEqual(["CAIO"]);
    expect(r?.ignorados).toEqual([]);
  });
  test("tipo pix sem pix.json carregado -> null", () => expect(autoresDoRecorte({ autores: lista }, { tipo: "pix" })).toBeNull());
  test("UF usa autores da UF; ano é ignorado", () => {
    const r = autoresDoRecorte({ autores: lista, uf: sp }, { uf: "SP", ano: 2024 });
    expect(r?.lista.map((a) => a.nome)).toEqual(["BELTRANA", "FULANO"]);
    expect(r?.ignorados).toEqual(["ano"]);
  });
  test("individual não se separa de Pix no ranking", () => expect(autoresDoRecorte({ autores: lista }, { tipo: "individual" })?.ignorados).toEqual(["tipo"]));
});

describe("ufsPerCapita", () => {
  test("ordena por R$ por habitante", () => {
    const r = ufsPerCapita(brasil, {});
    expect(r.ranking[0]?.uf).toBe("AC");
    expect(r.ranking[0]?.perCapita).toBeCloseTo(100 / POPULACAO_UF.AC);
    expect(r.ranking.map((x) => x.uf)).toEqual(["AC", "RJ", "SP"]);
  });
  test("tipo soma o fluxo da UF", () => {
    const r = ufsPerCapita(brasil, { tipo: "pix" });
    expect(r.ranking.find((x) => x.uf === "SP")?.pago).toBe(120);
    expect(r.ranking.some((x) => x.uf === "RJ")).toBe(false);
  });
  test("UF filtrada vira destaque com posição; ano ignorado", () => {
    const r = ufsPerCapita(brasil, { uf: "SP", ano: 2024 });
    expect(r.destaque).toMatchObject({ uf: "SP", posicao: 3 });
    expect(r.ignorados).toEqual(["ano"]);
  });
});

const rankings: Rankings = {
  ultimoMes: 202610,
  janelas: (["1m", "3m", "6m", "12m"] as const).map((janela, i) => ({
    janela, desde: 202610 - i, ate: 202610, valor: 100 * (i + 1), pagamentos: 10,
    tipos: [{ tipo: "pix", valor: 7 * (i + 1), pagamentos: 1 }],
    autores: [{ codigo: "1", nome: "ANA", chave: "ANA", valor: 60, pagamentos: 1 }, { codigo: "2", nome: "BIA", chave: "BIA", valor: 40, pagamentos: 1 }],
    ufs: [{ uf: "SP", nome: "São Paulo", valor: 30, pagamentos: 1 }],
    municipios: [{ ibge: "9", nome: "Rio Branco", uf: "AC", valor: 80, pagamentos: 1 }, { ibge: "2", nome: "São Paulo", uf: "SP", valor: 20, pagamentos: 1 }],
  })),
};

describe("municipiosDoRecorte", () => {
  test("sem UF: últimos 12 meses", () => {
    const r = municipiosDoRecorte(rankings, null, {});
    expect(r?.fonte).toBe("12m");
    expect(r?.lista[0]).toMatchObject({ ibge: "9", valor: 80 });
  });
  test("com UF: histórico da UF", () => {
    const r = municipiosDoRecorte(rankings, sp, { uf: "SP", tipo: "pix" });
    expect(r?.fonte).toBe("historico");
    expect(r?.lista.map((m) => m.nome)).toEqual(["São Paulo", "Campinas"]);
    expect(r?.ignorados).toEqual(["tipo"]);
  });
});

describe("parteTipos", () => {
  test("percentual por tipo, Pix destacado", () => {
    const r = parteTipos(brasil.porTipo);
    expect(r.pix).toBeCloseTo(0.2);
    expect(r.tipos[0]).toMatchObject({ tipo: "individual", pct: 0.7 });
  });
  test("vazio não divide por zero", () => expect(parteTipos([]).pix).toBe(0));
});

const abertas: Abertas = {
  totais: { n: 10, empenhado: 0, pago: 0, rapPago: 0, rapCancelado: 0, aberto: 500 },
  porTipo: [{ tipo: "pix", n: 2, aberto: 50 }],
  porAno: [{ ano: 2025, n: 3, aberto: 200 }, { ano: 2024, n: 1, aberto: 100 }],
  porUf: [{ uf: "SP", nome: "São Paulo", n: 4, aberto: 300 }],
  top: [],
};
describe("abertoDoRecorte", () => {
  test("total", () => expect(abertoDoRecorte(abertas, {})).toMatchObject({ aberto: 500, n: 10, ignorados: [] }));
  test("UF tem prioridade e os demais são avisados", () => expect(abertoDoRecorte(abertas, { uf: "SP", tipo: "pix" })).toMatchObject({ aberto: 300, ignorados: ["tipo"] }));
  test("tipo", () => expect(abertoDoRecorte(abertas, { tipo: "pix" }).aberto).toBe(50));
  test("ano", () => expect(abertoDoRecorte(abertas, { ano: 2024 }).aberto).toBe(100));
  test("série por ano em ordem crescente", () => expect(abertoDoRecorte(abertas, {}).serie.map((x) => x.ano)).toEqual([2024, 2025]));
});

const pg = (mes: number, valor: number, tipo: Pagamento["tipo"] = "individual", uf = "SP"): Pagamento => ({
  mes, valor, tipo, codigoEmenda: `${mes}-${valor}`, autor: { codigo: "1", nome: "ANA" },
  favorecido: { nome: "X", documento: "", tipo: "" }, municipio: { ibge: "1", nome: "M", uf },
});
const itens = [pg(202609, 900), pg(202610, 100), pg(202610, 300, "pix", "AC"), pg(202509, 5000)];

describe("pagamentos", () => {
  test("maior pagamento respeita filtros", () => {
    expect(maiorPagamento(itens, {})?.valor).toBe(5000);
    expect(maiorPagamento(itens, { ano: 2026 })?.valor).toBe(900);
    expect(maiorPagamento(itens, { tipo: "pix" })?.valor).toBe(300);
    expect(maiorPagamento(itens, { ano: 2014 })).toBeNull();
  });
  test("maiores: top N por valor", () => expect(maioresPagamentos(itens, { ano: 2026 }, 2).map((p) => p.valor)).toEqual([900, 300]));
  test("últimos: mês mais recente primeiro, depois maior valor", () => {
    expect(ultimosPagamentos(itens, {}, 3).map((p) => p.valor)).toEqual([300, 100, 900]);
    expect(ultimosPagamentos(itens, { uf: "AC" }).map((p) => p.valor)).toEqual([300]);
  });
});

describe("slidesRanking", () => {
  test("1m, 3m e 12m com top autores", () => {
    const s = slidesRanking(rankings, {});
    expect(s.map((x) => x.janela)).toEqual(["1m", "3m", "12m"]);
    expect(s[2]).toMatchObject({ valor: 400, top: [{ label: "ANA", value: 60, href: "/autor/1" }, { label: "BIA", value: 40 }] });
  });
  test("UF: municípios da UF e valor da UF", () => {
    const s = slidesRanking(rankings, { uf: "SP" })[0]!;
    expect(s.valor).toBe(30);
    expect(s.top).toEqual([{ label: "São Paulo", value: 20, href: "/municipio/2" }]);
  });
  test("tipo: valor do tipo; ano ignorado", () => {
    const s = slidesRanking(rankings, { tipo: "pix", ano: 2020 })[1]!;
    expect(s.valorTipo).toBe(14);
    expect(s.ignorados).toEqual(["ano"]);
  });
});

describe("comparar", () => {
  const a = { nome: "Ana", pago: 300, empenhado: 400, n: 3 };
  const b = { nome: "Bia", pago: 100, empenhado: 400, n: 6 };
  test("linhas com máximo comum", () => {
    const r = comparar(a, b);
    expect(r.linhas.map((l) => l.chave)).toEqual(["pago", "empenhado", "n"]);
    expect(r.linhas[0]).toMatchObject({ a: 300, b: 100, max: 300 });
    expect(r.lider).toBe("a");
    expect(r.razao).toBe(3);
  });
  test("frase", () => expect(fraseComparacao(a, b)).toBe("Ana recebeu 3 vezes mais que Bia em emendas pagas."));
  test("empate e zero", () => {
    expect(fraseComparacao(a, { ...a, nome: "Ana 2" })).toBe("Ana e Ana 2 têm o mesmo valor pago em emendas.");
    expect(comparar(a, { ...b, pago: 0 }).razao).toBeNull();
    expect(fraseComparacao(a, { ...b, pago: 0 })).toBe("Ana tem emendas pagas; Bia, nenhuma.");
  });
  test("razão arredonda em 1 casa pt-BR", () => expect(fraseComparacao({ ...a, pago: 250 }, b)).toBe("Ana recebeu 2,5 vezes mais que Bia em emendas pagas."));
  test("abaixo do dobro: percentual", () => expect(fraseComparacao({ ...a, pago: 150 }, b)).toBe("Ana recebeu 50% a mais que Bia em emendas pagas."));
  test("quase empate: diferença em reais", () =>
    expect(fraseComparacao({ ...a, pago: 323_80_000_000 }, { ...b, pago: 321_60_000_000 })).toBe("Quase empate: Ana recebeu só R$ 2,2 milhões a mais que Bia."));
});

describe("série e sparkline", () => {
  test("serieAnual preenche anos sem dados com zero", () => expect(serieAnual([{ ano: 2025, pago: 5 }, { ano: 2023, pago: 2 }], [2023, 2024, 2025])).toEqual([2, 0, 5]));
  test("sparkPath normaliza para a caixa", () => expect(sparkPath([0, 10], 100, 20)).toBe("M0,20L100,0"));
  test("sparkPath com um ponto ou plano", () => {
    expect(sparkPath([], 100, 20)).toBe("");
    expect(sparkPath([0, 0], 100, 20)).toBe("M0,20L100,20");
    expect(sparkPath([3, 3], 100, 20)).toBe("M0,0L100,0");
  });
});

describe("parlamentares", () => {
  const idx = indiceParlamentares(
    [{ id: 7, nome: "Tabata Amaral", siglaPartido: "PSB", siglaUf: "SP", urlFoto: "f.jpg" }],
    [{ codigo: "5", nome: "Eduardo Braga", nomeCompleto: "Carlos Eduardo de Souza Braga", foto: "s.jpg", partido: "MDB", uf: "AM" }],
  );
  test("cruza por chave de nome, com e sem pronome", () => {
    expect(parlamentarDe(idx, "TABATA AMARAL")).toMatchObject({ foto: "f.jpg", partido: "PSB", uf: "SP", href: "/deputado/7", casa: "Câmara" });
    expect(parlamentarDe(idx, "SEN EDUARDO BRAGA")).toMatchObject({ partido: "MDB", href: "/senador/5", casa: "Senado" });
    expect(parlamentarDe(idx, "CARLOS EDUARDO DE SOUZA BRAGA")?.uf).toBe("AM");
    expect(parlamentarDe(idx, "NINGUEM")).toBeNull();
  });
});

describe("nomeProprio", () => {
  test.each([
    ["EDUARDO BRAGA", "Eduardo Braga"], ["NELSINHO TRAD FILHO", "Nelsinho Trad Filho"],
    ["VENEZIANO VITAL DO REGO", "Veneziano Vital do Rego"], ["BANCADA DE SAO PAULO", "Bancada de Sao Paulo"], ["COMISSAO - CAS", "Comissao - CAS"],
  ] as const)("%s", (de, para) => expect(nomeProprio(de)).toBe(para));
});

describe("valorExtenso", () => {
  test.each([
    [19455707030175, "R$ 194,6 bilhões"], [123456789_00, "R$ 123,5 milhões"], [1_000_000_00, "R$ 1 milhão"],
    [1_000_000_000_00, "R$ 1 bilhão"], [5_432_10, "R$ 5,4 mil"], [12_34, "R$ 12"],
  ] as const)("%d", (c, s) => expect(valorExtenso(c)).toBe(s));
});

describe("noEstado", () => {
  test.each([["BA", "na Bahia"], ["CE", "no Ceará"], ["SP", "em São Paulo"], ["RJ", "no Rio de Janeiro"], ["DF", "no Distrito Federal"], ["XX", "em XX"]] as const)("%s", (uf, s) => expect(noEstado(uf)).toBe(s));
});

describe("recorteTexto", () => {
  test("só os filtros aplicados", () => {
    expect(recorteTexto({ tipo: "pix", ano: 2025, uf: "BA" }, ["tipo", "ano"])).toBe("na Bahia");
    expect(recorteTexto({ tipo: "pix", ano: 2025 }, [])).toBe("Emenda Pix em 2025");
    expect(recorteTexto({}, [])).toBe("");
  });
});
