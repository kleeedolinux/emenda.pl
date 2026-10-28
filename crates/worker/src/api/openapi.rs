//! OpenAPI 3.1 document generated from the registry (`OPS`), MCP tools and RSS feeds. Pure.
use super::registry::{Op, Param, Ty, OPS, TAGS};
use super::{DOCS, LIMIT_ALL, LIMIT_MISS, MAX_OFFSET, MAX_QUERY};
use serde_json::{json, Map, Value};

pub const CHANGELOG: &[(&str, &str, &[&str])] = &[(
    "0.10.x",
    "2026-10-28",
    &[
        "Registro único de endpoints: roteamento, validação, cache e esta especificação vêm da mesma tabela.",
        "Novos: /v1/emendas, municípios (lista e sub-recursos), autores (emendas, favorecidos), rankings, gastos, sub-recursos de deputados e senadores, partidos, federações, frentes, comissões, busca de proposições (tramitação, autores, votações, desfecho), lista de votações, agenda e busca unificada.",
        "Listas: ?limit, ?offset, ?ordem, ?campos e ?formato=csv; meta.paginacao.",
        "Servidor MCP remoto em /mcp e feeds RSS/Atom em /rss/*.",
    ],
)];

fn schema(t: &Ty) -> Value {
    match t {
        Ty::Int { min, max } => json!({ "type": "integer", "minimum": min, "maximum": max }),
        Ty::Str { min, max, .. } => json!({ "type": "string", "minLength": min, "maxLength": max }),
        Ty::Enum(v) => json!({ "type": "string", "enum": v }),
        Ty::Date => json!({ "type": "string", "format": "date" }),
        Ty::Bool => json!({ "type": "boolean" }),
        Ty::Codes { max } => {
            json!({ "type": "string", "description": format!("até {max} siglas separadas por vírgula") })
        }
    }
}

fn param(p: &Param) -> Value {
    let mut v = json!({
        "name": p.name, "in": if p.path { "path" } else { "query" }, "required": p.required,
        "description": p.desc, "schema": schema(&p.ty),
    });
    if !p.example.is_empty() {
        v["example"] = p.example.into();
    }
    v
}

fn common(op: &Op) -> Vec<Value> {
    let mut out = Vec::new();
    if let Some(l) = op.list {
        out.push(json!({ "name": "limit", "in": "query", "required": false, "description": "Itens por página",
            "schema": { "type": "integer", "minimum": 1, "maximum": l.max, "default": l.default } }));
        out.push(json!({ "name": "offset", "in": "query", "required": false,
            "description": if l.upstream { "Deslocamento (múltiplo de limit)" } else { "Deslocamento" },
            "schema": { "type": "integer", "minimum": 0, "maximum": MAX_OFFSET, "default": 0 } }));
        if !l.sort.is_empty() {
            let vals: Vec<String> = l
                .sort
                .iter()
                .flat_map(|s| [s.to_string(), format!("-{s}")])
                .collect();
            out.push(json!({ "name": "ordem", "in": "query", "required": false, "description": "Campo de ordenação; prefixo - = decrescente",
                "schema": { "type": "string", "enum": vals } }));
        }
    }
    if !op.bare {
        out.push(json!({ "name": "campos", "in": "query", "required": false, "description": "Campos a devolver, separados por vírgula (aceita a.b)",
            "schema": { "type": "string", "maxLength": 400 }, "example": "codigo,nome" }));
    }
    if op.csv() {
        out.push(json!({ "name": "formato", "in": "query", "required": false, "description": "json (padrão) ou csv",
            "schema": { "type": "string", "enum": ["json", "csv"], "default": "json" } }));
    }
    out
}

fn err(desc: &str) -> Value {
    json!({ "description": desc, "content": { "application/json": { "schema": { "$ref": "#/components/schemas/Erro" } } } })
}

fn operation(op: &Op) -> Value {
    let mut params: Vec<Value> = op.params.iter().map(param).collect();
    params.extend(common(op));
    let ok_schema = if op.bare {
        json!({ "type": "object" })
    } else {
        json!({ "$ref": "#/components/schemas/Envelope" })
    };
    let mut content = json!({ "application/json": { "schema": ok_schema } });
    if op.csv() {
        content["text/csv"] = json!({ "schema": { "type": "string" } });
    }
    let mut v = json!({
        "operationId": op.id, "tags": [op.tag], "summary": op.summary, "description": op.desc,
        "parameters": params,
        "responses": {
            "200": { "description": "OK", "headers": { "ETag": { "$ref": "#/components/headers/ETag" }, "x-emenda-cache": { "$ref": "#/components/headers/Cache" } }, "content": content },
            "304": { "description": "Não modificado (If-None-Match)" },
            "400": err("Parâmetro inválido"),
            "404": err("Não encontrado"),
            "429": err("Limite de requisições excedido (Retry-After)"),
            "502": err("Falha na origem"),
        },
        "x-exemplo": op.example, "x-ttl": op.ttl, "x-fonte": op.fonte, "x-lista": op.list.is_some(),
    });
    if let Some(l) = op.list {
        v["x-ordem"] = json!(l.sort);
    }
    v
}

