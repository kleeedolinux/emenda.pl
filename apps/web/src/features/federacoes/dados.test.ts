import { describe, expect, test } from "bun:test";
import type { VotoCamara } from "@/features/legislativo/votacao";
import { FEDERACOES, coesaoFederacao, federacaoDoPartido, federacaoPorId, federacaoPorTexto, vigencia } from "./dados";

describe("catálogo", () => {
  test("ids únicos e partidos não repetidos entre federações", () => {
    expect(new Set(FEDERACOES.map((f) => f.id)).size).toBe(FEDERACOES.length);
    const ps = FEDERACOES.flatMap((f) => f.partidos);
    expect(new Set(ps).size).toBe(ps.length);
  });
  test("toda federação cita fonte oficial do TSE", () => {
    for (const f of FEDERACOES) expect(f.fontes.some((x) => x.href.includes("tse.jus.br"))).toBe(true);
  });
  test.each([
    ["PT", "brasil-da-esperanca"], ["PCdoB", "brasil-da-esperanca"], ["pcdob", "brasil-da-esperanca"], ["PV", "brasil-da-esperanca"],
    ["PSOL", "psol-rede"], ["REDE", "psol-rede"], ["PSDB", "psdb-cidadania"], ["CIDADANIA", "psdb-cidadania"],
    ["UNIÃO", "uniao-progressista"], ["UNIAO", "uniao-progressista"], ["PP", "uniao-progressista"],
    ["PRD", "renovacao-solidaria"], ["SOLIDARIEDADE", "renovacao-solidaria"], ["PL", null], ["", null],
  ])("%s -> %s", (p, id) => expect(federacaoDoPartido(p)?.id ?? null).toBe(id));
  test("por id", () => expect(federacaoPorId("psol-rede")?.partidos).toEqual(["PSOL", "REDE"]));
});

describe("federacaoPorTexto", () => {
  test.each([
    ["Fdr PT-PCdoB-PV", "brasil-da-esperanca"],
    ["Fdr PSOL-REDE", "psol-rede"],
    ["Federação Brasil da Esperança", "brasil-da-esperanca"],
    ["FE BRASIL", "brasil-da-esperanca"],
    ["Federação PSDB Cidadania", "psdb-cidadania"],
    ["Federação União Progressista", "uniao-progressista"],
    ["Fed PSDB CIDAD.", "psdb-cidadania"],
    ["Bloco qualquer", null],
  ])("%s", (t, id) => expect(federacaoPorTexto(t)?.id ?? null).toBe(id));
});

describe("vigencia", () => {
  test("mínimo de 4 anos a partir do deferimento", () => {
    expect(vigencia({ deferimento: "2022-05-26" }, "2026-10-28")).toEqual({ minimoAte: "2026-05-26", cumpriuMinimo: true });
    expect(vigencia({ deferimento: "2026-03-26" }, "2026-10-28")).toEqual({ minimoAte: "2030-03-26", cumpriuMinimo: false });
  });
});

const v = (id: number, p: string, voto: string): VotoCamara => ({ tipoVoto: voto, dataRegistroVoto: "", deputado_: { id, nome: `D${id}`, siglaPartido: p, siglaUf: "SP", urlFoto: "" } });

describe("coesaoFederacao", () => {
  const fe = federacaoPorId("brasil-da-esperanca")!;
  test("unida", () => {
    const r = coesaoFederacao([v(1, "PT", "Sim"), v(2, "PT", "Sim"), v(3, "PCdoB", "Sim"), v(4, "PV", "Sim"), v(5, "PL", "Não")], fe);
    expect(r.posicao).toBe("sim");
    expect(r.coesao).toBe(1);
    expect(r.unida).toBe(true);
    expect(r.total).toBe(4);
    expect(r.partidos.map((p) => [p.partido, p.posicao])).toEqual([["PT", "sim"], ["PCdoB", "sim"], ["PV", "sim"]]);
  });
  test("dividida entre partidos", () => {
    const r = coesaoFederacao([v(1, "PT", "Sim"), v(2, "PT", "Sim"), v(3, "PCdoB", "Sim"), v(4, "PV", "Não"), v(6, "PV", "Não")], fe);
    expect(r.posicao).toBe("sim");
    expect(r.coesao).toBeCloseTo(3 / 5);
    expect(r.unida).toBe(false);
  });
  test("abstenção/obstrução não contam no denominador", () => {
    const r = coesaoFederacao([v(1, "PT", "Sim"), v(2, "PT", "Obstrução"), v(3, "PV", "Abstenção")], fe);
    expect(r.coesao).toBe(1);
    expect(r.outros).toBe(2);
  });
  test("empate e ausência", () => {
    expect(coesaoFederacao([v(1, "PT", "Sim"), v(2, "PT", "Não")], fe).posicao).toBe("dividido");
    const vazio = coesaoFederacao([v(5, "PL", "Sim")], fe);
    expect(vazio.posicao).toBeNull();
    expect(vazio.coesao).toBeNull();
    expect(vazio.partidos.every((p) => p.posicao === null)).toBe(true);
  });
});
