//! Public open API `/v1`: routing, canonical cache keys, envelope, ETag, limits. Pure.
pub mod busca;
pub mod csv;
pub mod datas;
pub mod emendas;
pub mod legis;
pub mod map;
pub mod normas;
pub mod openapi;
pub mod plan;
pub mod registry;
pub mod render;

use serde_json::{json, Value};
use sha2::{Digest, Sha256};

pub const DOCS: &str = "https://emenda.online/api";
pub const LICENCA: &str = "GPL-3.0 (código) / dados públicos";
pub const PORTAL: &str =
    "https://portaldatransparencia.gov.br/download-de-dados/emendas-parlamentares";
pub const CAMARA: &str = "https://dadosabertos.camara.leg.br/api/v2/";
pub const SENADO: &str = "https://legis.senado.leg.br/dadosabertos/";

pub const MAX_QUERY: usize = 512;
pub const MAX_Q: usize = 64;
pub const MAX_LIMIT: usize = 500;
pub const DEFAULT_LIMIT: usize = 50;
pub const MAX_OFFSET: usize = 10_000;
/// (binding, limit, period seconds). Every API request (hit or miss).
pub const LIMIT_ALL: (&str, u32, u32) = ("API_RL", 300, 60);
/// Cache misses only (they reach upstream).
pub const LIMIT_MISS: (&str, u32, u32) = ("API_RL_MISS", 60, 10);
/// Upstream 404s are cached briefly so missing files do not hammer origin.
pub const NOT_FOUND_TTL: u32 = 300;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Scope<'a> {
    /// Not an API request: the site.
    Site,
    /// API request; path after `/v1` ("" = index).
    Api(&'a str),
    /// `api.*` host, path outside `/v1`.
    ApiUnknown,
    /// MCP endpoint (`/mcp`), any host.
    Mcp,
    /// RSS/Atom feed; path after `/rss/`, any host.
    Rss(&'a str),
}

/// `api.*` hosts serve only the API (`/` = index); any host serves `/v1*`.
pub fn scope<'a>(host: &str, path: &'a str) -> Scope<'a> {
    if path == "/mcp" || path == "/mcp/" {
        return Scope::Mcp;
    }
    if let Some(rest) = path.strip_prefix("/rss/") {
        return Scope::Rss(rest);
    }
    if let Some(rest) = path.strip_prefix("/v1") {
        if rest.is_empty() || rest.starts_with('/') {
            return Scope::Api(if rest == "/" { "" } else { rest });
        }
    }
    if host.starts_with("api.") {
        return if path == "/" || path.is_empty() {
            Scope::Api("")
        } else {
            Scope::ApiUnknown
        };
    }
    Scope::Site
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ApiError {
    NotFound,
    BadRequest(String),
    /// Upstream answered 404.
    UpstreamNotFound,
    /// Upstream failed (status; 0 = unreachable/invalid).
    Upstream(u16),
}

impl ApiError {
    pub fn status(&self) -> u16 {
        match self {
            ApiError::NotFound | ApiError::UpstreamNotFound => 404,
            ApiError::BadRequest(_) => 400,
            ApiError::Upstream(_) => 502,
        }
    }
    pub fn message(&self) -> String {
        match self {
            ApiError::NotFound => "não encontrado".into(),
            ApiError::UpstreamNotFound => "não encontrado na origem".into(),
            ApiError::BadRequest(m) => m.clone(),
            ApiError::Upstream(s) => format!("falha na origem ({s})"),
        }
    }
}

/// Browser max-age 5 min (ETag revalidation is cheap); edge uses the full TTL.
pub fn cache_control(ttl: u32) -> String {
    format!(
        "public, max-age={}, s-maxage={ttl}, stale-while-revalidate=86400, stale-if-error=86400",
        ttl.min(300)
    )
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Meta {
    pub fonte: Vec<String>,
    pub atualizado: String,
    /// `{total, limit, offset, proximo}` on list endpoints.
    pub paginacao: Option<Value>,
}

fn meta_json(m: &Meta) -> Value {
    let mut v =
        json!({ "fonte": m.fonte, "atualizado": m.atualizado, "licenca": LICENCA, "docs": DOCS });
    if let Some(p) = &m.paginacao {
        v["paginacao"] = p.clone();
    }
    v
}

pub fn envelope(data: &Value, m: &Meta) -> Value {
    json!({ "data": data, "meta": meta_json(m) })
}

/// Wraps raw JSON bytes without parsing. `None` when the body does not look like JSON.
pub fn envelope_raw(raw: &[u8], m: &Meta) -> Option<Vec<u8>> {
    let first = raw.iter().find(|b| !b.is_ascii_whitespace())?;
    if !matches!(first, b'{' | b'[') {
        return None;
    }
    let mut out = Vec::with_capacity(raw.len() + 256);
    out.extend_from_slice(b"{\"data\":");
    out.extend_from_slice(raw.trim_ascii());
    out.extend_from_slice(b",\"meta\":");
    out.extend_from_slice(meta_json(m).to_string().as_bytes());
    out.push(b'}');
    Some(out)
}

pub fn error_body(status: u16, msg: &str) -> Value {
    json!({ "error": msg, "status": status, "docs": DOCS })
}

/// Strong ETag: first 128 bits of SHA-256, quoted.
pub fn etag(body: &[u8]) -> String {
    let h = Sha256::digest(body);
    let hex: String = h[..16].iter().map(|b| format!("{b:02x}")).collect();
    format!("\"{hex}\"")
}

/// `If-None-Match` (weak comparison, lists, `*`).
pub fn etag_matches(header: &str, etag: &str) -> bool {
    header.split(',').map(str::trim).any(|t| {
        t == "*" || (!t.is_empty() && t.trim_start_matches("W/") == etag.trim_start_matches("W/"))
    })
}

/// Rate-limit key: client IP from `CF-Connecting-IP`.
pub fn rl_key(ip: Option<&str>) -> String {
    match ip.map(str::trim) {
        Some(ip) if !ip.is_empty() => ip.into(),
        _ => "anon".into(),
    }
}

/// API index, derived from the registry.
pub fn index() -> Value {
    let eps: Vec<Value> = registry::OPS
        .iter()
        .map(|o| json!({ "path": o.path, "descricao": o.summary, "exemplo": o.example, "tag": o.tag }))
        .collect();
    json!({
        "nome": "API aberta emenda.online",
        "versao": "v1",
        "docs": DOCS,
        "openapi": "/v1/openapi.json",
        "mcp": "/mcp",
        "rss": crate::feeds::FEEDS.iter().map(|f| f.path).collect::<Vec<_>>(),
        "limites": {
            "requisicoes": format!("{} req/{}s por IP; {} req/{}s por IP fora do cache", LIMIT_ALL.1, LIMIT_ALL.2, LIMIT_MISS.1, LIMIT_MISS.2),
            "query": MAX_QUERY,
            "offsetMax": MAX_OFFSET,
            "qMax": MAX_Q,
        },
        "endpoints": eps,
    })
}