pub fn spec() -> Value {
    let mut paths = Map::new();
    for op in OPS {
        paths.insert(op.path.into(), json!({ "get": operation(op) }));
    }
    paths.insert("/mcp".into(), json!({ "post": {
        "operationId": "mcp", "tags": ["MCP"], "summary": "Servidor MCP (Streamable HTTP, JSON-RPC 2.0)",
        "description": "Sem estado e sem autenticação. Métodos: initialize, ping, tools/list, tools/call. GET responde 405 (sem SSE).",
        "requestBody": { "required": true, "content": { "application/json": { "schema": { "type": "object" },
            "example": { "jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": { "name": "buscar", "arguments": { "q": "Recife" } } } } } },
        "responses": { "200": { "description": "Resposta JSON-RPC", "content": { "application/json": { "schema": { "type": "object" } } } },
                       "202": { "description": "Notificação aceita" }, "429": err("Limite de requisições excedido") },
    }}));
    for f in crate::feeds::FEEDS {
        let params: Vec<Value> = f.param.iter().map(|(n, d)| json!({ "name": n, "in": "path", "required": true, "description": d, "schema": { "type": "string" } })).collect();
        paths.insert(f.path.into(), json!({ "get": {
            "operationId": format!("rss_{}", f.id), "tags": ["RSS"], "summary": f.titulo, "description": f.descricao,
            "parameters": params,
            "responses": { "200": { "description": "RSS 2.0 (troque .xml por .atom para Atom 1.0)",
                "content": { "application/rss+xml": { "schema": { "type": "string" } }, "application/atom+xml": { "schema": { "type": "string" } } } } },
            "x-exemplo": f.exemplo, "x-ttl": f.ttl,
        }}));
    }
    let mut tags: Vec<Value> = TAGS
        .iter()
        .map(|(n, d)| json!({ "name": n, "description": d }))
        .collect();
    tags.push(json!({ "name": "MCP", "description": "Model Context Protocol: as mesmas consultas como ferramentas para agentes de IA." }));
    tags.push(json!({ "name": "RSS", "description": "Feeds RSS 2.0 e Atom." }));
    let rss: Vec<Value> = crate::feeds::FEEDS.iter().map(|f| json!({
        "path": f.path, "atom": f.path.replace(".xml", ".atom"), "titulo": f.titulo, "descricao": f.descricao, "ttl": f.ttl, "exemplo": f.exemplo,
    })).collect();
    json!({
        "openapi": "3.1.0",
        "info": {
            "title": "API aberta emenda.online",
            "version": crate::VERSION,
            "description": format!(
                "Dados públicos sobre emendas parlamentares, Câmara e Senado. JSON com envelope {{data, meta}}; erros {{error, status, docs}}.\n\n\
                 Limites: {} req/{}s por IP (cache incluso) e {} req/{}s por IP fora do cache. Cache de borda por endpoint (x-ttl), ETag/304, CORS aberto.\n\n\
                 Cite emenda.online e as fontes originais (meta.fonte). Documentação: {DOCS}",
                LIMIT_ALL.1, LIMIT_ALL.2, LIMIT_MISS.1, LIMIT_MISS.2),
            "license": { "name": "GPL-3.0-only (código); dados públicos", "identifier": "GPL-3.0-only" },
            "contact": { "url": DOCS },
        },
        "servers": [{ "url": "https://api.emenda.online" }, { "url": "https://emenda.online" }],
        "tags": tags,
        "paths": paths,
        "components": {
            "schemas": {
                "Meta": { "type": "object", "required": ["fonte", "atualizado", "licenca", "docs"], "properties": {
                    "fonte": { "type": "array", "items": { "type": "string", "format": "uri" } },
                    "atualizado": { "type": "string", "format": "date-time" },
                    "licenca": { "type": "string" }, "docs": { "type": "string", "format": "uri" },
                    "paginacao": { "$ref": "#/components/schemas/Paginacao" } } },
                "Paginacao": { "type": "object", "properties": {
                    "total": { "type": ["integer", "null"] }, "limit": { "type": "integer" }, "offset": { "type": "integer" },
                    "proximo": { "type": ["string", "null"] } } },
                "Envelope": { "type": "object", "required": ["data", "meta"], "properties": { "data": {}, "meta": { "$ref": "#/components/schemas/Meta" } } },
                "Erro": { "type": "object", "required": ["error", "status", "docs"], "properties": {
                    "error": { "type": "string" }, "status": { "type": "integer" }, "docs": { "type": "string" } } },
            },
            "headers": {
                "ETag": { "schema": { "type": "string" }, "description": "SHA-256 (128 bits) do corpo" },
                "Cache": { "schema": { "type": "string", "enum": ["HIT", "MISS", "BYPASS"] }, "description": "Estado do cache de borda" },
            },
        },
        "x-limites": {
            "geral": format!("{} req/{}s por IP", LIMIT_ALL.1, LIMIT_ALL.2),
            "foraDoCache": format!("{} req/{}s por IP", LIMIT_MISS.1, LIMIT_MISS.2),
            "query": MAX_QUERY,
            "limitMax": OPS.iter().filter_map(|o| o.list.map(|l| l.max)).max().unwrap_or(0),
            "offsetMax": MAX_OFFSET,
        },
        "x-changelog": CHANGELOG.iter().map(|(v, d, i)| json!({ "versao": v, "data": d, "itens": i })).collect::<Vec<_>>(),
        "x-rss": rss,
        "x-mcp": { "url": "https://api.emenda.online/mcp", "protocolo": crate::mcp::PROTOCOL, "tools": crate::mcp::tools() },
    })
}
