import { describe, expect, test } from "bun:test";
import { FIXTURE } from "@/features/apidocs/fixture";
import { construirFerramentas, dadosDestaPagina, LIMITE_TEXTO, registrar, type ModelContext, type WebTool } from "./ferramentas";

type Chamada = { url: string; accept: string | null };

function fakeFetch(resp: (url: string) => { status: number; body: string }) {
  const chamadas: Chamada[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    chamadas.push({ url, accept: new Headers(init?.headers).get("accept") });
    const r = resp(url);
    return new Response(r.body, { status: r.status });
  }) as typeof fetch;
  return { f, chamadas };
}

const textoDe = (r: { content: Array<{ text: string }> }) => r.content.map((c) => c.text).join("");

describe("construirFerramentas", () => {
  test("uma ferramenta por tool com rota, somente leitura", () => {
    const { f } = fakeFetch(() => ({ status: 200, body: "{}" }));
    const tools = construirFerramentas(FIXTURE, f);
    expect(tools.map((t) => t.name)).toEqual(["buscar", "gastos_parlamentar", "municipio"]);
    for (const t of tools) {
      expect(t.annotations?.readOnlyHint).toBe(true);
      expect(t.inputSchema.type).toBe("object");
      expect(t.description.length).toBeGreaterThan(0);
    }
  });

  test("execute busca a rota same-origin e devolve o JSON", async () => {
    const { f, chamadas } = fakeFetch(() => ({ status: 200, body: '{"data":[1],"meta":{}}' }));
    const t = construirFerramentas(FIXTURE, f).find((x) => x.name === "gastos_parlamentar")!;
    const r = await t.execute({ casa: "camara", id: 204379, ano: 2024 });
    expect(chamadas).toEqual([{ url: "/v1/gastos/deputados/204379?ano=2024", accept: "application/json" }]);
    expect(r.isError).toBeUndefined();
    expect(textoDe(r)).toBe('{"data":[1],"meta":{}}');
  });

  test("não-2xx vira isError com o corpo", async () => {
    const { f } = fakeFetch(() => ({ status: 404, body: '{"error":"não encontrado","status":404}' }));
    const t = construirFerramentas(FIXTURE, f)[0]!;
    const r = await t.execute({ q: "x" });
    expect(r.isError).toBe(true);
    expect(textoDe(r)).toContain("não encontrado");
  });

  test("falha de rede vira isError", async () => {
    const f = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    const r = await construirFerramentas(FIXTURE, f)[0]!.execute({ q: "x" });
    expect(r.isError).toBe(true);
    expect(textoDe(r)).toContain("offline");
  });

  test("trunca texto grande e avisa", async () => {
    const grande = "x".repeat(LIMITE_TEXTO + 50);
    const { f } = fakeFetch(() => ({ status: 200, body: grande }));
    const r = await construirFerramentas(FIXTURE, f)[0]!.execute(undefined);
    const txt = textoDe(r);
    expect(txt.startsWith("x".repeat(LIMITE_TEXTO))).toBe(true);
    expect(txt).toContain("truncad");
    expect(txt.length).toBeLessThan(LIMITE_TEXTO + 300);
  });

  test("spec sem x-mcp → nenhuma ferramenta", () => {
    const { f } = fakeFetch(() => ({ status: 200, body: "" }));
    expect(construirFerramentas({ info: { title: "", version: "" }, paths: {} }, f)).toEqual([]);
  });
});

describe("dadosDestaPagina", () => {
  test("página com entidade busca o recurso", async () => {
    const { f, chamadas } = fakeFetch(() => ({ status: 200, body: '{"data":{"id":1}}' }));
    const t = dadosDestaPagina(f, () => ({ pathname: "/deputado/1", title: "Dep", href: "https://emenda.online/deputado/1" }));
    expect(t.name).toBe("dados_desta_pagina");
    const r = await t.execute({});
    expect(chamadas[0]!.url).toBe("/v1/deputados/1");
    expect(textoDe(r)).toContain('"id":1');
  });

  test("página sem entidade explica, sem rede", async () => {
    const { f, chamadas } = fakeFetch(() => ({ status: 200, body: "" }));
    const t = dadosDestaPagina(f, () => ({ pathname: "/sobre", title: "Sobre — emenda.online", href: "https://emenda.online/sobre" }));
    const r = await t.execute({});
    expect(chamadas).toEqual([]);
    expect(textoDe(r)).toContain("Sobre — emenda.online");
    expect(textoDe(r)).toContain("https://emenda.online/sobre");
  });
});

describe("registrar", () => {
  const tools = [{ name: "a" }, { name: "b" }] as unknown as WebTool[];

  test("prefere registerTool", () => {
    const nomes: string[] = [];
    const mc: ModelContext = { registerTool: (t) => { nomes.push(t.name); return { unregister() {} }; }, provideContext: () => { throw new Error("não"); } };
    expect(registrar(mc, tools)).toBe(2);
    expect(nomes).toEqual(["a", "b"]);
  });

  test("usa provideContext quando não há registerTool", () => {
    let recebido: unknown;
    expect(registrar({ provideContext: (c) => { recebido = c; } }, tools)).toBe(2);
    expect(recebido).toEqual({ tools });
  });

  test("erro de uma ferramenta não impede as outras", () => {
    const mc: ModelContext = { registerTool: (t) => { if (t.name === "a") throw new Error("dup"); } };
    expect(registrar(mc, tools)).toBe(1);
  });

  test("sem API → 0", () => expect(registrar({}, tools)).toBe(0));
});
