//! wasm32 glue for the public API (`/v1`): edge cache, rate limiting, upstream fetch.
use crate::api::{self, map, ApiError, Endpoint, Meta, Scope};
use crate::glue::{data_fetch, get};
use serde_json::Value;
use worker::*;

const JSON: &str = "application/json; charset=utf-8";

/// Produced body: 200 and 404 are cached (404 briefly); anything else is not.
struct Body {
    status: u16,
    bytes: Vec<u8>,
}

impl Body {
    fn ok(bytes: Vec<u8>) -> Self {
        Body { status: 200, bytes }
    }
    fn error(status: u16, msg: &str) -> Self {
        Body {
            status,
            bytes: api::error_body(status, msg).to_string().into_bytes(),
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
    let method = req.method();
    if method == Method::Options {
        return cors(Response::empty()?.with_status(204));
    }
    let head = method == Method::Head;
    if !(method == Method::Get || head) {
        let mut r = plain(Body::error(405, "método não permitido"), head)?;
        r.headers_mut().set("Allow", "GET, HEAD, OPTIONS")?;
        return Ok(r);
    }
    let parsed = match sc {
        Scope::Api(rest) => api::parse(rest, url.query()),
        _ => Err(ApiError::NotFound),
    };
    let ep = match parsed {
        Ok(ep) => ep,
        Err(e) => return plain(Body::error(e.status(), e.message()), head),
    };
    let ip = api::rl_key(req.headers().get("CF-Connecting-IP")?.as_deref());
    let key = format!("{}://{host}{}", url.scheme(), ep.canonical());
    let inm = req.headers().get("If-None-Match")?;
    let cache = Cache::default();

    if let Ok(Some(mut hit)) = cache.get(key.as_str(), true).await {
        if !allowed(env, api::LIMIT_ALL.0, &ip).await {
            return too_many(api::LIMIT_ALL, head);
        }
        let status = hit.status_code();
        let cc = hit.headers().get("Cache-Control")?.unwrap_or_default();
        let et = hit.headers().get("ETag")?.unwrap_or_default();
        let bytes = hit.bytes().await?;
        return finish(status, bytes, &et, &cc, "HIT", inm.as_deref(), head);
    }

    if !allowed(env, api::LIMIT_ALL.0, &ip).await {
        return too_many(api::LIMIT_ALL, head);
    }
    if !allowed(env, api::LIMIT_MISS.0, &ip).await {
        return too_many(api::LIMIT_MISS, head);
    }
    let body = produce(env, &ep).await;
    let ttl = match body.status {
        200 => Some(ep.ttl()),
        404 => Some(api::NOT_FOUND_TTL),
        _ => None,
    };
    let et = api::etag(&body.bytes);
    let cc = ttl.map_or_else(|| "no-store".to_string(), api::cache_control);
    if ttl.is_some() {
        let stored = base(body.status, body.bytes.clone(), &et, &cc)?;
        let _ = cache.put(key.as_str(), stored).await;
    }
    finish(
        body.status,
        body.bytes,
        &et,
        &cc,
        "MISS",
        inm.as_deref(),
        head,
    )
}

fn base(status: u16, bytes: Vec<u8>, etag: &str, cc: &str) -> Result<Response> {
    let mut r = Response::from_bytes(bytes)?.with_status(status);
    let h = r.headers_mut();
    h.set("Content-Type", JSON)?;
    h.set("Cache-Control", cc)?;
    h.set("ETag", etag)?;
    Ok(r)
}

fn finish(
    status: u16,
    bytes: Vec<u8>,
    etag: &str,
    cc: &str,
    state: &str,
    inm: Option<&str>,
    head: bool,
) -> Result<Response> {
    let not_modified = status == 200 && inm.is_some_and(|h| api::etag_matches(h, etag));
    let mut r = if not_modified {
        Response::empty()?.with_status(304)
    } else if head {
        Response::empty()?.with_status(status)
    } else {
        Response::from_bytes(bytes)?.with_status(status)
    };
    let h = r.headers_mut();
    h.set("Content-Type", JSON)?;
    h.set("Cache-Control", cc)?;
    if !etag.is_empty() {
        h.set("ETag", etag)?;
    }
    h.set("x-emenda-cache", state)?;
    h.set("X-RateLimit-Limit", &api::LIMIT_ALL.1.to_string())?;
    cors(r)
}

fn plain(b: Body, head: bool) -> Result<Response> {
    finish(b.status, b.bytes, "", "no-store", "BYPASS", None, head)
}

fn cors(mut r: Response) -> Result<Response> {
    let h = r.headers_mut();
    h.set("Access-Control-Allow-Origin", "*")?;
    h.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")?;
    h.set(
        "Access-Control-Allow-Headers",
        "Content-Type, If-None-Match",
    )?;
    h.set(
        "Access-Control-Expose-Headers",
        "ETag, Retry-After, X-RateLimit-Limit, x-emenda-cache",
    )?;
    h.set("Access-Control-Max-Age", "86400")?;
    Ok(r)
}

/// Missing/broken binding fails open: the edge cache still shields upstream.
async fn allowed(env: &Env, binding: &str, key: &str) -> bool {
    match env.rate_limiter(binding) {
        Ok(rl) => rl.limit(key.to_string()).await.map_or(true, |o| o.success),
        Err(_) => true,
    }
}

fn too_many((_, limit, period): (&str, u32, u32), head: bool) -> Result<Response> {
    let msg = format!(
        "limite de requisições excedido ({limit} a cada {period}s); tente novamente em {period}s"
    );
    let mut r = plain(Body::error(429, &msg), head)?;
    let h = r.headers_mut();
    h.set("Retry-After", &period.to_string())?;
    h.set("X-RateLimit-Limit", &limit.to_string())?;
    h.set("X-RateLimit-Remaining", "0")?;
    Ok(r)
}

fn now_iso() -> String {
    let s: String = js_sys::Date::new_0().to_iso_string().into();
    match s.get(..19) {
        Some(p) => format!("{p}Z"),
        None => s,
    }
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

async fn data_raw(env: &Env, rest: &str) -> std::result::Result<Vec<u8>, u16> {
    raw(data_fetch(env, rest).await, true).await
}

async fn data_json(env: &Env, rest: &str) -> std::result::Result<Value, u16> {
    serde_json::from_slice(&data_raw(env, rest).await?).map_err(|_| 0)
}

async fn live_json(url: &str) -> std::result::Result<Value, u16> {
    let b = raw(get(url, "application/json").await, false).await?;
    serde_json::from_slice(&b).map_err(|_| 0)
}

fn upstream_err(status: u16) -> Body {
    match status {
        404 => Body::error(404, "não encontrado na origem"),
        s => Body::error(502, &format!("falha na origem ({s})")),
    }
}

fn wrap(data: Option<Value>, fonte: Vec<String>, atualizado: String) -> Body {
    match data {
        Some(d) => Body::ok(
            api::envelope(&d, &Meta { fonte, atualizado })
                .to_string()
                .into_bytes(),
        ),
        None => Body::error(404, "não encontrado"),
    }
}

async fn generated_at(env: &Env) -> String {
    data_json(env, "v1/meta.json")
        .await
        .ok()
        .and_then(|m| m.get("generatedAt")?.as_str().map(String::from))
        .unwrap_or_else(now_iso)
}

async fn produce(env: &Env, ep: &Endpoint) -> Body {
    let portal = || vec![api::PORTAL.to_string()];
    if let Some(file) = ep.data_file() {
        let bytes = match data_raw(env, &file).await {
            Ok(b) => b,
            Err(s) => return upstream_err(s),
        };
        let atualizado = match ep {
            Endpoint::Meta => serde_json::from_slice::<Value>(&bytes)
                .ok()
                .and_then(|m| m.get("generatedAt")?.as_str().map(String::from))
                .unwrap_or_else(now_iso),
            _ => generated_at(env).await,
        };
        let m = Meta {
            fonte: portal(),
            atualizado,
        };
        return match api::envelope_raw(&bytes, &m) {
            Some(b) => Body::ok(b),
            None => Body::error(502, "dados inválidos na origem"),
        };
    }
    let camara = |p: &str| format!("{}{p}", api::CAMARA);
    let senado = |p: &str| format!("{}{p}", api::SENADO);
    match ep {
        Endpoint::Index => wrap(
            Some(api::index()),
            vec![api::PORTAL.into(), api::CAMARA.into(), api::SENADO.into()],
            now_iso(),
        ),
        Endpoint::Ufs => match data_json(env, "v1/brasil.json").await {
            Ok(b) => wrap(Some(map::ufs(&b)), portal(), generated_at(env).await),
            Err(s) => upstream_err(s),
        },
        Endpoint::Autores(q) => match data_json(env, "v1/autores.json").await {
            Ok(a) => wrap(Some(map::autores(&a, q)), portal(), generated_at(env).await),
            Err(s) => upstream_err(s),
        },
        Endpoint::Deputados => {
            let u = camara("deputados");
            match live_json(&u).await {
                Ok(l) => {
                    let a = data_json(env, "v1/autores.json").await.ok();
                    wrap(
                        Some(map::deputados(&l, a.as_ref())),
                        vec![u, api::PORTAL.into()],
                        now_iso(),
                    )
                }
                Err(s) => upstream_err(s),
            }
        }
        Endpoint::Deputado(id) => {
            let u = camara(&format!("deputados/{id}"));
            match live_json(&u).await {
                Ok(d) => {
                    let a = data_json(env, "v1/autores.json").await.ok();
                    wrap(
                        map::deputado(&d, a.as_ref()),
                        vec![u, api::PORTAL.into()],
                        now_iso(),
                    )
                }
                Err(s) => upstream_err(s),
            }
        }
        Endpoint::Senadores => {
            let u = senado("senador/lista/atual");
            match live_json(&u).await {
                Ok(l) => {
                    let a = data_json(env, "v1/autores.json").await.ok();
                    wrap(
                        Some(map::senadores(&l, a.as_ref())),
                        vec![u, api::PORTAL.into()],
                        now_iso(),
                    )
                }
                Err(s) => upstream_err(s),
            }
        }
        Endpoint::Senador(c) => {
            let u = senado(&format!("senador/{c}"));
            match live_json(&u).await {
                Ok(d) => {
                    let a = data_json(env, "v1/autores.json").await.ok();
                    wrap(
                        map::senador(&d, a.as_ref()),
                        vec![u, api::PORTAL.into()],
                        now_iso(),
                    )
                }
                Err(s) => upstream_err(s),
            }
        }
        Endpoint::Proposicao(id) => {
            let u = camara(&format!("proposicoes/{id}"));
            match live_json(&u).await {
                Ok(p) => {
                    let ua = format!("{u}/autores");
                    let a = live_json(&ua).await.ok();
                    wrap(map::proposicao(&p, a.as_ref()), vec![u, ua], now_iso())
                }
                Err(s) => upstream_err(s),
            }
        }
        Endpoint::Votacao(id) => {
            let u = camara(&format!("votacoes/{id}"));
            match live_json(&u).await {
                Ok(v) => {
                    let uv = format!("{u}/votos");
                    let uo = format!("{u}/orientacoes");
                    let votos = live_json(&uv).await.ok();
                    let ori = live_json(&uo).await.ok();
                    wrap(
                        map::votacao(&v, votos.as_ref(), ori.as_ref()),
                        vec![u, uv, uo],
                        now_iso(),
                    )
                }
                Err(s) => upstream_err(s),
            }
        }
        _ => Body::error(404, "não encontrado"),
    }
}
