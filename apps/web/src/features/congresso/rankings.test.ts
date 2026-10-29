import { describe, expect, test } from "bun:test";
import type { GastosRanking } from "@emenda/contracts";
import { indexAutores } from "@/features/legislativo/api";
import type { Orientacao, VotoCamara } from "@/features/legislativo/votacao";
import type { Membro } from "./composicao";
import {
  campeoesCategoria, comparativoPartidos, destaques, emendasLinhas, gastosLinhas, presencaFidelidadeCamara, presencaSenado, ranking, trocasLinhas,
} from "./rankings";

const m = (id: string, partido = "PT", casa: Membro["casa"] = "camara", nome = `N${id}`): Membro =>
  ({ casa, id, nome, partido, uf: "SP", foto: "", sexo: "M", href: `/${casa === "camara" ? "deputado" : "senador"}/${id}` });

const R: GastosRanking = {
  anos: [2025, 2026], dadosAte: { camara: "2026-09", senado: "2026-09" },
  parlamentares: [
    { casa: "camara", id: "1", nome: "A", partido: "PT", uf: "SP", emExercicio: true, mandato: 300, porAno: { "2026": 100 } },
    { casa: "camara", id: "2", nome: "B", partido: "PL", uf: "SP", emExercicio: true, mandato: 900, porAno: { "2026": 50 } },
    { casa: "senado", id: "1", nome: "S", partido: "PT", uf: "SP", emExercicio: true, mandato: 5000, porAno: {} },
  ],
  categorias: [
    { casa: "camara", ano: 2026, categoria: "PASSAGEM AÉREA", valor: 10, n: 1, top: [{ id: "2", valor: 9 }] },
    { casa: "camara", ano: 2026, categoria: "COMBUSTÍVEIS", valor: 20, n: 1, top: [{ id: "9", valor: 9 }] },
    { casa: "camara", ano: 2025, categoria: "X", valor: 99, n: 1, top: [] },
  ],
  fornecedores: [],
};

describe("gastos", () => {
  test("cruza ranking com membros pela casa+id", () => {
    const ls = gastosLinhas(R, [m("1"), m("2", "PL"), m("3")], "mandato");
    expect(ls.map((l) => [l.membro.id, l.valor])).toEqual([["2", 900], ["1", 300], ["3", 0]]);
    expect(gastosLinhas(R, [m("1")], 2026)[0]!.valor).toBe(100);
  });
  test("campeões por categoria do ano, só membros conhecidos", () => {
    const c = campeoesCategoria(R, "camara", 2026, [m("2", "PL")]);
    expect(c.map((x) => [x.categoria, x.membro?.id ?? null])).toEqual([["Combustíveis", null], ["Passagem aérea", "2"]]);
  });
});

test("emendas: cruza por nome", () => {
  const idx = indexAutores([{ codigo: "77", nome: "FULANO", chave: "FULANO", n: 3, pago: 500, empenhado: 900 }]);
  const ls = emendasLinhas([m("1", "PT", "camara", "Fulano"), m("2")], idx);
  expect(ls).toEqual([{ membro: m("1", "PT", "camara", "Fulano"), valor: 500, codigo: "77" }, { membro: m("2"), valor: 0, codigo: null }]);
});

describe("presença e fidelidade (Câmara)", () => {
  const v = (id: number, partido: string, tipoVoto: string): VotoCamara =>
    ({ tipoVoto, dataRegistroVoto: "", deputado_: { id, nome: `N${id}`, siglaPartido: partido, siglaUf: "SP", urlFoto: "" } });
  const o = (sigla: string, orientacaoVoto: string): Orientacao => ({ orientacaoVoto, codTipoLideranca: "P", siglaPartidoBloco: sigla, codPartidoBloco: 1 });
  const amostra = [
    { votos: [v(1, "PT", "Sim"), v(2, "PL", "Não")], orientacoes: [o("PT", "Sim"), o("PL", "Sim")] },
    { votos: [v(1, "PT", "Não")], orientacoes: [o("PT", "Sim")] },
    { votos: [v(1, "PT", "Sim"), v(2, "PL", "Obstrução")], orientacoes: [o("PT", "Liberado")] },
  ];
  const r = presencaFidelidadeCamara(amostra, [m("1"), m("2", "PL"), m("3")]);
  test("presença = votações com voto / votações da amostra", () => {
    expect(r.presenca.get("1")).toEqual({ presentes: 3, total: 3, pct: 1 });
    expect(r.presenca.get("2")).toEqual({ presentes: 2, total: 3, pct: 2 / 3 });
    expect(r.presenca.get("3")).toEqual({ presentes: 0, total: 3, pct: 0 });
  });
  test("fidelidade só onde houve orientação Sim/Não e voto Sim/Não", () => {
    expect(r.fidelidade.get("1")).toEqual({ seguiu: 1, contrariou: 1, pct: 0.5 });
    expect(r.fidelidade.get("2")).toEqual({ seguiu: 0, contrariou: 1, pct: 0 });
    expect(r.fidelidade.get("3")).toBeUndefined();
  });
  test("coesão por partido (Rice médio)", () => {
    expect(r.coesao.get("PT")).toBe(1);
    expect(r.coesao.get("PL")).toBe(1);
  });
});

