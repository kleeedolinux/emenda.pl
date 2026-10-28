//! wasm32 glue for SEO routes: fetch sources (with timeout), build the doc, render HTML or
//! Markdown, edge-cache per canonical URL + format + index.html version.
use super::negotiate::{self, Format};
use super::{head, markdown, pages, prerender, sitemap, Fetched, Page, SeoRoute, Source, ORIGIN};
use crate::glue::{data_fetch, from_assets, get};
use crate::route::{self, Route, Upstream};
use futures_util::future::{join_all, select, Either};
use sha2::{Digest, Sha256};
use std::time::Duration;
use worker::*;

const TIMEOUT_MS: u64 = 3500;

pub async fn handle(
    req: &Request,
    env: &Env,
    url: &Url,
    host: &str,
    r: SeoRoute,
) -> Result<Response> {
    let head_only = req.method() == Method::Head;
    let origin = format!("{}://{host}", url.scheme());
    match r {
        SeoRoute::Page { page, md } => {
            let h = req.headers();
            let fmt = negotiate::negotiate(
                md,
                url.query(),
                h.get("Accept")?.as_deref(),
                h.get("User-Agent")?.as_deref(),
            );
            page_response(env, &origin, &page, fmt, head_only).await
        }
        SeoRoute::LlmsTxt => {
            let key = format!("{origin}/llms.txt");
            text_cached(&key, sitemap::TEXT, head_only, || async {
                let d = fetch_all(env, &[Source::Data(sitemap::META.into())]).await;
                Some((sitemap::llms_txt(ORIGIN, d[0].ok()), complete(&d)))
            })
            .await
        }
        SeoRoute::LlmsFull => {
            let key = format!("{origin}/llms-full.txt");
            text_cached(&key, sitemap::TEXT, head_only, || async {
                let d = fetch_all(
                    env,
                    &[
                        Source::Data(sitemap::META.into()),
                        Source::Data("v1/brasil.json".into()),
                    ],
                )
                .await;
                Some((
                    sitemap::llms_full(ORIGIN, d[0].ok(), d[1].ok()),
                    complete(&d),
                ))
            })
            .await
        }
        SeoRoute::SitemapIndex => {
            let key = format!("{origin}/sitemap.xml");
            text_cached(&key, sitemap::XML, head_only, || async {
                let d = fetch_all(env, &[Source::Data(sitemap::META.into())]).await;
                Some((
                    sitemap::index(ORIGIN, sitemap::lastmod(d[0].ok()).as_deref()),
                    complete(&d),
                ))
            })
            .await
        }
        SeoRoute::Sitemap(c) => {
            let key = format!("{origin}/sitemaps/{}", c.file());
            text_cached(&key, sitemap::XML, head_only, || async {
                let d = fetch_all(env, &c.sources()).await;
                let paths = sitemap::child_paths(c, &d);
                // An empty live list is a transient failure: do not cache it.
                if paths.is_empty() {
                    return None;
                }
                Some((
                    sitemap::urlset(ORIGIN, &paths, sitemap::lastmod(d[0].ok()).as_deref()),
                    complete(&d),
                ))
            })
            .await
        }
    }
}

fn short_hash(s: &str) -> String {
    Sha256::digest(s.as_bytes())
        .iter()
        .take(6)
        .map(|b| format!("{b:02x}"))
        .collect()
}

async fn index_html(env: &Env) -> Option<String> {
    match from_assets(env, "/index.html").await {
        Ok(mut r) if r.status_code() == 200 => r.text().await.ok().filter(|t| !t.is_empty()),
        _ => None,
    }
}

fn og_image(page: &Page) -> String {
    let path = page.path();
    let (p, q) = match path.split_once('?') {
        Some((p, q)) => (p.to_string(), Some(q.to_string())),
        None => (path, None),
    };
    match route::route("GET", &p, q.as_deref()) {
        Route::Page(t) => format!("{ORIGIN}{}", t.og_path()),
        _ => format!("{ORIGIN}/og/default.png"),
    }
}

