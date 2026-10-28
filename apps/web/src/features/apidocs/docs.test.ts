import { describe, expect, test } from "bun:test";
import { FIXTURE } from "./fixture";
import {
  agruparPorTag, feedLinks, humanizarTtl, mcpCurl, paramsDoTool, restricoes, slug, snippetCurl, snippetJs, snippetPython, tipoParam, urlExemplo,
} from "./docs";

describe("humanizarTtl", () => {
  test.each<[number | undefined, string]>([
    [undefined, "sem cache"],
    [0, "sem cache"],
    [45, "45 s"],
    [60, "1 min"],
    [90, "1 min 30 s"],
    [900, "15 min"],
    [3600, "1 h"],
    [5400, "1 h 30 min"],
    [43200, "12 h"],
    [86400, "1 dia"],
    [90000, "1 dia 1 h"],
    [172800, "2 dias"],
  ])("%p → %s", (s, e) => expect(humanizarTtl(s)).toBe(e));
});

describe("slug", () => {
  test.each([
    ["Municípios e UFs", "municipios-e-ufs"],
    ["Pix e pagamentos", "pix-e-pagamentos"],
    ["  MCP ", "mcp"],
    ["get /v1/municipios/{ibge}", "get-v1-municipios-ibge"],
  ])("%s", (s, e) => expect(slug(s)).toBe(e));
});

describe("agruparPorTag", () => {
  test("segue a ordem das tags, omite vazias, junta sem tag em Outros", () => {
    const g = agruparPorTag(FIXTURE);
    expect(g.map((x) => x.tag)).toEqual(["Sobre", "Municípios e UFs", "Gastos", "MCP", "RSS", "Outros"]);
    expect(g[1]!.ops.map((o) => o.path)).toEqual(["/v1/municipios/{ibge}/emendas", "/v1/ufs"]);
    expect(g[1]!.descricao).toBe("Emendas por destino.");
    expect(g[1]!.id).toBe("tag-municipios-e-ufs");
    expect(g[3]!.ops[0]!.metodo).toBe("post");
    expect(g[0]!.ops[0]!.id).toBe("op-meta");
    expect(g[5]!.ops[0]!.id).toBe("op-get-v1-sem-tag");
  });

  test("tag usada mas não declarada vai ao fim, antes de Outros", () => {
    const g = agruparPorTag({ info: { title: "", version: "" }, tags: [{ name: "A" }], paths: { "/x": { get: { tags: ["B"] } }, "/y": { get: { tags: ["A"] } }, "/z": { get: {} } } });
    expect(g.map((x) => x.tag)).toEqual(["A", "B", "Outros"]);
  });
});

describe("tipoParam e restricoes", () => {
  test.each<[object | undefined, string]>([
    [{ type: "integer" }, "inteiro"],
    [{ type: "string" }, "texto"],
    [{ type: "string", format: "date" }, "data"],
    [{ type: "boolean" }, "booleano"],
    [{ type: "number" }, "número"],
    [undefined, "texto"],
  ])("tipo %p", (s, e) => expect(tipoParam(s)).toBe(e));

  test.each<[object | undefined, string[]]>([
    [undefined, []],
    [{ type: "integer", minimum: 1, maximum: 500, default: 50 }, ["1 a 500", "padrão 50"]],
    [{ type: "integer", minimum: 0 }, ["mín. 0"]],
    [{ type: "integer", maximum: 9 }, ["máx. 9"]],
    [{ type: "string", maxLength: 64 }, ["até 64 caracteres"]],
    [{ type: "string", enum: ["a", "b"] }, ["um de: a, b"]],
    [{ type: "string", pattern: "^\\d{7}$" }, ["formato ^\\d{7}$"]],
    [{ type: "string", format: "date" }, ["AAAA-MM-DD"]],
    [{ type: "boolean", default: false }, ["padrão false"]],
  ])("restricoes %p", (s, e) => expect(restricoes(s)).toEqual(e));
});

describe("snippets", () => {
  const ex = "/v1/municipios/3550308/emendas?ano=2024&limit=5";
  const url = "https://api.emenda.online/v1/municipios/3550308/emendas?ano=2024&limit=5";

  test("urlExemplo codifica e usa a origem", () => {
    expect(urlExemplo(ex)).toBe(url);
    expect(urlExemplo("/v1/busca?q=São Paulo", "https://emenda.online")).toBe("https://emenda.online/v1/busca?q=S%C3%A3o%20Paulo");
  });

  test("curl", () => {
    expect(snippetCurl(ex)).toBe(`curl -s '${url}'`);
    expect(snippetCurl("/v1/x/it's")).toBe(`curl -s 'https://api.emenda.online/v1/x/it'\\''s'`);
  });

  test("javascript", () => {
    const js = snippetJs(ex);
    expect(js).toContain(`fetch("${url}"`);
    expect(js).toContain(`accept: "application/json"`);
    expect(js).toContain("const { data, meta } = await res.json();");
  });

  test("python sem dependências", () => {
    const py = snippetPython(ex);
    expect(py).toContain("import json, urllib.request");
    expect(py).toContain(`"${url}"`);
    expect(py).toContain(`corpo["data"]`);
  });
});

describe("paramsDoTool", () => {
  test("lista propriedades com obrigatoriedade", () => {
    const t = FIXTURE["x-mcp"]!.tools[1]!;
    expect(paramsDoTool(t.inputSchema)).toEqual([
      { nome: "casa", tipo: "texto", obrigatorio: true, descricao: "", restricoes: ["um de: camara, senado"] },
      { nome: "id", tipo: "inteiro", obrigatorio: true, descricao: "", restricoes: [] },
      { nome: "ano", tipo: "inteiro", obrigatorio: false, descricao: "", restricoes: [] },
    ]);
    expect(paramsDoTool(undefined)).toEqual([]);
  });
});

describe("feedLinks", () => {
  test("feed fixo", () => {
    expect(feedLinks(FIXTURE["x-rss"]![0]!, "https://api.emenda.online")).toEqual({
      rss: "https://api.emenda.online/rss/agenda.xml", atom: "https://api.emenda.online/rss/agenda.atom", modelo: null,
    });
  });
  test("feed modelo usa o exemplo", () => {
    expect(feedLinks(FIXTURE["x-rss"]![1]!, "https://api.emenda.online")).toEqual({
      rss: "https://api.emenda.online/rss/deputado/204379.xml", atom: "https://api.emenda.online/rss/deputado/204379.atom", modelo: "/rss/deputado/{id}.xml",
    });
  });
  test("sem atom declarado deriva de .xml", () => {
    expect(feedLinks({ path: "/rss/pix.xml", titulo: "Pix" }, "https://x.y").atom).toBe("https://x.y/rss/pix.atom");
  });
});

describe("mcpCurl", () => {
  test("três chamadas JSON-RPC com os cabeçalhos certos", () => {
    const s = mcpCurl("https://api.emenda.online/mcp");
    expect(s.match(/curl -s/g)?.length).toBe(3);
    expect(s).toContain("Content-Type: application/json");
    expect(s).toContain("Accept: application/json, text/event-stream");
    expect(s).toContain('"method":"initialize"');
    expect(s).toContain('"method":"tools/list"');
    expect(s).toContain('"method":"tools/call","params":{"name":"buscar","arguments":{"q":"São Paulo"}}');
    expect(s).toContain('"protocolVersion":"2025-06-18"');
  });
});
