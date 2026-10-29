import { describe, expect, test } from "bun:test";
import { CABECALHOS, HERO, cabecalhoMunicipio, cabecalhoPolitico, cabecalhoUf, type Cabecalho } from "./cabecalhos";

// Título e subtítulo nunca usam jargão. Só o rótulo pequeno "Oficialmente: ..." pode.
const JARGAO = /emenda|convênio|indic|favorecid|proposi|tramita|ementa|RP ?9/i;

const casos: Array<[string, Cabecalho]> = [
  ...Object.entries(CABECALHOS),
  ["municipio", cabecalhoMunicipio("Iraquara")],
  ["uf", cabecalhoUf("Bahia")],
  ["deputado", cabecalhoPolitico("Tabata Amaral", "deputado")],
  ["senador", cabecalhoPolitico("Otto Alencar", "senador")],
];

describe("cabeçalhos em linguagem comum", () => {
  test.each(casos)("%s: título e subtítulo sem jargão", (_, c) => {
    expect(c.titulo).not.toMatch(JARGAO);
    expect(c.subtitulo).not.toMatch(JARGAO);
  });
  test.each(casos)("%s: subtítulo curto, termina com ponto", (_, c) => {
    expect(c.subtitulo.length).toBeLessThanOrEqual(220);
    expect(c.subtitulo.trim().endsWith(".")).toBe(true);
  });
  test.each(casos.filter(([, c]) => c.oficial))("%s: jargão só como “Oficialmente:”", (_, c) => expect(c.oficial).toMatch(/^Oficialmente: /));
  test("topo grande (Home, /emendas) sem jargão fora do “Oficialmente:”", () => {
    for (const [k, v] of Object.entries(HERO)) if (k !== "oficial") expect(v).not.toMatch(JARGAO);
    expect(HERO.oficial).toMatch(/^Oficialmente: /);
  });
  test("cobre todas as páginas pedidas", () => {
    for (const k of ["home", "emendas", "ultimas", "dinheiro", "pix", "proposicoes", "votacao", "partidos", "bancadas", "comissoes", "federacoes", "congresso", "stf", "agenda", "auditar"])
      expect(Object.keys(CABECALHOS)).toContain(k);
  });
});