async fn page_response(
    env: &Env,
    origin: &str,
    page: &Page,
    fmt: Format,
    head_only: bool,
) -> Result<Response> {
    let html = match fmt {
        Format::Html => match index_html(env).await {
            Some(h) => Some(h),
            None => return Response::error("index.html unavailable", 502),
        },
        Format::Markdown => None,
    };
    let version = html.as_deref().map_or_else(|| "md".to_string(), short_hash);
    let preload = html.as_deref().and_then(head::preload_links);
    let key = super::cache_key(origin, page, fmt, &version);
    let cache = Cache::default();

    let (status, body, cc, state) = if let Ok(Some(mut hit)) = cache.get(key.as_str(), true).await {
        let cc = hit.headers().get("Cache-Control")?.unwrap_or_default();
        (hit.status_code(), hit.bytes().await?, cc, "HIT")
    } else {
        let now_ms = Date::now().as_millis() as f64;
        let today = crate::cards::dia_brasilia(now_ms);
        let now = super::iso_brasilia(now_ms);
        let d = fetch_all(env, &pages::sources(page, &today)).await;
        let doc = pages::build(page, &d, &now);
        let body = match &html {
            Some(index) => {
                let headb = head::render(&doc, ORIGIN, &og_image(page));
                let out = crate::meta::inject(index, &headb).unwrap_or_else(|| index.clone());
                let frag = prerender::render(&doc, ORIGIN);
                prerender::inject_root(&out, &frag).unwrap_or(out)
            }
            None => markdown::render(&doc, ORIGIN),
        };
        let cc = super::cache_control(page.kind, fmt, doc.complete);
        let body = body.into_bytes();
        if doc.complete && doc.status == 200 {
            let mut stored = Response::from_bytes(body.clone())?;
            stored.headers_mut().set("Cache-Control", &cc)?;
            let _ = cache.put(key.as_str(), stored).await;
        }
        (doc.status, body, cc, "MISS")
    };

    let mut resp = if head_only {
        Response::empty()?
    } else {
        Response::from_bytes(body)?
    }
    .with_status(status);
    let h = resp.headers_mut();
    for (k, v) in super::headers(page, fmt, status, preload.as_deref()) {
        h.set(k, &v)?;
    }
    h.set("Cache-Control", &cc)?;
    h.set("x-emenda-cache", state)?;
    Ok(resp)
}

async fn text_cached<F, Fut>(
    key: &str,
    ctype: &str,
    head_only: bool,
    produce: F,
) -> Result<Response>
where
    F: FnOnce() -> Fut,
    Fut: std::future::Future<Output = Option<(String, bool)>>,
{
    let cache = Cache::default();
    let ttl = sitemap::TTL;
    let cc = format!("public, max-age={ttl}, s-maxage={ttl}, stale-while-revalidate=86400");
    let (body, state, cc) = if let Ok(Some(mut hit)) = cache.get(key, true).await {
        (hit.bytes().await?, "HIT", cc)
    } else {
        match produce().await {
            Some((b, cacheable)) => {
                let b = b.into_bytes();
                if !cacheable {
                    (b, "MISS", "public, max-age=60".to_string())
                } else {
                    let mut stored = Response::from_bytes(b.clone())?;
                    stored.headers_mut().set("Cache-Control", &cc)?;
                    let _ = cache.put(key, stored).await;
                    (b, "MISS", cc)
                }
            }
            None => return Response::error("temporariamente indisponível", 503),
        }
    };
    let mut resp = if head_only {
        Response::empty()?
    } else {
        Response::from_bytes(body)?
    };
    let h = resp.headers_mut();
    h.set("Content-Type", ctype)?;
    h.set("Cache-Control", &cc)?;
    h.set("x-emenda-cache", state)?;
    h.set("Access-Control-Allow-Origin", "*")?;
    Ok(resp)
}

/// Every source answered (a 404 is an answer); otherwise do not cache.
fn complete(d: &[Fetched]) -> bool {
    !d.iter().any(|f| matches!(f, Fetched::Failed))
}

async fn fetch_all(env: &Env, sources: &[Source]) -> Vec<Fetched> {
    join_all(sources.iter().map(|s| fetch_one(env, s))).await
}

async fn fetch_one(env: &Env, s: &Source) -> Fetched {
    let fut = async {
        let res = match s {
            Source::Data(p) => data_fetch(env, p).await,
            Source::Asset(p) => from_assets(env, p).await,
            Source::Camara(p) => {
                get(
                    &route::upstream_url(Upstream::Camara, p, None, ""),
                    "application/json",
                )
                .await
            }
            Source::Senado(p) => {
                get(
                    &route::upstream_url(Upstream::Senado, p, None, ""),
                    "application/json",
                )
                .await
            }
        };
        let mut r = match res {
            Ok(r) => r,
            Err(_) => return Fetched::Failed,
        };
        match r.status_code() {
            200 => {}
            400 | 404 => return Fetched::NotFound,
            _ => return Fetched::Failed,
        }
        let html = r
            .headers()
            .get("Content-Type")
            .ok()
            .flatten()
            .is_some_and(|c| c.starts_with("text/html"));
        if html {
            // SPA fallback from ASSETS: the data file does not exist.
            return Fetched::NotFound;
        }
        match r.json().await {
            Ok(v) => Fetched::Ok(v),
            Err(_) => Fetched::Failed,
        }
    };
    let timeout = Delay::from(Duration::from_millis(TIMEOUT_MS));
    match select(Box::pin(fut), Box::pin(timeout)).await {
        Either::Left((f, _)) => f,
        Either::Right(_) => Fetched::Failed,
    }
}
