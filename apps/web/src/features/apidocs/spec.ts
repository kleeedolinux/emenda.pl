// Contrato de GET /v1/openapi.json (OpenAPI 3.1 + extensões x-*). Só tipos.

export type Metodo = "get" | "post" | "put" | "patch" | "delete" | "head" | "options";

export interface Esquema {
  type?: "integer" | "number" | "string" | "boolean" | "object" | "array";
  format?: string;
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  pattern?: string;
  enum?: Array<string | number | boolean>;
  default?: unknown;
  description?: string;
  properties?: Record<string, Esquema>;
  required?: string[];
  items?: Esquema;
}

export interface Parametro {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  description?: string;
  schema?: Esquema;
  example?: unknown;
}

export interface Operacao {
  operationId?: string;
  tags?: string[];
  summary?: string;
  description?: string;
  parameters?: Parametro[];
  responses?: Record<string, { description?: string; content?: Record<string, unknown> }>;
  "x-exemplo"?: string;
  "x-ttl"?: number;
  "x-fonte"?: string[];
  "x-lista"?: boolean;
  "x-ordem"?: string[];
}

/** Regra de rota de uma ferramenta MCP (`_meta["online.emenda/rota"]`). */
export interface Rota {
  path: string;
  omit?: Record<string, string | number | boolean>;
  map?: Record<string, Record<string, string>>;
  query?: string[];
}

export interface Ferramenta {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Esquema;
  _meta?: { "online.emenda/rota"?: Rota; [k: string]: unknown };
}

export interface Feed {
  path: string;
  atom?: string;
  titulo: string;
  descricao?: string;
  ttl?: number;
  exemplo?: string;
}

export interface Spec {
  openapi?: string;
  info: { title: string; version: string; description?: string };
  servers?: Array<{ url: string; description?: string }>;
  tags?: Array<{ name: string; description?: string }>;
  paths: Record<string, Partial<Record<Metodo, Operacao>>>;
  "x-limites"?: { geral?: string; foraDoCache?: string; query?: number; limitMax?: number; [k: string]: unknown };
  "x-changelog"?: Array<{ versao: string; data: string; itens: string[] }>;
  "x-rss"?: Feed[];
  "x-mcp"?: { url: string; protocolo?: string; tools: Ferramenta[] };
}
