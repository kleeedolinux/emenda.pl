import { describe, expect, test } from "bun:test";
import type { Rota } from "@/features/apidocs/spec";
import { rotaUrl } from "./rota";

const gastos: Rota = { path: "/v1/gastos/{casa}/{id}", map: { casa: { camara: "deputados", senado: "senadores" } }, query: ["ano", "mes"] };
const comissao: Rota = { path: "/v1/comissoes/{id}/membros", query: ["casa"] };
const deputado: Rota = { path: "/v1/deputados/{id}/{secao}", omit: { secao: "perfil" } };
const municipio: Rota = { path: "/v1/municipios/{ibge}/{secao}", omit: { secao: "resumo" }, query: ["ano", "tipo", "limit", "offset"] };
const buscar: Rota = { path: "/v1/busca", query: ["q", "limit"] };

describe("rotaUrl", () => {
  test.each<[string, Rota, Record<string, unknown>, string]>([
    ["map substitui valor", gastos, { casa: "camara", id: 204379 }, "/v1/gastos/deputados/204379"],
    ["map sem chave usa o valor", gastos, { casa: "outra", id: 1 }, "/v1/gastos/outra/1"],
    ["query na ordem listada", gastos, { casa: "senado", id: 5012, mes: 3, ano: 2024 }, "/v1/gastos/senadores/5012?ano=2024&mes=3"],
    ["sem id corta o resto", comissao, {}, "/v1/comissoes"],
    ["sem id mantém query", comissao, { casa: "senado" }, "/v1/comissoes?casa=senado"],
    ["com id", comissao, { id: 2003 }, "/v1/comissoes/2003/membros"],
    ["omit corta", deputado, { id: 1, secao: "perfil" }, "/v1/deputados/1"],
    ["secao vazia corta", deputado, { id: 1, secao: "" }, "/v1/deputados/1"],
    ["secao presente", deputado, { id: 1, secao: "votos" }, "/v1/deputados/1/votos"],
    ["corte no primeiro ausente", deputado, { secao: "votos" }, "/v1/deputados"],
    ["omit + query", municipio, { ibge: "3550308", secao: "resumo", ano: 2024, limit: 5 }, "/v1/municipios/3550308?ano=2024&limit=5"],
    ["query vazia/nula ignorada", municipio, { ibge: 3550308, secao: "emendas", ano: "", tipo: null, offset: 0 }, "/v1/municipios/3550308/emendas?offset=0"],
    ["codifica segmento", deputado, { id: "a/b c" }, "/v1/deputados/a%2Fb%20c"],
    ["codifica query", buscar, { q: "São Paulo & cia" }, "/v1/busca?q=S%C3%A3o%20Paulo%20%26%20cia"],
    ["booleano", buscar, { q: true }, "/v1/busca?q=true"],
    ["ignora args fora da regra", buscar, { x: 1 }, "/v1/busca"],
  ])("%s", (_n, rota, args, esperado) => expect(rotaUrl(rota, args)).toBe(esperado));
});
