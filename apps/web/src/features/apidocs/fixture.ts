import type { Spec } from "./spec";

/** Spec pequena e realista para testes (espelha o contrato de /v1/openapi.json). */
export const FIXTURE: Spec = {
  openapi: "3.1.0",
  info: { title: "API aberta emenda.online", version: "0.10.0", description: "Dados públicos de emendas e do Congresso." },
  servers: [{ url: "https://api.emenda.online" }, { url: "https://emenda.online" }],
  tags: [
    { name: "Sobre", description: "Índice e metadados." },
    { name: "Municípios e UFs", description: "Emendas por destino." },
    { name: "Gastos", description: "Cota parlamentar." },
    { name: "Vazia", description: "Sem operações." },
    { name: "MCP" },
    { name: "RSS" },
  ],
  paths: {
    "/v1/meta": {
      get: { operationId: "meta", tags: ["Sobre"], summary: "Metadados", "x-exemplo": "/v1/meta", "x-ttl": 21600, responses: { "200": { description: "ok" } } },
    },
    "/v1/municipios/{ibge}/emendas": {
      get: {
        operationId: "municipioEmendas",
        tags: ["Municípios e UFs"],
        summary: "Emendas de um município",
        description: "Lista paginada.",
        parameters: [
          { name: "ibge", in: "path", required: true, description: "Código IBGE", schema: { type: "string", pattern: "^\\d{7}$" }, example: "3550308" },
          { name: "ano", in: "query", schema: { type: "integer", minimum: 2014, maximum: 2026 } },
          { name: "tipo", in: "query", schema: { type: "string", enum: ["individual", "pix", "bancada"] } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 500, default: 50 } },
        ],
        responses: { "200": { description: "ok", content: { "application/json": {}, "text/csv": {} } }, "404": { description: "não encontrado" } },
        "x-exemplo": "/v1/municipios/3550308/emendas?ano=2024&limit=5",
        "x-ttl": 43200,
        "x-fonte": ["https://portaldatransparencia.gov.br/download-de-dados/emendas-parlamentares"],
        "x-lista": true,
        "x-ordem": ["ano", "pago"],
      },
    },
    "/v1/ufs": {
      get: { operationId: "ufs", tags: ["Municípios e UFs"], summary: "UFs", "x-exemplo": "/v1/ufs", "x-ttl": 86400 },
    },
    "/v1/gastos/{casa}/{id}": {
      get: { operationId: "gastos", tags: ["Gastos"], summary: "Gastos de um parlamentar", "x-exemplo": "/v1/gastos/deputados/204379?ano=2024", "x-ttl": 3600 },
    },
    "/v1/sem-tag": { get: { summary: "Sem tag", "x-exemplo": "/v1/sem-tag" } },
    "/mcp": { post: { operationId: "mcp", tags: ["MCP"], summary: "Servidor MCP" } },
    "/rss/agenda.xml": { get: { operationId: "rssAgenda", tags: ["RSS"], summary: "Agenda em RSS", "x-exemplo": "/rss/agenda.xml", "x-ttl": 900, responses: { "200": { description: "ok", content: { "application/rss+xml": {} } } } } },
  },
  "x-limites": { geral: "300 req/60s por IP", foraDoCache: "60 req/10s por IP", query: 512, limitMax: 500 },
  "x-changelog": [
    { versao: "0.11.0", data: "2026-10-28", itens: ["MCP remoto", "RSS e Atom"] },
    { versao: "0.10.0", data: "2026-09-01", itens: ["API v1"] },
  ],
  "x-rss": [
    { path: "/rss/agenda.xml", atom: "/rss/agenda.atom", titulo: "Agenda do Congresso", descricao: "Próximos eventos.", ttl: 900 },
    { path: "/rss/deputado/{id}.xml", atom: "/rss/deputado/{id}.atom", titulo: "Deputado", descricao: "Atividade de um deputado.", ttl: 3600, exemplo: "/rss/deputado/204379.xml" },
  ],
  "x-mcp": {
    url: "https://api.emenda.online/mcp",
    protocolo: "2025-06-18",
    tools: [
      {
        name: "buscar",
        title: "Buscar",
        description: "Busca autores, municípios, UFs e parlamentares.",
        inputSchema: { type: "object", properties: { q: { type: "string", description: "Texto" }, limit: { type: "integer", minimum: 1, maximum: 50 } }, required: ["q"] },
        _meta: { "online.emenda/rota": { path: "/v1/busca", query: ["q", "limit"] } },
      },
      {
        name: "gastos_parlamentar",
        title: "Gastos de parlamentar",
        description: "Despesas da cota parlamentar.",
        inputSchema: { type: "object", properties: { casa: { type: "string", enum: ["camara", "senado"] }, id: { type: "integer" }, ano: { type: "integer" } }, required: ["casa", "id"] },
        _meta: { "online.emenda/rota": { path: "/v1/gastos/{casa}/{id}", map: { casa: { camara: "deputados", senado: "senadores" } }, query: ["ano"] } },
      },
      {
        name: "municipio",
        description: "Emendas de um município.",
        inputSchema: { type: "object", properties: { ibge: { type: "string" }, secao: { type: "string", enum: ["resumo", "emendas"] } }, required: ["ibge"] },
        _meta: { "online.emenda/rota": { path: "/v1/municipios/{ibge}/{secao}", omit: { secao: "resumo" }, query: ["ano", "limit"] } },
      },
      { name: "sem_rota", description: "Ignorada no navegador." },
    ],
  },
};
