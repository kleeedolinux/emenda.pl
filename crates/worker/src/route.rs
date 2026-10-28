//! Request classification, upstream URL mapping and cache policy. Pure.
use crate::cards::Kind;

pub const MAX_QUERY: usize = 512;
pub const DEFAULT_DATA_BASE: &str = "https://cdn.jsdelivr.net/gh/kleeedolinux/emenda-pl-data@main/";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Upstream {
    Camara,
    Senado,
    Ibge,
    Data,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Target {
    pub kind: Kind,
    /// Normalized id; empty for `Kind::Default`.
    pub id: String,
}

impl Target {
    pub fn default_page() -> Self {
        Target {
            kind: Kind::Default,
            id: String::new(),
        }
    }
    /// Path of the OG image, e.g. `/og/deputado/1.png`.
    pub fn og_path(&self) -> String {
        match self.kind {
            Kind::Default => "/og/default.png".into(),
            k => format!("/og/{}/{}.png", k.slug(), self.id),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Route {
    Options,
    MethodNotAllowed,
    BadRequest,
    NotFound,
    Health,
    /// POST /api/hit: analytics beacon.
    Hit,
    /// GET /api/stats: aggregated analytics.
    Stats,
    Proxy {
        upstream: Upstream,
        rest: String,
        query: Option<String>,
    },
    Og(Target),
    Page(Target),
    Asset,
}

pub fn route(method: &str, path: &str, query: Option<&str>) -> Route {
    match (method, path) {
        ("OPTIONS", _) => return Route::Options,
        ("POST", "/api/hit") => return Route::Hit,
        (_, "/api/hit") => return Route::MethodNotAllowed,
        ("GET" | "HEAD", "/api/stats") => return Route::Stats,
        _ => {}
    }
    match method {
        "GET" | "HEAD" => {}
        _ => return Route::MethodNotAllowed,
    }
    let query = query.filter(|q| !q.is_empty());
    if path == "/api/health" {
        return Route::Health;
    }
    let prefixes = [
        ("/api/camara/", Upstream::Camara),
        ("/api/senado/", Upstream::Senado),
        ("/api/ibge/", Upstream::Ibge),
        ("/data/", Upstream::Data),
    ];
    for (prefix, upstream) in prefixes {
        if let Some(rest) = path.strip_prefix(prefix) {
            if !safe_rest(rest) || query.is_some_and(|q| q.len() > MAX_QUERY) {
                return Route::BadRequest;
            }
            return Route::Proxy {
                upstream,
                rest: rest.into(),
                query: query.map(Into::into),
            };
        }
    }
    if path.starts_with("/api/") || path == "/api" || path == "/data" {
        return Route::NotFound;
    }
    if let Some(rest) = path.strip_prefix("/og/") {
        if rest == "default.png" {
            return Route::Og(Target::default_page());
        }
        return rest
            .strip_suffix(".png")
            .and_then(|r| r.split_once('/'))
            .and_then(|(slug, id)| target(slug, id))
            .map_or(Route::NotFound, Route::Og);
    }
    let last = path.rsplit('/').next().unwrap_or("");
    if path.starts_with("/assets/") || last.contains('.') {
        return Route::Asset;
    }
    let mut segs = path.trim_matches('/').splitn(2, '/');
    let page = match (segs.next(), segs.next()) {
        (Some(slug), Some(id)) => target(slug, id),
        _ => None,
    };
    Route::Page(page.unwrap_or_else(Target::default_page))
}

fn safe_rest(rest: &str) -> bool {
    !rest.is_empty()
        && rest.split('/').all(|s| {
            !s.is_empty()
                && s != "."
                && s != ".."
                && s.bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"-_.,".contains(&b))
        })
}

fn target(slug: &str, id: &str) -> Option<Target> {
    let kind = Kind::from_slug(slug)?;
    let all =
        |f: fn(u8) -> bool, max: usize| !id.is_empty() && id.len() <= max && id.bytes().all(f);
    let digits = |b: u8| b.is_ascii_digit();
    let ok = match kind {
        Kind::Default => false,
        Kind::Deputado | Kind::Senador | Kind::Proposicao => all(digits, 12),
        Kind::Autor => all(|b| b.is_ascii_alphanumeric(), 20),
        Kind::Municipio => id.len() == 7 && all(digits, 7),
        Kind::Uf => id.len() == 2 && all(|b| b.is_ascii_alphabetic(), 2),
        Kind::Votacao => all(|b| b.is_ascii_digit() || b == b'-', 24),
        Kind::Partido => all(|b| b.is_ascii_alphanumeric(), 20),
    };
    let id = match kind {
        Kind::Uf | Kind::Partido => id.to_ascii_uppercase(),
        _ => id.to_string(),
    };
    ok.then_some(Target { kind, id })
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DataSource {
    Remote(String),
    Assets,
}

/// Empty `DATA_BASE_URL` -> serve `/data/*` from static assets.
pub fn data_source(base: &str) -> DataSource {
    match base.trim() {
        "" => DataSource::Assets,
        b => DataSource::Remote(b.into()),
    }
}

pub fn upstream_url(up: Upstream, rest: &str, query: Option<&str>, data_base: &str) -> String {
    let base = match up {
        Upstream::Camara => "https://dadosabertos.camara.leg.br/api/v2/".to_string(),
        Upstream::Senado => "https://legis.senado.leg.br/dadosabertos/".into(),
        Upstream::Ibge => "https://servicodados.ibge.gov.br/api/".into(),
        Upstream::Data => format!("{}/", data_base.trim().trim_end_matches('/')),
    };
    match query {
        Some(q) if !q.is_empty() => format!("{base}{rest}?{q}"),
        _ => format!("{base}{rest}"),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CacheClass {
    Ibge,
    Data,
    CamaraRef,
    CamaraDetail,
    CamaraList,
    Senado,
    Og,
    Html,
    Stats,
    Asset,
}

pub fn cache_class(r: &Route) -> Option<CacheClass> {
    Some(match r {
        Route::Proxy { upstream, rest, .. } => match upstream {
            Upstream::Ibge => CacheClass::Ibge,
            Upstream::Data => CacheClass::Data,
            Upstream::Senado => CacheClass::Senado,
            Upstream::Camara => camara_class(rest),
        },
        Route::Og(_) => CacheClass::Og,
        Route::Page(_) => CacheClass::Html,
        Route::Stats => CacheClass::Stats,
        Route::Asset => CacheClass::Asset,
        _ => return None,
    })
}

fn camara_class(rest: &str) -> CacheClass {
    let mut s = rest.split('/');
    match (s.next(), s.next(), s.next()) {
        (Some("deputados" | "partidos"), _, _) => CacheClass::CamaraRef,
        (Some("proposicoes" | "votacoes"), Some(id), None) if !id.is_empty() => {
            CacheClass::CamaraDetail
        }
        _ => CacheClass::CamaraList,
    }
}

pub fn ttl_secs(c: CacheClass) -> u32 {
    const H: u32 = 3600;
    match c {
        CacheClass::Ibge => 30 * 24 * H,
        CacheClass::Data | CacheClass::Senado => 6 * H,
        CacheClass::CamaraRef => 12 * H,
        CacheClass::CamaraDetail => H,
        CacheClass::CamaraList => 600,
        CacheClass::Html => 300,
        CacheClass::Stats => 30,
        CacheClass::Og => 24 * H,
        CacheClass::Asset => 365 * 24 * H,
    }
}

/// Browser max-age is capped at 1h (HTML: 5 min); edge uses the full TTL.
pub fn cache_control(c: CacheClass) -> String {
    let ttl = ttl_secs(c);
    if c == CacheClass::Asset {
        return format!("public, max-age={ttl}, immutable");
    }
    format!(
        "public, max-age={}, s-maxage={ttl}, stale-while-revalidate=86400",
        ttl.min(3600)
    )
}

/// Normalized cache key: no fragment, query pairs sorted, empty query dropped.
pub fn cache_key(url: &str) -> String {
    let url = url.split('#').next().unwrap_or(url);
    match url.split_once('?') {
        Some((base, q)) => {
            let mut pairs: Vec<&str> = q.split('&').filter(|p| !p.is_empty()).collect();
            pairs.sort_unstable();
            if pairs.is_empty() {
                base.into()
            } else {
                format!("{base}?{}", pairs.join("&"))
            }
        }
        None => url.into(),
    }
}

/// Headers on every worker response.
pub const SECURITY_HEADERS: [(&str, &str); 5] = [
    (
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; \
font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://www.camara.leg.br https://*.camara.leg.br \
https://www.senado.leg.br https://*.senado.leg.br https://legis.senado.leg.br; connect-src 'self'; \
frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
    ),
    ("X-Content-Type-Options", "nosniff"),
    ("Referrer-Policy", "strict-origin-when-cross-origin"),
    ("X-Frame-Options", "DENY"),
    ("Permissions-Policy", "camera=(), microphone=(), geolocation=()"),
];

/// Absolute https origin for meta tags; plain http kept only for local dev hosts.
pub fn public_origin(scheme: &str, host: &str) -> String {
    let local =
        host.starts_with("localhost") || host.starts_with("127.") || host.starts_with("[::1]");
    format!("{}://{host}", if local { scheme } else { "https" })
}

/// Response content type. `.json` data is forced to JSON (raw.githubusercontent sends text/plain).
pub fn content_type(up: Upstream, rest: &str, upstream: Option<&str>) -> String {
    const JSON: &str = "application/json; charset=utf-8";
    if up == Upstream::Data && rest.ends_with(".json") {
        return JSON.into();
    }
    upstream.filter(|c| !c.is_empty()).unwrap_or(JSON).into()
}
