import { describe, expect, test } from "bun:test";
import type { GastosRanking } from "@emenda/contracts";
import {
  alinhamento, classificarProcessoSenado, classificarSituacao, comparaGastos, emendasIndicadores, parseComparar, pontosDeAtencao,
  presenca, presencaSenado, producao, serializarComparar, type Indicadores, type Ponto,
} from "./regras";

describe("classificarSituacao (Câmara)", () => {
  test.each([
    ["Transformado em Norma Jurídica", "lei"],
    ["Aguardando Apreciação pelo Senado Federal", "avancou"],
    ["Aguardando Sanção", "avancou"],
    ["Enviada ao Senado Federal", "avancou"],
    ["Aguardando Promulgação", "avancou"],
    ["Vetado totalmente", "avancou"],
    ["Arquivada", "arquivada"],
    ["Retirado pelo(a) Autor(a)", "arquivada"],
    ["Devolvida ao(à) Autor(a)", "arquivada"],
    ["Aguardando Parecer", "tramitando"],
    ["Tramitando em Conjunto", "tramitando"],
    ["Pronta para Pauta", "tramitando"],
    [null, "tramitando"],
  ] as const)("%p -> %p", (s, r) => expect(classificarSituacao(s)).toBe(r));
});

describe("classificarProcessoSenado", () => {
  test.each([
    [{ normaGerada: "Lei nº 15.100", tramitando: "Não", situacaoAtual: "TRANSFORMADA EM NORMA JURÍDICA" }, "lei"],
    [{ tramitando: "Não", situacaoAtual: "REMETIDA À CÂMARA DOS DEPUTADOS" }, "avancou"],
    [{ tramitando: "Não", situacaoAtual: "APROVADA" }, "avancou"],
    [{ tramitando: "Não", situacaoAtual: "ARQUIVADA AO FINAL DA LEGISLATURA" }, "arquivada"],
    [{ tramitando: "Não", situacaoAtual: "REJEITADA" }, "arquivada"],
    [{ tramitando: "Sim", situacaoAtual: "AGUARDANDO DESIGNAÇÃO DO RELATOR" }, "tramitando"],
    [{ tramitando: "Não" }, "arquivada"],
  ] as const)("%p -> %p", (p, r) => expect(classificarProcessoSenado(p)).toBe(r));
});

describe("producao", () => {
  test("agrupa por tipo e por desfecho", () => {
    const r = producao([
      { tipo: "PL", desfecho: "lei" }, { tipo: "PL", desfecho: "tramitando" }, { tipo: "PEC", desfecho: "avancou" }, { tipo: "PL", desfecho: "arquivada" },
    ]);
    expect(r).toEqual({ total: 4, porTipo: [{ tipo: "PL", n: 3 }, { tipo: "PEC", n: 1 }], lei: 1, avancou: 1, arquivada: 1, tramitando: 1 });
  });
});

describe("presença", () => {
  test("Câmara: voto registrado / votações no exercício", () => {
    expect(presenca(["Sim", "Não", null, "Obstrução", null])).toEqual({ presente: 3, total: 5, pct: 0.6 });
    expect(presenca([])).toEqual({ presente: 0, total: 0, pct: null });
  });
  test("Senado: separa ausência justificada (licença, missão) de não comparecimento", () => {
    expect(presencaSenado(["Sim", "Votou", "P-NRV", "Não", "Abstenção", "MIS", "LS", "AP", "NCom", "Presidente"])).toEqual({
      presente: 6, justificada: 3, semJustificativa: 1, total: 10, pct: 0.6,
    });
  });
});

describe("alinhamento com a orientação do partido", () => {
  test("só conta quando há orientação e voto Sim/Não/Abstenção/Obstrução", () => {
    expect(alinhamento([
      { voto: "Sim", orientacao: "Sim" },
      { voto: "Não", orientacao: "Sim" },
      { voto: "Sim", orientacao: "Liberado" },
      { voto: "Sim", orientacao: null },
      { voto: "Obstrução", orientacao: "Obstrução" },
      { voto: "Art. 17", orientacao: "Sim" },
    ])).toEqual({ seguiu: 2, contra: 1, total: 3, pctContra: 1 / 3 });
  });
  test("vazio", () => expect(alinhamento([])).toEqual({ seguiu: 0, contra: 0, total: 0, pctContra: null }));
});

describe("comparaGastos", () => {
  const r = { parlamentares: [
    { casa: "camara", id: "1", emExercicio: true, mandato: 300 },
    { casa: "camara", id: "2", emExercicio: true, mandato: 100 },
    { casa: "camara", id: "3", emExercicio: true, mandato: 200 },
    { casa: "camara", id: "4", emExercicio: false, mandato: 50 },
    { casa: "senado", id: "1", emExercicio: true, mandato: 9000 },
  ] } as unknown as GastosRanking;
  test("média entre em exercício na mesma casa + posição", () => {
    expect(comparaGastos(r, "camara", "3")).toEqual({ valor: 200, media: 200, n: 3, posicao: 2 });
    expect(comparaGastos(r, "camara", 1)).toEqual({ valor: 300, media: 200, n: 3, posicao: 1 });
  });
  test("fora de exercício entra no ranking só para a própria posição", () => {
    expect(comparaGastos(r, "camara", "4")).toEqual({ valor: 50, media: 200, n: 4, posicao: 4 });
  });
  test("ausente -> null", () => expect(comparaGastos(r, "senado", "77")).toBeNull());
});

