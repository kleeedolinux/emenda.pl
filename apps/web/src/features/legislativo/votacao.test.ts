import { describe, expect, test } from "bun:test";
import {
  categoriaVoto, placar, mapaOrientacoes, porPartido, porUf, assentosVotacao, placarDaDescricao,
  votosSenado, normPartido, ladosFotos, type VotoCamara,
} from "./votacao";

const v = (id: number, tipoVoto: string, siglaPartido: string, siglaUf = "SP"): VotoCamara => ({
  tipoVoto, dataRegistroVoto: "", deputado_: { id, nome: `Dep ${id}`, siglaPartido, siglaUf, urlFoto: `f${id}` },
});
const votos = [
  v(1, "Sim", "PT"), v(2, "Sim", "PT"), v(3, "Não", "PT", "RJ"),
  v(4, "Não", "PL", "RJ"), v(5, "Obstrução", "PL"), v(6, "Abstenção", "UNIÃO"), v(7, "Artigo 17", "UNIÃO"),
];
const orient = [
  { orientacaoVoto: "Sim", codTipoLideranca: "P", siglaPartidoBloco: "PL", codPartidoBloco: 1 },
  { orientacaoVoto: "Não", codTipoLideranca: "B", siglaPartidoBloco: "Fdr PT-PCdoB-PV", codPartidoBloco: null },
  { orientacaoVoto: "Liberado", codTipoLideranca: "P", siglaPartidoBloco: "União", codPartidoBloco: 2 },
  { orientacaoVoto: "Sim", codTipoLideranca: "G", siglaPartidoBloco: "Governo", codPartidoBloco: null },
];

describe("categoriaVoto", () => {
  test.each([
    ["Sim", "sim"], ["Não", "nao"], ["NÃO", "nao"], ["Abstenção", "abstencao"], ["Obstrução", "obstrucao"],
    ["Artigo 17", "outro"], ["AP", "outro"], ["Presidente (art. 51 RISF)", "outro"], ["", "outro"],
  ])("%s -> %s", (i, o) => expect(categoriaVoto(i)).toBe(o as never));
});

test("placar", () => expect(placar(votos)).toEqual({ sim: 2, nao: 2, abstencao: 1, obstrucao: 1, outro: 1, total: 7 }));

test("normPartido ignora acento/caixa", () => expect(normPartido("União")).toBe(normPartido("UNIÃO")));

describe("mapaOrientacoes", () => {
  const m = mapaOrientacoes(orient);
  test("partido direto (P) e federação expandida", () => {
    expect(m.partidos.get(normPartido("PL"))).toBe("Sim");
    expect(m.partidos.get(normPartido("PT"))).toBe("Não");
    expect(m.partidos.get(normPartido("PCdoB"))).toBe("Não");
    expect(m.partidos.get(normPartido("UNIÃO"))).toBe("Liberado");
  });
  test("lideranças gerais separadas", () => expect(m.gerais).toEqual([{ lideranca: "Governo", orientacao: "Sim" }]));
});

describe("porPartido", () => {
  const rows = porPartido(votos, orient);
  const pt = rows.find((r) => r.grupo === "PT")!;
  const pl = rows.find((r) => r.grupo === "PL")!;
  test("ordena por total desc, depois nome", () => expect(rows.map((r) => r.grupo)).toEqual(["PT", "PL", "UNIÃO"]));
  test("contagens", () => expect([pt.sim, pt.nao, pt.total]).toEqual([2, 1, 3]));
  test("contra orientação conta só orientação sim/não/obstrução/abstenção", () => {
    expect(pt.orientacao).toBe("Não");
    expect(pt.contra).toBe(2);
    expect(pl.contra).toBe(2);
    expect(rows.find((r) => r.grupo === "UNIÃO")!.contra).toBe(0);
  });
  test("ids dos que votaram contra", () => expect(pt.contraIds).toEqual([1, 2]));
});

test("porUf", () => {
  const rows = porUf(votos);
  expect(rows.map((r) => [r.grupo, r.total])).toEqual([["SP", 5], ["RJ", 2]]);
});

describe("assentosVotacao", () => {
  test("preenche ausentes até o total de cadeiras", () => {
    const s = assentosVotacao(votos, "voto", 10);
    expect(s.length).toBe(10);
    expect(s.filter((x) => x.group === "Ausente / sem registro").length).toBe(3);
  });
  test("modo voto: grupo = voto, mas assentos ordenados por partido (contíguos)", () => {
    const s = assentosVotacao(votos, "voto", 7);
    expect(new Set(s.map((x) => x.group))).toEqual(new Set(["Sim", "Não", "Abstenção", "Obstrução", "Outros"]));
    const labels = s.map((x) => x.label);
    expect(labels.findIndex((l) => l.includes("PL"))).toBeGreaterThan(labels.map((l) => l.includes("(PT")).lastIndexOf(true));
    expect(s[0]!.label).toContain("Dep");
  });
  test("modo partido: grupo = partido", () => {
    const p = assentosVotacao(votos, "partido", 7);
    expect(new Set(p.map((x) => x.group))).toEqual(new Set(["PT", "PL", "UNIÃO"]));
  });
  test("nunca corta votos se total < votos", () => expect(assentosVotacao(votos, "voto", 3).length).toBe(7));
});

describe("placarDaDescricao", () => {
  test.each<[string, ReturnType<typeof placarDaDescricao>]>([
    ["Suprimido o texto. Sim: 307; não: 166; abstenção: 5; total: 478.", { sim: 307, nao: 166, abstencao: 5, total: 478 }],
    ["Aprovada a Emenda. Sim: 314; Não: 117; Abstenção: 1; Total: 432.", { sim: 314, nao: 117, abstencao: 1, total: 432 }],
    ["Rejeitado o Requerimento. Sim: 132; Não: 309; Total: 441.", { sim: 132, nao: 309, abstencao: 0, total: 441 }],
    ["Aprovada a Redação Final.", null],
  ])("%s", (d, o) => expect(placarDaDescricao(d)).toEqual(o));
});

test("votosSenado normaliza para a mesma forma (com foto do Senado)", () => {
  const r = votosSenado([{ codigoParlamentar: 70, nomeParlamentar: "Renan", siglaPartidoParlamentar: "MDB", siglaUFParlamentar: "AL", siglaVotoParlamentar: "Não" }]);
  expect(r[0]).toEqual({
    tipoVoto: "Não", dataRegistroVoto: "",
    deputado_: { id: 70, nome: "Renan", siglaPartido: "MDB", siglaUf: "AL", urlFoto: "https://www.senado.leg.br/senadores/img/fotos-oficiais/senador70.jpg" },
  });
});

test("ladosFotos separa a favor / contra / outros", () => {
  const l = ladosFotos(votos);
  expect([l.favor.length, l.contra.length, l.outros.length]).toEqual([2, 2, 3]);
});
