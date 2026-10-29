import { describe, expect, test } from "bun:test";
import { cdnImg, criarCdn, precisaCredito, slugNome, trocarParaOriginal } from "./cdn";

const c = criarCdn("https://cdn.test/");

describe("caminhos", () => {
  test.each([
    [c.fotoDeputado(204554), "https://cdn.test/foto/deputado/204554-160.webp"],
    [c.fotoDeputado(204554, 512), "https://cdn.test/foto/deputado/204554-512.webp"],
    [c.fotoSenador("5012", 512), "https://cdn.test/foto/senador/5012-512.webp"],
    [c.logoPartido("PCdoB"), "https://cdn.test/logo/partido/PCdoB.webp"],
    [c.pdfProposicao(2196833), "https://cdn.test/pdf/proposicao/2196833.pdf"],
    [c.pdfFrente(55703), "https://cdn.test/pdf/frente/55703.pdf"],
    [c.fotoPrefeito("3550308"), "https://cdn.test/foto/prefeito/3550308-160.webp"],
    [c.fotoVicePrefeito(3550308, 512), "https://cdn.test/foto/vice-prefeito/3550308-512.webp"],
    [c.bandeiraUf("sp"), "https://cdn.test/bandeira/uf/SP.svg"],
    [c.bandeiraUf("RJ", 64), "https://cdn.test/bandeira/uf/RJ-64.webp"],
    [c.bandeiraBrasil(), "https://cdn.test/bandeira/pais/BR.svg"],
  ])("%s", (got, want) => expect(got).toBe(want));
});

describe("imagem a partir da URL oficial", () => {
  test("deputado: srcset 160/512 e fallback original", () => {
    const u = "https://www.camara.leg.br/internet/deputado/bandep/204554.jpg";
    expect(c.imagem(u)).toEqual({
      src: "https://cdn.test/foto/deputado/204554-160.webp",
      srcSet: "https://cdn.test/foto/deputado/204554-160.webp 160w, https://cdn.test/foto/deputado/204554-512.webp 512w",
      fallbackSrc: u,
    });
  });
  test.each([
    ["http://www.senado.leg.br/senadores/img/fotos-oficiais/senador70.jpg", "https://cdn.test/foto/senador/70-160.webp"],
    ["https://legis.senado.leg.br/senadores/fotos-oficiais/5012", "https://cdn.test/foto/senador/5012-160.webp"],
    ["https://www.camara.leg.br/internet/Deputado/img/partidos/PT.gif", "https://cdn.test/logo/partido/PT.webp"],
  ])("%s", (u, src) => expect(c.imagem(u)?.src).toBe(src));
  test("logo sem srcset", () => expect(c.imagem("https://www.camara.leg.br/internet/Deputado/img/partidos/PT.gif")?.srcSet).toBeUndefined());
  test.each([[undefined], [null], [""], ["https://example.com/x.jpg"], ["f.jpg"]])("não mapeia %p", (u) => expect(c.imagem(u)).toBeNull());
  test("base vazia desliga o CDN", () => {
    const off = criarCdn("");
    expect(off.imagem("https://www.camara.leg.br/internet/deputado/bandep/1.jpg")).toBeNull();
    expect(off.pdfProposicao(1)).toBeNull();
  });
});

describe("trocarParaOriginal", () => {
  const img = () => {
    const attrs: Record<string, string> = { srcset: "x 160w" };
    return { dataset: {} as Record<string, string>, src: "cdn", removeAttribute: (k: string) => delete attrs[k], attrs };
  };
  test("troca uma vez e depois desiste", () => {
    const i = img();
    expect(trocarParaOriginal(i as unknown as HTMLImageElement, "orig")).toBe(true);
    expect(i.src).toBe("orig");
    expect(i.attrs.srcset).toBeUndefined();
    expect(trocarParaOriginal(i as unknown as HTMLImageElement, "orig")).toBe(false);
  });
  test("sem original não troca", () => expect(trocarParaOriginal(img() as unknown as HTMLImageElement, undefined)).toBe(false));
});

describe("cdnImg", () => {
  test("foto ganha srcset e sizes", () => {
    const u = "https://www.camara.leg.br/internet/deputado/bandep/7.jpg";
    expect(cdnImg(u, 48, c.imagem(u))).toEqual({
      src: "https://cdn.test/foto/deputado/7-160.webp",
      srcSet: "https://cdn.test/foto/deputado/7-160.webp 160w, https://cdn.test/foto/deputado/7-512.webp 512w",
      sizes: "48px",
    });
  });
  test("outra URL passa intacta", () => expect(cdnImg("https://x/y.png", 48, null)).toEqual({ src: "https://x/y.png" }));
});

describe("fotoPrefeitoSet", () => {
  test("srcset 160/512", () => expect(c.fotoPrefeitoSet("3550308")).toEqual({
    src: "https://cdn.test/foto/prefeito/3550308-160.webp",
    srcSet: "https://cdn.test/foto/prefeito/3550308-160.webp 160w, https://cdn.test/foto/prefeito/3550308-512.webp 512w",
  }));
});

describe("emblemas municipais e foto por nome", () => {
  test.each([
    [c.bandeiraMunicipio("3550308"), "https://cdn.test/bandeira/municipio/3550308-64.webp"],
    [c.brasaoMunicipio(3550308, 256), "https://cdn.test/brasao/municipio/3550308-256.webp"],
    [c.creditoMunicipio("3550308"), "https://cdn.test/credito/municipio/3550308.json"],
    [c.fotoPorNome("Tabata Amaral", "sp"), "https://cdn.test/foto/nome/SP/tabata-amaral-160.webp"],
    [c.fotoPorNome("JOSÉ D'ÁVILA Jr.", undefined, 512), "https://cdn.test/foto/nome/XX/jose-d-avila-jr-512.webp"],
  ])("%s", (got, want) => expect(got).toBe(want));
  test("cadeia: bandeira -> brasão -> bandeira da UF", () =>
    expect(c.emblemasMunicipio("3550308", "SP", 64)).toEqual([
      "https://cdn.test/bandeira/municipio/3550308-64.webp",
      "https://cdn.test/brasao/municipio/3550308-64.webp",
      "https://cdn.test/bandeira/uf/SP-64.webp",
    ]));
  test("slugNome igual ao Rust (nomes::slug)", () => expect(slugNome("  Ádail   Filho ")).toBe("adail-filho"));
});

describe("precisaCredito", () => {
  test.each([
    ["Public domain", false], ["PD-BR-exempt", false], ["CC0", false], ["Domínio público", false],
    ["CC BY-SA 4.0", true], ["CC BY 3.0", true], [undefined, true],
  ])("%p -> %p", (l, want) => expect(precisaCredito(l as string | undefined)).toBe(want));
});
