// Funções puras da página /api: agrupamento, formatação e trechos de código.
import type { Esquema, Feed, Metodo, Operacao, Spec } from "./spec";

export const API_ORIGEM = "https://api.emenda.online";
export const MCP_PROTOCOLO = "2025-06-18";

const METODOS: Metodo[] = ["get", "post", "put", "patch", "delete", "head", "options"];

export function slug(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function humanizarTtl(s: number | undefined): string {
  if (!s || s <= 0) return "sem cache";
  const unidades: Array<[number, (n: number) => string]> = [
    [86400, (n) => `${n} ${n === 1 ? "dia" : "dias"}`],
    [3600, (n) => `${n} h`],
    [60, (n) => `${n} min`],
    [1, (n) => `${n} s`],
  ];
  const partes: string[] = [];
  let resto = Math.round(s);
  for (const [tam, fmt] of unidades) {
    const n = Math.floor(resto / tam);
    resto -= n * tam;
    if (n > 0) partes.push(fmt(n));
    else if (partes.length) break; // só unidades adjacentes
    if (partes.length === 2) break;
  }
  return partes.join(" ");
}

export interface OpItem { id: string; metodo: Metodo; path: string; op: Operacao }
export interface Grupo { tag: string; id: string; descricao?: string; ops: OpItem[] }

/** Operações por tag, na ordem de `spec.tags`; tags sem operação somem; sem tag → "Outros". */
export function agruparPorTag(spec: Spec): Grupo[] {
  const ordem = (spec.tags ?? []).map((t) => t.name);
  const desc = new Map((spec.tags ?? []).map((t) => [t.name, t.description]));
  const porTag = new Map<string, OpItem[]>();
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const metodo of METODOS) {
      const op = item[metodo];
      if (!op) continue;
      const tag = op.tags?.[0] ?? "Outros";
      if (!ordem.includes(tag) && tag !== "Outros") ordem.push(tag);
      const lista = porTag.get(tag) ?? [];
      lista.push({ id: `op-${slug(op.operationId ?? `${metodo} ${path}`)}`, metodo, path, op });
      porTag.set(tag, lista);
    }
  }
  return [...ordem, "Outros"]
    .filter((t) => porTag.has(t))
    .map((tag) => ({ tag, id: `tag-${slug(tag)}`, descricao: desc.get(tag), ops: porTag.get(tag)! }));
}

export function tipoParam(s: Esquema | undefined): string {
  if (s?.format === "date") return "data";
  switch (s?.type) {
    case "integer": return "inteiro";
    case "number": return "número";
    case "boolean": return "booleano";
    case "array": return "lista";
    case "object": return "objeto";
    default: return "texto";
  }
}

export function restricoes(s: Esquema | undefined): string[] {
  if (!s) return [];
  const r: string[] = [];
  if (s.minimum !== undefined && s.maximum !== undefined) r.push(`${s.minimum} a ${s.maximum}`);
  else if (s.minimum !== undefined) r.push(`mín. ${s.minimum}`);
  else if (s.maximum !== undefined) r.push(`máx. ${s.maximum}`);
  if (s.maxLength !== undefined) r.push(`até ${s.maxLength} caracteres`);
  if (s.enum?.length) r.push(`um de: ${s.enum.join(", ")}`);
  if (s.pattern) r.push(`formato ${s.pattern}`);
  if (s.format === "date") r.push("AAAA-MM-DD");
  if (s.default !== undefined) r.push(`padrão ${String(s.default)}`);
  return r;
}

export interface ParamTool { nome: string; tipo: string; obrigatorio: boolean; descricao: string; restricoes: string[] }

export function paramsDoTool(schema: Esquema | undefined): ParamTool[] {
  const req = new Set(schema?.required ?? []);
  return Object.entries(schema?.properties ?? {}).map(([nome, s]) => ({
    nome, tipo: tipoParam(s), obrigatorio: req.has(nome), descricao: s.description ?? "", restricoes: restricoes(s),
  }));
}

export function urlExemplo(exemplo: string, origem = API_ORIGEM): string {
  return new URL(exemplo, origem).href;
}

export function snippetCurl(exemplo: string, origem = API_ORIGEM): string {
  return `curl -s '${urlExemplo(exemplo, origem).replaceAll("'", "'\\''")}'`;
}

export function snippetJs(exemplo: string, origem = API_ORIGEM): string {
  return [
    `const res = await fetch("${urlExemplo(exemplo, origem)}", {`,
    `  headers: { accept: "application/json" },`,
    `});`,
    `if (!res.ok) throw new Error(\`HTTP \${res.status}\`);`,
    `const { data, meta } = await res.json();`,
    `console.log(data, meta.fonte);`,
  ].join("\n");
}

export function snippetPython(exemplo: string, origem = API_ORIGEM): string {
  return [
    `import json, urllib.request`,
    ``,
    `req = urllib.request.Request(`,
    `    "${urlExemplo(exemplo, origem)}",`,
    `    headers={"Accept": "application/json", "User-Agent": "meu-projeto"},`,
    `)`,
    `with urllib.request.urlopen(req) as r:`,
    `    corpo = json.load(r)`,
    `print(corpo["data"])`,
  ].join("\n");
}

export interface LinksFeed { rss: string; atom: string; modelo: string | null }

export function feedLinks(f: Feed, origem = API_ORIGEM): LinksFeed {
  const modelo = f.path.includes("{") ? f.path : null;
  const rss = modelo && f.exemplo ? f.exemplo : f.path;
  const atom = modelo ? rss.replace(/\.xml$/, ".atom") : (f.atom ?? f.path.replace(/\.xml$/, ".atom"));
  return { rss: urlExemplo(rss, origem), atom: urlExemplo(atom, origem), modelo };
}

export function mcpCurl(url: string, protocolo = MCP_PROTOCOLO): string {
  const chamada = (comentario: string, corpo: object) =>
    `# ${comentario}\ncurl -s ${url} \\\n  -H 'Content-Type: application/json' \\\n  -H 'Accept: application/json, text/event-stream' \\\n  -d '${JSON.stringify({ jsonrpc: "2.0", ...corpo })}'`;
  return [
    chamada("1. initialize", { id: 1, method: "initialize", params: { protocolVersion: protocolo, capabilities: {}, clientInfo: { name: "curl", version: "1" } } }),
    chamada("2. tools/list", { id: 2, method: "tools/list" }),
    chamada("3. tools/call", { id: 3, method: "tools/call", params: { name: "buscar", arguments: { q: "São Paulo" } } }),
  ].join("\n\n");
}
