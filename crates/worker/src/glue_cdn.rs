//! wasm32 glue for the asset mirror (`cdn.emenda.online`, `/cdn/*`). Logic in `crate::cdn`.
use crate::cdn::{self, Fallback};
use crate::route::{upstream_url, Upstream};
use worker::*;

fn status(code: u16, cc: &str) -> Result<Response> {
    let mut r = Response::empty()?.with_status(code);
    let h = r.headers_mut();
    h.set("Cache-Control", cc)?;
    h.set("Access-Control-Allow-Origin", "*")?;
    h.set("X-Content-Type-Options", "nosniff")?;
    Ok(r)
}

fn redirect(to: &str) -> Result<Response> {
    let mut r = status(302, cdn::CACHE_CONTROL_FALLBACK)?;
    r.headers_mut().set("Location", to)?;
    Ok(r)
}

/// 304 when `If-None-Match` matches the response ETag.
fn conditional(req: &Request, resp: Response) -> Result<Response> {
    let etag = resp.headers().get("ETag")?;
    let inm = req.headers().get("If-None-Match")?;
    match etag {
        Some(e) if cdn::etag_match(inm.as_deref(), &e) => {
            let mut r = status(
                304,
                &resp.headers().get("Cache-Control")?.unwrap_or_default(),
            )?;
            r.headers_mut().set("ETag", &e)?;
            Ok(r)
        }
        _ => Ok(resp),
    }
}

async fn not_mirrored(path: &str) -> Result<Response> {
    match cdn::fallback(path) {
        Some(Fallback::Redirect(to)) => redirect(&to),
        Some(Fallback::Camara { path: p, campo }) => {
            let url = upstream_url(Upstream::Camara, &p, None, "");
            let v = match crate::glue::get(&url, "application/json").await {
                Ok(mut r) if r.status_code() == 200 => r.json::<serde_json::Value>().await.ok(),
                _ => None,
            };
            match v.as_ref().and_then(|v| cdn::campo_url(v, campo)) {
                Some(to) => redirect(&to),
                None => status(404, cdn::CACHE_CONTROL_FALLBACK),
            }
        }
        None => status(404, cdn::CACHE_CONTROL_FALLBACK),
    }
}

pub(crate) async fn handle(req: &Request, path: &str) -> Result<Response> {
    match req.method() {
        Method::Options => {
            let mut r = status(204, "public, max-age=86400")?;
            let h = r.headers_mut();
            h.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")?;
            h.set("Access-Control-Max-Age", "86400")?;
            return Ok(r);
        }
        Method::Get | Method::Head => {}
        _ => {
            let mut r = status(405, "no-store")?;
            r.headers_mut().set("Allow", "GET, HEAD, OPTIONS")?;
            return Ok(r);
        }
    }
    if cdn::content_type(path).is_none() {
        return status(404, cdn::CACHE_CONTROL_FALLBACK);
    }
    let cache = Cache::default();
    let key = cdn::cache_key(path);
    if let Ok(Some(mut hit)) = cache.get(key.as_str(), true).await {
        hit.headers_mut().set("x-emenda-cache", "HIT")?;
        return conditional(req, hit);
    }
    let up = match crate::glue::get(&cdn::upstream(path), "*/*").await {
        Ok(r) => r,
        Err(_) => return status(502, "no-store"),
    };
    match up.status_code() {
        200 => {}
        404 => return not_mirrored(path).await,
        _ => return status(502, "no-store"),
    }
    let h = Headers::new();
    for (k, v) in cdn::headers(path) {
        h.set(k, v)?;
    }
    if let Some(e) = up.headers().get("ETag")? {
        h.set("ETag", &e)?;
    }
    let mut resp = up.with_headers(h).with_status(200);
    let _ = cache.put(key.as_str(), resp.cloned()?).await;
    resp.headers_mut().set("x-emenda-cache", "MISS")?;
    conditional(req, resp)
}
