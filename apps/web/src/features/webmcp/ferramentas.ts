import type { Esquema, Spec } from "@/features/apidocs/spec";
import { paginaParaRota } from "./pagina";
import { rotaUrl } from "./rota";

/** Formato de ferramenta do rascunho WebMCP (W3C Web Machine Learning CG). */
export interface Resultado { content: Array<{ type: "text"; text: string }>; isError?: true }
export interface WebTool {
  name: string;
  title?: string;
  description: string;
  inputSchema: Esquema;
  annotations?: { readOnlyHint?: boolean };
  execute: (input: unknown, client?: unknown) => Promise<Resultado>;
}
export interface ModelContext {
  registerTool?: (tool: WebTool) => { unregister?: () => void } | void;
  provideContext?: (ctx: { tools: WebTool[] }) => void;
}
export interface Pagina { pathname: string; title: string; href: string }

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export const LIMITE_TEXTO = 100_000;

const texto = (text: string, isError = false): Resultado =>
  isError ? { content: [{ type: "text", text }], isError: true } : { content: [{ type: "text", text }] };

function truncar(s: string): string {
  if (s.length <= LIMITE_TEXTO) return s;
  return `${s.slice(0, LIMITE_TEXTO)}\n… [resposta truncada: ${s.length} caracteres no total; use limit/offset/campos para reduzir]`;
}

async function buscar(f: Fetcher, url: string): Promise<Resultado> {
  try {
    const res = await f(url, { headers: { accept: "application/json" } });
    const corpo = truncar(await res.text());
    return res.ok ? texto(corpo) : texto(corpo || `HTTP ${res.status}`, true);
  } catch (e) {
    return texto(`Falha ao consultar ${url}: ${e instanceof Error ? e.message : String(e)}`, true);
  }
}

const args = (input: unknown): Record<string, unknown> =>
  input && typeof input === "object" ? (input as Record<string, unknown>) : {};

/** Ferramentas de `x-mcp.tools` que têm rota; execute = GET same-origin. */
export function construirFerramentas(spec: Spec, f: Fetcher): WebTool[] {
  const out: WebTool[] = [];
  for (const t of spec["x-mcp"]?.tools ?? []) {
    const rota = t._meta?.["online.emenda/rota"];
    if (!rota) continue;
    out.push({
      name: t.name,
      ...(t.title ? { title: t.title } : {}),
      description: t.description ?? t.title ?? t.name,
      inputSchema: t.inputSchema ?? { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      execute: (input) => buscar(f, rotaUrl(rota, args(input))),
    });
  }
  return out;
}

/** Ferramenta contextual: dados da entidade mostrada na página atual. */
export function dadosDestaPagina(f: Fetcher, pagina: () => Pagina): WebTool {
  return {
    name: "dados_desta_pagina",
    title: "Dados desta página",
    description: "Devolve, em JSON da API /v1, os dados da entidade mostrada na página aberta do emenda.online (deputado, senador, município, UF, autor, proposição, votação, partido, agenda, Pix, últimas ou Brasil).",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    execute: async () => {
      const p = pagina();
      const rota = paginaParaRota(p.pathname);
      if (!rota) return texto(`Esta página não mostra uma entidade com dados na API. Página: "${p.title}" (${p.href}). Use as outras ferramentas (ex.: buscar).`);
      return buscar(f, rota);
    },
  };
}

/** Registra as ferramentas; devolve quantas entraram. Nunca lança. */
export function registrar(mc: ModelContext, tools: WebTool[]): number {
  if (typeof mc.registerTool === "function") {
    let n = 0;
    for (const t of tools) {
      try { mc.registerTool(t); n++; } catch { /* nome duplicado etc. */ }
    }
    return n;
  }
  if (typeof mc.provideContext === "function") {
    try { mc.provideContext({ tools }); return tools.length; } catch { return 0; }
  }
  return 0;
}
