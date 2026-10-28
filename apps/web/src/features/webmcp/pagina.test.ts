import { describe, expect, test } from "bun:test";
import { paginaParaRota } from "./pagina";

describe("paginaParaRota", () => {
  test.each<[string, string | null]>([
    ["/", "/v1/brasil"],
    ["/deputado/204379", "/v1/deputados/204379"],
    ["/deputado/204379/", "/v1/deputados/204379"],
    ["/senador/5012", "/v1/senadores/5012"],
    ["/municipio/3550308", "/v1/municipios/3550308"],
    ["/uf/sp", "/v1/ufs/SP"],
    ["/autor/8100", "/v1/autores/8100"],
    ["/proposicao/2270800", "/v1/proposicoes/2270800"],
    ["/votacao/2236186-60", "/v1/votacoes/2236186-60"],
    ["/partido/PT", "/v1/partidos/PT"],
    ["/partido/PC%20do%20B", "/v1/partidos/PC%20do%20B"],
    ["/agenda", "/v1/agenda"],
    ["/pix", "/v1/pix"],
    ["/ultimas", "/v1/feed"],
    ["/sobre", null],
    ["/deputado", null],
    ["/deputado/1/extra", null],
    ["/api", null],
  ])("%s", (p, esperado) => expect(paginaParaRota(p)).toBe(esperado));
});
