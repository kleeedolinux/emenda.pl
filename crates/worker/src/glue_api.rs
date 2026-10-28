//! wasm32 glue for the public API (`/v1`), shared by MCP and feeds: edge cache, rate
//! limiting and the fetch loop around the pure `api::plan` state machine.
use crate::api::plan::{self, Ctx, Fetch, Now, Step};
use crate::api::registry::{self, Req};
use crate::api::render::{self, JSON};
use crate::api::{self, datas, ApiError, Scope};
use crate::glue::{data_fetch, from_assets, get};
use futures_util::future::join_all;
use worker::*;

/// A produced or cached API answer.
pub struct Served {
    pub status: u16,
    pub ctype: String,
    pub bytes: Vec<u8>,
    pub etag: String,
    pub cc: String,
    pub state: &'static str,
}

impl Served {
    pub fn error(status: u16, msg: &str) -> Self {
        Served {
            status,
            ctype: JSON.into(),
            bytes: api::error_body(status, msg).to_string().into_bytes(),
            etag: String::new(),
            cc: "no-store".into(),
            state: "BYPASS",
        }
    }
}

pub async fn handle(
    req: &Request,
    env: &Env,
    url: &Url,
    host: &str,
    sc: Scope<'_>,
) -> Result<Response> {
    match sc {
        Scope::Mcp => return crate::glue_mcp::handle(req, env, url, host).await,
        Scope::Rss(rest) => return crate::glue_feeds::handle(req, env, url, host, rest).await,
        _ => {}
    }
    let method = req.method();
    if method == Method::Options {
        return cors(Response::empty()?.with_status(204));
    }
    let head = method == Method::Head;
    if !(method == Method::Get || head) {
        let mut r = finish(Served::error(405, "método não permitido"), None, head)?;
        r.headers_mut().set("Allow", "GET, HEAD, OPTIONS")?;
        return Ok(r);
    }
    let parsed = match sc {
        Scope::Api(rest) => registry::resolve(rest, url.query()),
        _ => Err(ApiError::NotFound),
    };
    let ep = match parsed {
        Ok(ep) => ep,
        Err(e) => return finish(Served::error(e.status(), &e.message()), None, head),
    };
    let ip = ip_of(req);
    if !allowed(env, api::LIMIT_ALL.0, &ip).await {
        return too_many(api::LIMIT_ALL, head);
    }
    let inm = req.headers().get("If-None-Match")?;
    let s = serve(env, &format!("{}://{host}", url.scheme()), &ep, &ip).await;
    if s.status == 429 {
        return too_many(api::LIMIT_MISS, head);
    }
    let csv = s.ctype.starts_with("text/csv");
    let mut r = finish(s, inm.as_deref(), head)?;
    if csv {
        r.headers_mut().set(
            "Content-Disposition",
            &format!("inline; filename=\"emenda-{}.csv\"", ep.op.id),
        )?;
    }
    Ok(r)
}

pub fn ip_of(req: &Request) -> String {
    api::rl_key(
        req.headers()
            .get("CF-Connecting-IP")
            .ok()
            .flatten()
            .as_deref(),
    )
}

/// Cache lookup, then (rate-limited on miss) production and cache store.
pub async fn serve(env: &Env, origin: &str, ep: &Req, ip: &str) -> Served {
    let key = format!("{origin}{}", ep.canonical());
    let cache = Cache::default();
    if let Ok(Some(mut hit)) = cache.get(key.as_str(), true).await {
        let h = |n: &str| hit.headers().get(n).ok().flatten().unwrap_or_default();
        let (ctype, etag, cc) = (h("Content-Type"), h("ETag"), h("Cache-Control"));
        if let Ok(bytes) = hit.bytes().await {
            return Served {
                status: hit.status_code(),
                ctype,
                bytes,
                etag,
                cc,
                state: "HIT",
            };
        }
    }
    if !allowed(env, api::LIMIT_MISS.0, ip).await {
        return Served::error(429, "limite de requisições excedido");
    }
    let (status, ctype, bytes) = match produce(env, ep).await {
        Ok(r) => (200, r.ctype.to_string(), r.bytes),
        Err(e) => (
            e.status(),
            JSON.to_string(),
            api::error_body(e.status(), &e.message())
                .to_string()
                .into_bytes(),
        ),
    };
    let ttl = match status {
        200 => Some(ep.op.ttl),
        404 => Some(api::NOT_FOUND_TTL),
        _ => None,
    };
    let etag = api::etag(&bytes);
    let cc = ttl.map_or_else(|| "no-store".to_string(), api::cache_control);
    if ttl.is_some() {
        if let Ok(stored) = base(status, bytes.clone(), &ctype, &etag, &cc) {
            let _ = cache.put(key.as_str(), stored).await;
        }
    }
    Served {
        status,
        ctype,
        bytes,
        etag,
        cc,
        state: "MISS",
    }
}

