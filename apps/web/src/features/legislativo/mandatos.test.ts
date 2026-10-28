import { describe, expect, test } from "bun:test";
import {
  mesclarPeriodos, duracaoDias, formatDuracao, periodosCamara, periodosSenado, mandatosCamara,
  contarLegislaturas, tempoEstimadoLegislaturas, dentro, trimestres, anosDoPeriodo, type Periodo,
} from "./mandatos";

const LEGS = [
  { id: 56, dataInicio: "2019-02-01", dataFim: "2023-01-31" },
  { id: 57, dataInicio: "2023-02-01", dataFim: "2027-01-31" },
  { id: 51, dataInicio: "1999-02-01", dataFim: "2003-01-31" },
];

describe("mesclarPeriodos", () => {
  test.each<[string, Periodo[], Periodo[]]>([
    ["vazio", [], []],
    ["disjuntos ordenados", [{ inicio: "2020-01-01", fim: "2020-12-31" }, { inicio: "2019-01-01", fim: "2019-06-30" }],
      [{ inicio: "2019-01-01", fim: "2019-06-30" }, { inicio: "2020-01-01", fim: "2020-12-31" }]],
    ["sobrepostos", [{ inicio: "2019-01-01", fim: "2020-06-30" }, { inicio: "2020-01-01", fim: "2021-01-01" }],
      [{ inicio: "2019-01-01", fim: "2021-01-01" }]],
    ["contíguos (dia seguinte)", [{ inicio: "2019-01-01", fim: "2019-01-31" }, { inicio: "2019-02-01", fim: "2019-03-01" }],
      [{ inicio: "2019-01-01", fim: "2019-03-01" }]],
    ["contido", [{ inicio: "2019-01-01", fim: "2022-01-01" }, { inicio: "2020-01-01", fim: "2020-02-01" }],
      [{ inicio: "2019-01-01", fim: "2022-01-01" }]],
  ])("%s", (_n, inp, out) => expect(mesclarPeriodos(inp)).toEqual(out));
});

describe("duração", () => {
  test("dias inclusivos e mescla sobreposição", () => {
    expect(duracaoDias([{ inicio: "2020-01-01", fim: "2020-01-10" }])).toBe(10);
    expect(duracaoDias([{ inicio: "2020-01-01", fim: "2020-01-10" }, { inicio: "2020-01-05", fim: "2020-01-12" }])).toBe(12);
  });
  test.each([
    [0, "menos de 1 mês"],
    [20, "menos de 1 mês"],
    [31, "1 mês"],
    [365, "1 ano"],
    [365 * 4 + 1, "4 anos"],
    [365 * 12 + 95, "12 anos e 3 meses"],
    [400, "1 ano e 1 mês"],
  ])("%d dias -> %s", (d, s) => expect(formatDuracao(d)).toBe(s));
});

describe("periodosCamara", () => {
  const hist = [
    { idLegislatura: 57, dataHora: "2023-02-01T00:00", situacao: null, descricaoStatus: "Nome no início da legislatura" },
    { idLegislatura: 57, dataHora: "2023-02-01T12:05", situacao: "Exercício", descricaoStatus: "Entrada - Posse de Eleito Titular" },
    { idLegislatura: 57, dataHora: "2024-03-10T10:00", situacao: "Afastado", descricaoStatus: "Saída - Afastamento - Investidura no cargo de Secretário" },
    { idLegislatura: 57, dataHora: "2024-09-01T10:00", situacao: "Exercício", descricaoStatus: "Entrada - Reassunção" },
    { idLegislatura: 56, dataHora: "2019-02-01T11:45", situacao: "Exercício", descricaoStatus: "Entrada - Posse" },
    { idLegislatura: 56, dataHora: "2023-01-31T23:59", situacao: "FIM_MANDATO", descricaoStatus: "Saída - Término da Legislatura" },
    // legislatura antiga só com registro informativo: assume a legislatura inteira (estimado)
    { idLegislatura: 51, dataHora: "2023-02-01T00:00", situacao: null, descricaoStatus: "Nome no início da legislatura" },
  ];
  const ms = mandatosCamara(hist, LEGS, "2025-06-30");
  test("um mandato por legislatura, ordenado", () => expect(ms.map((m) => m.legislatura)).toEqual([51, 56, 57]));
  test("períodos de exercício com afastamento", () => {
    expect(ms.find((m) => m.legislatura === 57)!.periodos).toEqual([
      { inicio: "2023-02-01", fim: "2024-03-10" },
      { inicio: "2024-09-01", fim: "2025-06-30" },
    ]);
    expect(ms.find((m) => m.legislatura === 56)!.periodos).toEqual([{ inicio: "2019-02-01", fim: "2023-01-31" }]);
  });
  test("legislatura sem entrada registrada vira estimada", () => {
    const m = ms.find((m) => m.legislatura === 51)!;
    expect(m.estimado).toBe(true);
    expect(m.periodos).toEqual([{ inicio: "1999-02-01", fim: "2003-01-31" }]);
  });
  test("atual = exercício aberto hoje", () => {
    expect(ms.find((m) => m.legislatura === 57)!.atual).toBe(true);
    expect(ms.find((m) => m.legislatura === 56)!.atual).toBe(false);
  });
  test("periodosCamara achata e mescla", () => expect(periodosCamara(ms).length).toBe(3));
});

