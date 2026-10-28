//! wasm32 glue for RSS/Atom feeds (`/rss/*`): sources come from the cached `/v1` pipeline.
use crate::api::{self, registry};
use crate::feeds;
use crate::glue_api::{allowed, cors, ip_of, now, serve, too_many};
use serde_json::Value;
use worker::*;

fn plain(status: u16, msg: &str) -> Result<Response> {
    let mut r = Response::from_bytes(api::error_body(status, msg).to_string().into_bytes())?
        .with_status(status);
    r.headers_mut()
        .set("Content-Type", "application/json; charset=utf-8")?;
    r.headers_mut().set("Cache-Control", "no-store")?;
    cors(r)
}

pub async fn handle(
    req: &Request,
    env: &Env,
    url: &Url,
    host: &str,
    rest: &str,
) -> Result<Response> {
    let method = req.method();
    if method == Method::Options {
        return cors(Response::empty()?.with_status(204));
    }
    let head = method == Method::Head;
    if !(method == Method::Get || head) {
        return plain(405, "método não permitido");
    }
    let Some(fr) = feeds::parse(rest) else {
        return plain(404, "feed não encontrado");
    };
    let ip = ip_of(req);
    if !allowed(env, api::LIMIT_ALL.0, &ip).await {
        return too_many(api::LIMIT_ALL, head);
    }
    let origin = format!("{}://{host}", url.scheme());
    let self_url = format!("{origin}{}", url.path());
    let cache = Cache::default();
    if let Ok(Some(mut hit)) = cache.get(self_url.as_str(), true).await {
        let h = |n: &str| hit.headers().get(n).ok().flatten().unwrap_or_default();
        let (ct, cc, et) = (h("Content-Type"), h("Cache-Control"), h("ETag"));
        let body = if head { vec![] } else { hit.bytes().await? };
        let mut r = Response::from_bytes(body)?;
        let rh = r.headers_mut();
        rh.set("Content-Type", &ct)?;
        rh.set("Cache-Control", &cc)?;
        rh.set("ETag", &et)?;
        rh.set("x-emenda-cache", "HIT")?;
        return cors(r);
    }
    let n = now();
    let mut data: Vec<Option<Value>> = Vec::new();
    for u in feeds::sources(&fr, &n.today) {
        let (p, q) = u
            .split_once('?')
            .map_or((u.as_str(), None), |(p, q)| (p, Some(q)));
        let d = match registry::resolve(p.strip_prefix("/v1").unwrap_or(p), q) {
            Ok(ep) => {
                let s = serve(env, &origin, &ep, &ip).await;
                if s.status == 429 {
                    return too_many(api::LIMIT_MISS, head);
                }
                (s.status == 200)
                    .then(|| serde_json::from_slice::<Value>(&s.bytes).ok())
                    .flatten()
                    .map(|v| v["data"].clone())
            }
            Err(_) => None,
        };
        data.push(d);
    }
    let Some(ch) = feeds::channel(&fr, &data) else {
        return plain(404, "não encontrado");
    };
    let xml = feeds::render(&fr, &ch, &self_url, &n.iso);
    let etag = api::etag(xml.as_bytes());
    let ttl = fr.ttl();
    let mut r = Response::from_bytes(if head { vec![] } else { xml.into_bytes() })?;
    let h = r.headers_mut();
    h.set("Content-Type", fr.ctype())?;
    h.set(
        "Cache-Control",
        &format!("public, max-age={ttl}, s-maxage={ttl}, stale-while-revalidate=86400"),
    )?;
    h.set("ETag", &etag)?;
    h.set("x-emenda-cache", "MISS")?;
    let mut r = cors(r)?;
    if !head {
        let _ = cache.put(self_url.as_str(), r.cloned()?).await;
    }
    Ok(r)
}