pub fn now() -> Now {
    let s: String = js_sys::Date::new_0().to_iso_string().into();
    let iso = match s.get(..19) {
        Some(p) => format!("{p}Z"),
        None => s,
    };
    let today = datas::today_sp(&iso).unwrap_or_else(|| iso.chars().take(10).collect());
    Now { iso, today }
}

async fn produce(env: &Env, ep: &Req) -> std::result::Result<render::Rendered, ApiError> {
    let mut ctx = Ctx::new(now());
    for _ in 0..6 {
        match plan::run(ep, &ctx) {
            Step::Need(fs) => {
                let rs = join_all(fs.iter().map(|f| fetch(env, f))).await;
                for (f, r) in fs.into_iter().zip(rs) {
                    ctx.put(f, r);
                }
            }
            Step::Done(r) => return r.and_then(|d| render::render(ep, d)),
        }
    }
    Err(ApiError::Upstream(0))
}

/// Raw 200 body or the upstream status (0 = unreachable/not data).
async fn raw(r: Result<Response>, data: bool) -> std::result::Result<Vec<u8>, u16> {
    let mut r = r.map_err(|_| 0u16)?;
    let status = r.status_code();
    if status != 200 {
        return Err(status);
    }
    let html = r
        .headers()
        .get("Content-Type")
        .ok()
        .flatten()
        .is_some_and(|c| c.starts_with("text/html"));
    if data && html {
        return Err(404); // ASSETS SPA fallback, not data
    }
    r.bytes().await.map_err(|_| 0)
}

async fn fetch(env: &Env, f: &Fetch) -> std::result::Result<Vec<u8>, u16> {
    match f {
        Fetch::Data(p) => raw(data_fetch(env, p).await, true).await,
        Fetch::Asset(p) => raw(from_assets(env, p).await, true).await,
        Fetch::Camara(_) | Fetch::Senado(_) => {
            raw(get(&f.url(""), "application/json").await, false).await
        }
    }
}

fn base(status: u16, bytes: Vec<u8>, ctype: &str, etag: &str, cc: &str) -> Result<Response> {
    let mut r = Response::from_bytes(bytes)?.with_status(status);
    let h = r.headers_mut();
    h.set("Content-Type", ctype)?;
    h.set("Cache-Control", cc)?;
    h.set("ETag", etag)?;
    Ok(r)
}

pub fn finish(s: Served, inm: Option<&str>, head: bool) -> Result<Response> {
    let not_modified =
        s.status == 200 && !s.etag.is_empty() && inm.is_some_and(|h| api::etag_matches(h, &s.etag));
    let mut r = if not_modified {
        Response::empty()?.with_status(304)
    } else if head {
        Response::empty()?.with_status(s.status)
    } else {
        Response::from_bytes(s.bytes)?.with_status(s.status)
    };
    let h = r.headers_mut();
    h.set("Content-Type", &s.ctype)?;
    h.set("Cache-Control", &s.cc)?;
    if !s.etag.is_empty() {
        h.set("ETag", &s.etag)?;
    }
    h.set("x-emenda-cache", s.state)?;
    h.set("X-RateLimit-Limit", &api::LIMIT_ALL.1.to_string())?;
    cors(r)
}

pub fn cors(mut r: Response) -> Result<Response> {
    let h = r.headers_mut();
    h.set("Access-Control-Allow-Origin", "*")?;
    h.set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS")?;
    h.set(
        "Access-Control-Allow-Headers",
        "Content-Type, Accept, If-None-Match, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID",
    )?;
    h.set(
        "Access-Control-Expose-Headers",
        "ETag, Retry-After, X-RateLimit-Limit, x-emenda-cache, Mcp-Session-Id",
    )?;
    h.set("Access-Control-Max-Age", "86400")?;
    Ok(r)
}

/// Missing/broken binding fails open: the edge cache still shields upstream.
pub async fn allowed(env: &Env, binding: &str, key: &str) -> bool {
    match env.rate_limiter(binding) {
        Ok(rl) => rl.limit(key.to_string()).await.map_or(true, |o| o.success),
        Err(_) => true,
    }
}

pub fn too_many((_, limit, period): (&str, u32, u32), head: bool) -> Result<Response> {
    let msg = format!(
        "limite de requisições excedido ({limit} a cada {period}s); tente novamente em {period}s"
    );
    let mut r = finish(Served::error(429, &msg), None, head)?;
    let h = r.headers_mut();
    h.set("Retry-After", &period.to_string())?;
    h.set("X-RateLimit-Limit", &limit.to_string())?;
    h.set("X-RateLimit-Remaining", "0")?;
    Ok(r)
}