test("presença no Senado ignora licenças e missões", () => {
  const vs = [
    { votos: [{ codigoParlamentar: 1, siglaVotoParlamentar: "Votou" }, { codigoParlamentar: 2, siglaVotoParlamentar: "NCom" }] },
    { votos: [{ codigoParlamentar: 1, siglaVotoParlamentar: "Sim" }, { codigoParlamentar: 2, siglaVotoParlamentar: "LS" }] },
    { votos: [{ codigoParlamentar: 1, siglaVotoParlamentar: "MIS" }, { codigoParlamentar: 2, siglaVotoParlamentar: "P-NRV" }] },
  ];
  const p = presencaSenado(vs);
  expect(p.get("1")).toEqual({ presentes: 2, total: 2, pct: 1 });
  expect(p.get("2")).toEqual({ presentes: 1, total: 2, pct: 0.5 });
});

test("trocas de partido pela lista da legislatura", () => {
  const ls = trocasLinhas(
    [{ id: 1, nome: "A", siglaPartido: "PSDB", siglaUf: "SP" }, { id: 1, nome: "A", siglaPartido: "PL", siglaUf: "SP" }, { id: 2, nome: "B", siglaPartido: "PT", siglaUf: "SP" }],
    [m("1", "PL")],
  );
  expect(ls).toEqual([{ membro: m("1", "PL"), valor: 1, partidos: ["PSDB", "PL"] }]);
});

test("ranking ordena, posiciona e corta", () => {
  const xs = [{ membro: m("1"), valor: 1 }, { membro: m("2"), valor: 3 }, { membro: m("3"), valor: 2 }];
  expect(ranking(xs, "desc", 2).map((x) => [x.membro.id, x.posicao])).toEqual([["2", 1], ["3", 2]]);
  expect(ranking(xs, "asc").map((x) => x.membro.id)).toEqual(["1", "3", "2"]);
});

test("comparativo de partidos", () => {
  const ms = [m("1"), m("2", "PL"), m("1", "PT", "senado")];
  const c = comparativoPartidos(ms, {
    gastos: new Map([["camara:1", 300], ["camara:2", 900]]),
    emendas: new Map([["camara:1", 10], ["senado:1", 20]]),
    coesao: new Map([["PT", 0.9]]),
  });
  expect(c[0]).toEqual({ partido: "PT", camara: 1, senado: 1, total: 2, mulheres: 0, gastoMedio: 300, emendas: 30, coesao: 0.9 });
  expect(c[1]!.partido).toBe("PL");
});

test("destaques: mais e menos, ignorando vazios", () => {
  const d = destaques([{ membro: m("1"), valor: 5 }, { membro: m("2"), valor: 0 }, { membro: m("3"), valor: 9 }]);
  expect(d.mais?.membro.id).toBe("3");
  expect(d.menos?.membro.id).toBe("1");
  expect(destaques([]).mais).toBeNull();
});

test("regressão: voto ou orientação nulos na fonte não quebram o cálculo", () => {
  const voto = { tipoVoto: null as unknown as string, dataRegistroVoto: "", deputado_: { id: 1, nome: "A", siglaPartido: "PT", siglaUf: "SP", urlFoto: "" } };
  const r = presencaFidelidadeCamara([{ votos: [voto], orientacoes: [{ orientacaoVoto: null as unknown as string, codTipoLideranca: "P", siglaPartidoBloco: "PT", codPartidoBloco: 1 }] }], [m("1")]);
  expect(r.presenca.get("1")?.presentes).toBe(1);
  expect(r.fidelidade.get("1")).toBeUndefined();
});
