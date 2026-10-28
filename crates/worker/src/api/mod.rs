//! Public open API `/v1`: routing, canonical cache keys, envelope, ETag, limits. Pure.
pub mod map;

use crate::cards::chave_nome;
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
}

/// `api.*` hosts serve only the API (`/` = index); any host serves `/v1*`.
pub fn scope<'a>(host: &str, path: &'a str) -> Scope<'a> {
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
pub struct AutoresQuery {
    /// Normalized: digits (código) or `chave_nome` form.
    pub q: Option<String>,
    pub limit: usize,
    pub offset: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Endpoint {
    Index,
    Meta,
    Brasil,
    Ufs,
    Uf(String),
    Municipio(String),
    Autores(AutoresQuery),
    Autor(String),
    Pix,
    PixAno(u16),
    Feed,
    FeedMes(String),
    Abertas,
    Deputados,
    Deputado(u64),
    Senadores,
    Senador(String),
    Proposicao(u64),
    Votacao(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApiError {
    NotFound,
    BadRequest(&'static str),
}

impl ApiError {
    pub fn status(self) -> u16 {
        match self {
            ApiError::NotFound => 404,
            ApiError::BadRequest(_) => 400,
        }
    }
    pub fn message(self) -> &'static str {
        match self {
            ApiError::NotFound => "não encontrado",
            ApiError::BadRequest(m) => m,
        }
    }
}

fn all(s: &str, max: usize, f: fn(u8) -> bool) -> bool {
    !s.is_empty() && s.len() <= max && s.bytes().all(f)
}
fn digits(b: u8) -> bool {
    b.is_ascii_digit()
}

/// `rest`: path after `/v1`. Unknown query params are ignored.
pub fn parse(rest: &str, query: Option<&str>) -> Result<Endpoint, ApiError> {
    let query = query.unwrap_or("");
    if query.len() > MAX_QUERY {
        return Err(ApiError::BadRequest("query muito longa"));
    }
    let rest = rest.strip_suffix('/').unwrap_or(rest);
    let segs: Vec<&str> = match rest.strip_prefix('/') {
        Some(r) => r.split('/').collect(),
        None if rest.is_empty() => vec![],
        None => return Err(ApiError::NotFound),
    };
    use Endpoint as E;
    let nf = Err(ApiError::NotFound);
    Ok(match segs.as_slice() {
        [] => E::Index,
        ["meta"] => E::Meta,
        ["brasil"] => E::Brasil,
        ["ufs"] => E::Ufs,
        ["ufs", uf] if all(uf, 2, |b| b.is_ascii_alphabetic()) && uf.len() == 2 => {
            E::Uf(uf.to_ascii_uppercase())
        }
        ["municipios", id] if id.len() == 7 && all(id, 7, digits) => E::Municipio(id.to_string()),
        ["autores"] => E::Autores(autores_query(query)?),
        ["autores", c] if all(c, 20, |b| b.is_ascii_alphanumeric()) => E::Autor(c.to_string()),
        ["pix"] => E::Pix,
        ["pix", ano] if ano.len() == 4 && all(ano, 4, digits) => match ano.parse() {
            Ok(a @ 2000..=2100) => E::PixAno(a),
            _ => return nf,
        },
        ["feed"] => E::Feed,
        ["feed", m]
            if m.len() == 6
                && all(m, 6, digits)
                && matches!(
                    &m[4..],
                    "01" | "02"
                        | "03"
                        | "04"
                        | "05"
                        | "06"
                        | "07"
                        | "08"
                        | "09"
                        | "10"
                        | "11"
                        | "12"
                ) =>
        {
            E::FeedMes(m.to_string())
        }
        ["abertas"] => E::Abertas,
        ["deputados"] => E::Deputados,
        ["deputados", id] if all(id, 12, digits) => {
            E::Deputado(id.parse().map_err(|_| ApiError::NotFound)?)
        }
        ["senadores"] => E::Senadores,
        ["senadores", c] if all(c, 8, digits) => E::Senador(c.to_string()),
        ["proposicoes", id] if all(id, 12, digits) => {
            E::Proposicao(id.parse().map_err(|_| ApiError::NotFound)?)
        }
        ["votacoes", id]
            if all(id, 24, |b| b.is_ascii_digit() || b == b'-')
                && id.split('-').count() == 2
                && id.split('-').all(|p| !p.is_empty()) =>
        {
            E::Votacao(id.to_string())
        }
        _ => return nf,
    })
}

fn pct_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let hex = |c: u8| (c as char).to_digit(16).map(|d| d as u8);
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'+' => out.push(b' '),
            b'%' if i + 2 < b.len() => match (hex(b[i + 1]), hex(b[i + 2])) {
                (Some(h), Some(l)) => {
                    out.push(h * 16 + l);
                    i += 2;
                }
                _ => out.push(b'%'),
            },
            c => out.push(c),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn params(query: &str) -> impl Iterator<Item = (&str, String)> {
    query
        .split('&')
        .filter(|p| !p.is_empty())
        .map(|p| match p.split_once('=') {
            Some((k, v)) => (k, pct_decode(v)),
            None => (p, String::new()),
        })
}

fn autores_query(query: &str) -> Result<AutoresQuery, ApiError> {
    let mut a = AutoresQuery {
        q: None,
        limit: DEFAULT_LIMIT,
        offset: 0,
    };
    for (k, v) in params(query) {
        match k {
            "q" => {
                let v = v.trim();
                if v.chars().count() > MAX_Q {
                    return Err(ApiError::BadRequest("q: máximo 64 caracteres"));
                }
                let n = if all(v, 20, digits) {
                    v.to_string()
                } else {
                    chave_nome(v)
                };
                a.q = (!n.is_empty()).then_some(n);
            }
            "limit" => {
                a.limit = v
                    .parse()
                    .ok()
                    .filter(|l| (1..=MAX_LIMIT).contains(l))
                    .ok_or(ApiError::BadRequest("limit: 1..=500"))?
            }
            "offset" => {
                a.offset = v
                    .parse()
                    .ok()
                    .filter(|o| *o <= MAX_OFFSET)
                    .ok_or(ApiError::BadRequest("offset: 0..=10000"))?
            }
            _ => {}
        }
    }
    Ok(a)
}

impl Endpoint {
    /// Canonical path+query: the cache key. Unknown params dropped, known ones sorted.
    pub fn canonical(&self) -> String {
        use Endpoint as E;
        match self {
            E::Index => "/v1".into(),
            E::Meta => "/v1/meta".into(),
            E::Brasil => "/v1/brasil".into(),
            E::Ufs => "/v1/ufs".into(),
            E::Uf(u) => format!("/v1/ufs/{u}"),
            E::Municipio(m) => format!("/v1/municipios/{m}"),
            E::Autores(a) => {
                let mut s = format!("/v1/autores?limit={}&offset={}", a.limit, a.offset);
                if let Some(q) = &a.q {
                    s.push_str("&q=");
                    s.push_str(&q.replace(' ', "%20"));
                }
                s
            }
            E::Autor(c) => format!("/v1/autores/{c}"),
            E::Pix => "/v1/pix".into(),
            E::PixAno(a) => format!("/v1/pix/{a}"),
            E::Feed => "/v1/feed".into(),
            E::FeedMes(m) => format!("/v1/feed/{m}"),
            E::Abertas => "/v1/abertas".into(),
            E::Deputados => "/v1/deputados".into(),
            E::Deputado(id) => format!("/v1/deputados/{id}"),
            E::Senadores => "/v1/senadores".into(),
            E::Senador(c) => format!("/v1/senadores/{c}"),
            E::Proposicao(id) => format!("/v1/proposicoes/{id}"),
            E::Votacao(id) => format!("/v1/votacoes/{id}"),
        }
    }

    /// ETL file served as-is inside the envelope (relative to the data base).
    pub fn data_file(&self) -> Option<String> {
        use Endpoint as E;
        Some(match self {
            E::Meta => "v1/meta.json".into(),
            E::Brasil => "v1/brasil.json".into(),
            E::Uf(u) => format!("v1/uf/{u}.json"),
            E::Municipio(m) => format!("v1/municipio/{m}.json"),
            E::Autor(c) => format!("v1/autor/{c}.json"),
            E::Pix => "v1/pix.json".into(),
            E::PixAno(a) => format!("v1/pix/{a}.json"),
            E::Feed => "v1/feed.json".into(),
            E::FeedMes(m) => format!("v1/feed/{m}.json"),
            E::Abertas => "v1/abertas.json".into(),
            _ => return None,
        })
    }

    /// Edge TTL (seconds).
    pub fn ttl(&self) -> u32 {
        const H: u32 = 3600;
        use Endpoint as E;
        match self {
            E::Index => 24 * H,
            E::Meta | E::Pix | E::PixAno(_) | E::Feed | E::FeedMes(_) | E::Abertas => 6 * H,
            E::Brasil | E::Ufs | E::Uf(_) | E::Municipio(_) | E::Autores(_) | E::Autor(_) => 12 * H,
            E::Deputados | E::Deputado(_) | E::Senadores | E::Senador(_) => 12 * H,
            E::Proposicao(_) | E::Votacao(_) => H,
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
}

fn meta_json(m: &Meta) -> Value {
    json!({ "fonte": m.fonte, "atualizado": m.atualizado, "licenca": LICENCA, "docs": DOCS })
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

const ENDPOINTS: [(&str, &str, &str); 19] = [
    ("/v1", "Índice da API", "/v1"),
    (
        "/v1/meta",
        "Metadados do conjunto de dados (anos, totais, geração)",
        "/v1/meta",
    ),
    (
        "/v1/brasil",
        "Totais nacionais por ano, tipo, função e UF",
        "/v1/brasil",
    ),
    ("/v1/ufs", "Lista de UFs com totais", "/v1/ufs"),
    ("/v1/ufs/{UF}", "Emendas destinadas a uma UF", "/v1/ufs/SP"),
    (
        "/v1/municipios/{ibge}",
        "Emendas recebidas por um município (código IBGE)",
        "/v1/municipios/3550308",
    ),
    (
        "/v1/autores",
        "Autores de emendas (?q=, ?limit=1..500, ?offset=0..10000)",
        "/v1/autores?q=silva&limit=10",
    ),
    (
        "/v1/autores/{codigo}",
        "Emendas de um autor",
        "/v1/autores/8100",
    ),
    (
        "/v1/pix",
        "Emendas Pix (transferências especiais)",
        "/v1/pix",
    ),
    ("/v1/pix/{ano}", "Emendas Pix de um ano", "/v1/pix/2024"),
    ("/v1/feed", "Últimas movimentações", "/v1/feed"),
    (
        "/v1/feed/{YYYYMM}",
        "Movimentações de um mês",
        "/v1/feed/202410",
    ),
    (
        "/v1/abertas",
        "Emendas empenhadas ainda não pagas",
        "/v1/abertas",
    ),
    (
        "/v1/deputados",
        "Deputados em exercício + total de emendas",
        "/v1/deputados",
    ),
    (
        "/v1/deputados/{id}",
        "Deputado (Câmara) + emendas",
        "/v1/deputados/204379",
    ),
    (
        "/v1/senadores",
        "Senadores em exercício + total de emendas",
        "/v1/senadores",
    ),
    (
        "/v1/senadores/{codigo}",
        "Senador (Senado) + emendas",
        "/v1/senadores/5012",
    ),
    (
        "/v1/proposicoes/{id}",
        "Proposição da Câmara normalizada",
        "/v1/proposicoes/2270800",
    ),
    (
        "/v1/votacoes/{id}",
        "Votação da Câmara: placar, por partido, votos",
        "/v1/votacoes/2236186-60",
    ),
];

pub fn index() -> Value {
    let eps: Vec<Value> = ENDPOINTS
        .iter()
        .map(|(p, d, e)| json!({ "path": p, "descricao": d, "exemplo": e }))
        .collect();
    json!({
        "nome": "API aberta emenda.online",
        "versao": "v1",
        "docs": DOCS,
        "limites": {
            "requisicoes": format!("{} req/{}s por IP; {} req/{}s por IP fora do cache", LIMIT_ALL.1, LIMIT_ALL.2, LIMIT_MISS.1, LIMIT_MISS.2),
            "autores": { "limitMax": MAX_LIMIT, "offsetMax": MAX_OFFSET, "qMax": MAX_Q },
        },
        "endpoints": eps,
    })
}
