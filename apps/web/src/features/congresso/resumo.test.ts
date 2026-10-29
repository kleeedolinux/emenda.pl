import { describe, expect, test } from "bun:test";
import { agruparPorTema, resumidorModelo, resumir, temaDe, type EntradaResumo } from "./resumo";

const base: EntradaResumo = {
  id: 10, siglaTipo: "PL", numero: 123, ano: 2026,
  ementa: "Altera a Lei nº 8.069, de 13 de julho de 1990, para dispor sobre a vacinação em escolas.",
  explicacao: null, keywords: "vacinação, escola, criança", temas: ["Saúde"],
  autores: [{ nome: "Fulana", partido: "PT", uf: "BA" }], regime: "Ordinário (Art. 151, III, RICD)",
  situacao: "Aguardando Designação de Relator(a)", orgao: "CSAUDE", dataApresentacao: "2026-10-20T10:00",
};

describe("resumo de proposição (modelo determinístico)", () => {
  test("monta parágrafo só com campos oficiais", () => {
    const r = resumir(base);
    expect(r.titulo).toBe("PL 123/2026");
    expect(r.href).toBe("/proposicao/10");
    expect(r.tema).toBe("Saúde");
    expect(r.icone).toBe("saude");
    expect(r.texto).toBe(
      "Projeto de lei apresentado por Fulana (PT-BA) em 20/10/2026. " +
        "Altera a Lei nº 8.069, de 13 de julho de 1990, para dispor sobre a vacinação em escolas. " +
        "Tramita em regime ordinário. Situação: aguardando designação de relator(a) (CSAUDE).",
    );
    expect(r.palavras).toEqual(["vacinação", "escola", "criança"]);
    expect(r.fonte).toBe("modelo");
  });

  test("vários autores, Executivo, explicação da ementa", () => {
    const r = resumir({
      ...base, siglaTipo: "MPV", explicacao: "Cria auxílio para agricultores.", temas: [], keywords: "",
      autores: [{ nome: "Poder Executivo", tipo: "Órgão do Poder Executivo" }], regime: null, situacao: null, orgao: null,
    });
    expect(r.texto).toBe(
      "Medida provisória apresentada pelo Poder Executivo em 20/10/2026. " +
        "Altera a Lei nº 8.069, de 13 de julho de 1990, para dispor sobre a vacinação em escolas. Em resumo, segundo a Câmara: Cria auxílio para agricultores.",
    );
    const r2 = resumir({ ...base, autores: [{ nome: "A", partido: "PL", uf: "SP" }, { nome: "B" }, { nome: "C" }] });
    expect(r2.texto.startsWith("Projeto de lei apresentado por A (PL-SP) e mais 2 autores em 20/10/2026.")).toBe(true);
  });

  test.each([
    [["Educação"], "", "", "Educação", "educacao"],
    [[], "", "Institui o Dia Nacional do Combate à Violência contra a Mulher.", "Mulheres e direitos", "direitos"],
    [[], "imposto, tributo", "Altera alíquotas.", "Impostos e economia", "economia"],
    [[], "", "Denomina viaduto.", "Outros", "outros"],
  ])("tema %j %s %s", (temas, kw, ementa, tema, icone) => {
    expect(temaDe(temas, kw, ementa)).toEqual({ tema, icone } as never);
  });

  test("agrupa por tema, maiores grupos primeiro", () => {
    const a = resumir(base), b = resumir({ ...base, id: 11, temas: ["Educação"] }), c = resumir({ ...base, id: 12 });
    expect(agruparPorTema([a, b, c]).map((g) => [g.tema, g.itens.length])).toEqual([["Saúde", 2], ["Educação", 1]]);
  });

  test("interface plugável: o resumidor padrão usa o modelo", async () => {
    expect(resumidorModelo.id).toBe("modelo");
    expect(await resumidorModelo.resumir(base)).toEqual(resumir(base));
  });
});