describe("emendasIndicadores", () => {
  test("pago inclui restos a pagar; % Pix; % para a própria UF entre as com UF conhecida", () => {
    const es = [
      { tipo: "pix", pago: 100, rapPago: 0, uf: "SP" },
      { tipo: "individual", pago: 200, rapPago: 100, uf: "SP" },
      { tipo: "individual", pago: 100, rapPago: 0, uf: "RJ" },
      { tipo: "bancada", pago: 100, rapPago: 0, uf: null },
      { tipo: "individual", pago: 0, rapPago: 0, uf: "MG" },
    ];
    const r = emendasIndicadores(es, "SP");
    expect(r.pago).toBe(600);
    expect(r.pctPix).toBeCloseTo(100 / 600);
    expect(r.pctForaUf).toBeCloseTo(100 / 500);
  });
  test("sem valores", () => expect(emendasIndicadores([], "SP")).toEqual({ pago: 0, pctPix: 0, pctForaUf: null }));
});

describe("pontosDeAtencao (regras neutras)", () => {
  const vazio: Indicadores = { casa: "camara", trocas: null, presenca: null, alinhamento: null, emendas: null, gastos: null };
  const st = (ps: Ponto[], id: string) => ps.find((p) => p.id === id)?.status;
  test("sem dados -> todas as regras 'sem-dados', sempre com fórmula", () => {
    const ps = pontosDeAtencao(vazio);
    expect(ps.map((p) => p.id)).toEqual(["gastos", "orientacao", "trocas", "pix", "presenca", "fora-uf"]);
    for (const p of ps) { expect(p.status).toBe("sem-dados"); expect(p.formula.length).toBeGreaterThan(10); }
  });
  test.each([
    ["gastos", { gastos: { valor: 201, media: 200, n: 3, posicao: 1 } }, "atencao"],
    ["gastos", { gastos: { valor: 200, media: 200, n: 3, posicao: 2 } }, "ok"],
    ["orientacao", { alinhamento: { seguiu: 9, contra: 1, total: 10, pctContra: 0.1 } }, "atencao"],
    ["orientacao", { alinhamento: { seguiu: 19, contra: 1, total: 20, pctContra: 0.05 } }, "ok"],
    ["orientacao", { alinhamento: { seguiu: 0, contra: 0, total: 0, pctContra: null } }, "sem-dados"],
    ["trocas", { trocas: 0 }, "ok"],
    ["trocas", { trocas: 2 }, "atencao"],
    ["pix", { emendas: { pago: 10, pctPix: 0.5, pctForaUf: 0 } }, "atencao"],
    ["pix", { emendas: { pago: 10, pctPix: 0.49, pctForaUf: 0 } }, "ok"],
    ["pix", { emendas: { pago: 0, pctPix: 0, pctForaUf: null } }, "sem-dados"],
    ["presenca", { presenca: { presente: 7, total: 10, pct: 0.7 } }, "atencao"],
    ["presenca", { presenca: { presente: 8, total: 10, pct: 0.8 } }, "ok"],
    ["fora-uf", { emendas: { pago: 10, pctPix: 0, pctForaUf: 0.1 } }, "atencao"],
    ["fora-uf", { emendas: { pago: 10, pctPix: 0, pctForaUf: 0.02 } }, "ok"],
  ] as const)("%s %p -> %s", (id, parcial, status) => {
    expect(st(pontosDeAtencao({ ...vazio, ...parcial } as Indicadores), id)).toBe(status);
  });
  test("texto factual com número", () => {
    const p = pontosDeAtencao({ ...vazio, trocas: 2 }).find((x) => x.id === "trocas")!;
    expect(p.texto).toBe("Trocou de partido 2 vezes no período registrado.");
    const g = pontosDeAtencao({ ...vazio, gastos: { valor: 300, media: 200, n: 500, posicao: 12 } }).find((x) => x.id === "gastos")!;
    expect(g.texto).toBe("Gastou 50% acima da média da Câmara na cota parlamentar (12º de 500).");
  });
});

describe("parseComparar / serializarComparar", () => {
  test.each([
    ["deputado:123,senador:5672", [{ casa: "deputado", id: "123" }, { casa: "senador", id: "5672" }]],
    ["deputado:1,deputado:1,x:2,senador:abc", [{ casa: "deputado", id: "1" }]],
    ["deputado:1,deputado:2,deputado:3,deputado:4", [{ casa: "deputado", id: "1" }, { casa: "deputado", id: "2" }, { casa: "deputado", id: "3" }]],
    [null, []],
  ] as const)("%p", (s, r) => expect(parseComparar(s)).toEqual([...r]));
  test("ida e volta", () => expect(serializarComparar([{ casa: "senador", id: "9" }, { casa: "deputado", id: "8" }])).toBe("senador:9,deputado:8"));
});