describe("periodosSenado", () => {
  const mand = [
    {
      CodigoMandato: "4", UfParlamentar: "AL", DescricaoParticipacao: "Titular",
      PrimeiraLegislaturaDoMandato: { NumeroLegislatura: "50", DataInicio: "1995-02-01", DataFim: "1999-01-31" },
      SegundaLegislaturaDoMandato: { NumeroLegislatura: "51", DataInicio: "1999-02-01", DataFim: "2003-01-31" },
      Exercicios: { Exercicio: [{ DataInicio: "1999-07-19", DataFim: "2003-01-31" }, { DataInicio: "1995-02-01", DataFim: "1999-01-31" }] },
    },
    {
      CodigoMandato: "596", UfParlamentar: "AL", DescricaoParticipacao: "Titular",
      PrimeiraLegislaturaDoMandato: { NumeroLegislatura: "57", DataInicio: "2023-02-01", DataFim: "2027-01-31" },
      SegundaLegislaturaDoMandato: { NumeroLegislatura: "58", DataInicio: "2027-02-01", DataFim: "2031-01-31" },
      Exercicios: { Exercicio: { DataInicio: "2023-02-01" } },
    },
    { CodigoMandato: "9", UfParlamentar: "AL", DescricaoParticipacao: "1º Suplente",
      PrimeiraLegislaturaDoMandato: { NumeroLegislatura: "54", DataInicio: "2011-02-01", DataFim: "2015-01-31" },
      SegundaLegislaturaDoMandato: { NumeroLegislatura: "55", DataInicio: "2015-02-01", DataFim: "2019-01-31" } },
  ];
  const ms = periodosSenado(mand, "2025-01-01");
  test("ordena por início e marca o atual", () => {
    expect(ms.map((m) => m.codigo)).toEqual(["4", "9", "596"]);
    expect(ms.map((m) => m.atual)).toEqual([false, false, true]);
  });
  test("exercício aberto fecha hoje; objeto único vira lista", () =>
    expect(ms[2]!.periodos).toEqual([{ inicio: "2023-02-01", fim: "2025-01-01" }]));
  test("suplente sem exercício não conta tempo", () => expect(ms[1]!.periodos).toEqual([]));
  test("janela do mandato cobre as duas legislaturas", () => expect([ms[0]!.inicio, ms[0]!.fim]).toEqual(["1995-02-01", "2003-01-31"]));
});

describe("contagem por legislaturas (listas)", () => {
  const rows = [
    { id: 1, idLegislatura: 57 }, { id: 1, idLegislatura: 57 }, { id: 1, idLegislatura: 56 },
    { id: 2, idLegislatura: 57 },
  ];
  const c = contarLegislaturas(rows);
  test("conta legislaturas distintas por id", () => {
    expect([...c.get(1)!].sort()).toEqual([56, 57]);
    expect(c.get(2)!.size).toBe(1);
  });
  test("tempo estimado limita a legislatura em curso a hoje", () =>
    expect(tempoEstimadoLegislaturas(new Set([56, 57]), LEGS, "2023-02-10")).toBe(duracaoDias([{ inicio: "2019-02-01", fim: "2023-02-10" }])));
});

test("dentro: data no período (inclusivo, aceita datetime)", () => {
  const p = { inicio: "2023-02-01", fim: "2027-01-31" };
  expect(dentro("2023-02-01T10:00", p)).toBe(true);
  expect(dentro("2027-01-31", p)).toBe(true);
  expect(dentro("2023-01-31", p)).toBe(false);
});

describe("janelas", () => {
  test("trimestres do período (mais recente primeiro, limitado a hoje, máx. 3 meses)", () => {
    const t = trimestres({ inicio: "2023-02-01", fim: "2027-01-31" }, "2023-08-15");
    expect(t.map((x) => [x.inicio, x.fim])).toEqual([
      ["2023-07-01", "2023-08-15"], ["2023-04-01", "2023-06-30"], ["2023-02-01", "2023-03-31"],
    ]);
    expect(t[0]!.rotulo).toBe("3º trim. 2023");
  });
  test("anosDoPeriodo limita a hoje e ao mínimo", () => {
    expect(anosDoPeriodo({ inicio: "2019-02-01", fim: "2027-01-31" }, "2024-05-01", 2020)).toEqual([2024, 2023, 2022, 2021, 2020]);
  });
});
