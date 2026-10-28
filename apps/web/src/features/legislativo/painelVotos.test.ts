import { describe, expect, test } from "bun:test";
import { contraOrientacao, enriquecerVotos, filtrarVotos, gruposVoto, opcoesFiltro } from "./painelVotos";
import type { Orientacao, VotoCamara } from "./votacao";

const v = (id: number, nome: string, p: string, uf: string, voto: string): VotoCamara => ({ tipoVoto: voto, dataRegistroVoto: "", deputado_: { id, nome, siglaPartido: p, siglaUf: uf, urlFoto: "" } });
const o = (sig: string, voto: string): Orientacao => ({ orientacaoVoto: voto, codTipoLideranca: "P", siglaPartidoBloco: sig, codPartidoBloco: null });
const votos = [v(1, "Ana", "PT", "SP", "Sim"), v(2, "Bruno", "PT", "RJ", "Não"), v(3, "Célia", "PL", "SP", "Não"), v(4, "Davi", "PL", "MG", "Sim"), v(5, "Éster", "PSOL", "SP", "Abstenção"), v(6, "Fábio", "MDB", "BA", "Artigo 17")];
const ori = [o("PT", "Sim"), o("PL", "Não"), o("MDB", "Liberado")];

describe("contraOrientacao", () => {
  test.each([
    ["Sim", "Sim", false], ["Não", "Sim", true], ["Abstenção", "Não", true], ["Sim", "Liberado", false], ["Artigo 17", "Sim", false], ["Sim", null, false],
  ] as const)("%s vs %s -> %p", (voto, ori, exp) => expect(contraOrientacao(voto, ori)).toBe(exp));
});

describe("enriquecerVotos", () => {
  const e = enriquecerVotos(votos, ori);
  test("orientação e flag contra", () => {
    expect(e.find((x) => x.id === 2)).toMatchObject({ cat: "nao", orientacao: "Sim", contra: true, partido: "PT" });
    expect(e.find((x) => x.id === 1)!.contra).toBe(false);
    expect(e.find((x) => x.id === 5)!.orientacao).toBeNull();
  });
  test("sem orientações", () => expect(enriquecerVotos(votos).every((x) => !x.contra)).toBe(true));
});

describe("filtrarVotos", () => {
  const e = enriquecerVotos(votos, ori);
  test.each([
    [{ busca: "celia" }, [3]],
    [{ busca: "pl" }, [3, 4]],
    [{ partidos: ["PT"] }, [1, 2]],
    [{ ufs: ["SP"], partidos: ["PL", "PSOL"] }, [3, 5]],
    [{ soContra: true }, [2, 4]],
    [{}, [1, 2, 3, 4, 5, 6]],
  ] as const)("%o", (f, ids) => expect(filtrarVotos(e, f).map((x) => x.id)).toEqual([...ids]));
});

describe("gruposVoto", () => {
  const e = enriquecerVotos(votos, ori);
  test("ordem por voto, nomes ordenados, contagens", () => {
    const g = gruposVoto(e, false);
    expect(g.map((x) => [x.lado, x.itens.map((i) => i.id)])).toEqual([["sim", [1, 4]], ["nao", [2, 3]], ["outro", [5, 6]]]);
  });
  test("subgrupos por partido (maior primeiro)", () => {
    const g = gruposVoto([...e, ...enriquecerVotos([v(7, "Gil", "PL", "SP", "Não")], ori)], true);
    expect(g[1]!.partidos!.map((p) => [p.partido, p.itens.length])).toEqual([["PL", 2], ["PT", 1]]);
  });
});

test("opcoesFiltro conta partidos e UFs", () => {
  const f = opcoesFiltro(enriquecerVotos(votos, ori));
  expect(f.partidos[0]).toEqual({ valor: "PL", n: 2 });
  expect(f.ufs[0]).toEqual({ valor: "SP", n: 3 });
});
