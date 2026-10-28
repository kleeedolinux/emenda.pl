//! wasm32 glue: Workers runtime I/O around the pure modules.
use crate::analytics::{self, Recent};
use crate::cards::{self, CardSpec, Kind};
use crate::meta;
use crate::route::{self, CacheClass, DataSource, Disposition, Route, Target, Upstream};
use serde_json::{json, Value};
use std::cell::RefCell;
use std::collections::BTreeMap;
use worker::*;

const UA: &str = "emenda.pl (+https://emenda.pl)";
const ASSET_HOST: &str = "https://assets.local";

struct Out {
    status: u16,
    ctype: String,
    body: Vec<u8>,
}

impl Out {
    fn json(status: u16, v: &Value) -> Self {
        Out {
            status,
            ctype: "application/json; charset=utf-8".into(),
            body: v.to_string().into_bytes(),
        }
    }
    fn error(status: u16, msg: &str) -> Self {
        Self::json(status, &json!({ "error": msg }))
    }
}

#[event(fetch)]
async fn fetch(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    let url = req.url()?;
    let method = req.method().to_string();
    let host = match (url.host_str(), url.port()) {
        (Some(h), Some(p)) => format!("{h}:{p}"),
        (h, _) => h.unwrap_or("localhost").to_string(),
    };
    match crate::api::scope(&host, url.path()) {
        crate::api::Scope::Site => {}
        sc => {
            let mut resp = crate::glue_api::handle(&req, &env, &url, &host, sc).await?;
            security_headers(&mut resp)?;
            return Ok(resp);
        }
    }
    let r = route::route(&method, url.path(), url.query());
    let cors = matches!(
        r,
        Route::Proxy { .. } | Route::Og(_) | Route::Health | Route::Options | Route::Stats
    );
    let mut resp = match &r {
        Route::Options => Response::empty()?.with_status(204),
        Route::MethodNotAllowed => {
            let mut r = respond(Out::error(405, "method not allowed"))?;
            r.headers_mut().set("Allow", "GET, HEAD, OPTIONS")?;
            r
        }
        Route::BadRequest => respond(Out::error(400, "bad request"))?,
        Route::NotFound => respond(Out::error(404, "not found"))?,
        Route::Health => {
            let mut r = respond(Out::json(
                200,
                &json!({ "ok": true, "version": crate::VERSION }),
            ))?;
            r.headers_mut().set("Cache-Control", "no-store")?;
            r
        }
        Route::Asset => asset(&env, &req).await?,
        Route::Hit => hit(&env, &req).await?,
        Route::Stats => {
            let key = route::cache_key(url.as_str());
            cached(&key, CacheClass::Stats, || stats(&env)).await?
        }
        _ => {
            let class = route::cache_class(&r).unwrap_or(CacheClass::CamaraList);
            let key = route::cache_key(url.as_str());
            let origin = route::public_origin(url.scheme(), &host);
            cached(&key, class, || produce(&r, &env, &origin, url.path())).await?
        }
    };
    security_headers(&mut resp)?;
    let h = resp.headers_mut();
    if cors {
        h.set("Access-Control-Allow-Origin", "*")?;
        h.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")?;
        h.set("Access-Control-Allow-Headers", "Content-Type")?;
        h.set("Access-Control-Max-Age", "86400")?;
    }
    Ok(resp)
}

fn security_headers(resp: &mut Response) -> Result<()> {
    let h = resp.headers_mut();
    for (k, v) in route::SECURITY_HEADERS {
        h.set(k, v)?;
    }
    Ok(())
}

fn respond(o: Out) -> Result<Response> {
    let mut r = Response::from_bytes(o.body)?.with_status(o.status);
    r.headers_mut().set("Content-Type", &o.ctype)?;
    Ok(r)
}

/// Edge cache via caches.default. Only 200s are stored.
async fn cached<F, Fut>(key: &str, class: CacheClass, produce: F) -> Result<Response>
where
    F: FnOnce() -> Fut,
    Fut: std::future::Future<Output = Out>,
{
    let cache = Cache::default();
    let cc = route::cache_control(class);
    if let Ok(Some(mut hit)) = cache.get(key, true).await {
        let ctype = hit.headers().get("Content-Type")?.unwrap_or_default();
        let out = Out {
            status: 200,
            ctype,
            body: hit.bytes().await?,
        };
        return tag(respond(out)?, &cc, "HIT");
    }
    let out = produce().await;
    let ok = out.status == 200;
    let mut resp = tag(respond(out)?, &cc, "MISS")?;
    if ok {
        let _ = cache.put(key, resp.cloned()?).await;
    } else {
        resp.headers_mut().set("Cache-Control", "no-store")?;
    }
    Ok(resp)
}

fn tag(mut r: Response, cc: &str, state: &str) -> Result<Response> {
    let h = r.headers_mut();
    h.set("Cache-Control", cc)?;
    h.set("x-emenda-cache", state)?;
    Ok(r)
}

async fn produce(r: &Route, env: &Env, origin: &str, path: &str) -> Out {
    match r {
        Route::Proxy {
            upstream,
            rest,
            query,
        } => proxy(env, *upstream, rest, query.as_deref()).await,
        Route::Og(t) => og_png(env, t).await,
        Route::Page(t) => page(env, t, origin, path).await,
        _ => Out::error(404, "not found"),
    }
}

pub(crate) fn data_base(env: &Env) -> DataSource {
    let v = env
        .var("DATA_BASE_URL")
        .map(|v| v.to_string())
        .unwrap_or_default();
    route::data_source(&v)
}

pub(crate) async fn get(url: &str, accept: &str) -> Result<Response> {
    let headers = Headers::new();
    headers.set("Accept", accept)?;
    headers.set("User-Agent", UA)?;
    let mut init = RequestInit::new();
    init.with_method(Method::Get).with_headers(headers);
    Fetch::Request(Request::new_with_init(url, &init)?)
        .send()
        .await
}

/// Raw upstream fetch -> (status, content-type, body). Non-200 -> 502.
async fn proxy(env: &Env, up: Upstream, rest: &str, query: Option<&str>) -> Out {
    let res = match (up, data_base(env)) {
        (Upstream::Data, DataSource::Assets) => from_assets(env, &format!("/data/{rest}")).await,
        (_, ds) => {
            let base = match ds {
                DataSource::Remote(b) => b,
                DataSource::Assets => String::new(),
            };
            get(
                &route::upstream_url(up, rest, query, &base),
                "application/json",
            )
            .await
        }
    };
    let mut r = match res {
        Ok(r) => r,
        Err(_) => return Out::error(502, "upstream unreachable"),
    };
    let status = r.status_code();
    let up_ct = r.headers().get("Content-Type").ok().flatten();
    match route::upstream_disposition(up, status) {
        Disposition::Ok => {
            let ctype = route::content_type(up, rest, up_ct.as_deref());
            if up == Upstream::Data && up_ct.as_deref().is_some_and(|c| c.starts_with("text/html"))
            {
                // SPA fallback page, not data
                return Out::error(404, "not found");
            }
            match r.bytes().await {
                Ok(body) => Out {
                    status: 200,
                    ctype,
                    body,
                },
                Err(_) => Out::error(502, "upstream read failed"),
            }
        }
        Disposition::PassThrough(s) => match r.bytes().await {
            Ok(body) if !body.is_empty() => Out {
                status: s,
                ctype: route::content_type(up, rest, up_ct.as_deref()),
                body,
            },
            _ => Out::error(s, &format!("upstream status {s}")),
        },
        Disposition::NotFound => Out::error(404, "not found"),
        Disposition::BadGateway => Out::error(502, &format!("upstream status {status}")),
    }
}

pub(crate) async fn from_assets(env: &Env, path: &str) -> Result<Response> {
    env.assets("ASSETS")?
        .fetch(format!("{ASSET_HOST}{path}"), None)
        .await
}

async fn asset(env: &Env, req: &Request) -> Result<Response> {
    let url = req.url()?;
    let mut r = from_assets(env, url.path()).await?;
    let status = r.status_code();
    let ctype = r.headers().get("Content-Type")?.unwrap_or_default();
    let mut out = respond(Out {
        status,
        ctype,
        body: r.bytes().await?,
    })?;
    if url.path().starts_with("/assets/") && status == 200 {
        out.headers_mut()
            .set("Cache-Control", &route::cache_control(CacheClass::Asset))?;
    }
    Ok(out)
}

async fn json_of(r: Result<Response>) -> Option<Value> {
    let mut r = r.ok()?;
    if r.status_code() != 200 {
        return None;
    }
    r.json().await.ok()
}

async fn camara(path: &str) -> Option<Value> {
    json_of(
        get(
            &route::upstream_url(Upstream::Camara, path, None, ""),
            "application/json",
        )
        .await,
    )
    .await
}

/// ETL file (`rest` relative to the data base) from ASSETS or `DATA_BASE_URL`.
pub(crate) async fn data_fetch(env: &Env, rest: &str) -> Result<Response> {
    match data_base(env) {
        DataSource::Assets => from_assets(env, &format!("/data/{rest}")).await,
        DataSource::Remote(b) => {
            get(
                &route::upstream_url(Upstream::Data, rest, None, &b),
                "application/json",
            )
            .await
        }
    }
}

async fn data(env: &Env, rest: &str) -> Option<Value> {
    json_of(data_fetch(env, rest).await).await
}

async fn card_for(env: &Env, t: &Target) -> Option<CardSpec> {
    let id = &t.id;
    match t.kind {
        Kind::Default => Some(cards::default_card()),
        Kind::Deputado => {
            let dep = camara(&format!("deputados/{id}")).await?;
            let autores = data(env, "v1/autores.json").await;
            let n = get(
                &format!("https://dadosabertos.camara.leg.br/api/v2/proposicoes?idDeputadoAutor={id}&itens=1"),
                "application/json",
            )
            .await
            .ok()
            .and_then(|r| r.headers().get("x-total-count").ok().flatten())
            .and_then(|v| v.parse().ok());
            cards::deputado(&dep, autores.as_ref(), n)
        }
        Kind::Senador => {
            let url = route::upstream_url(Upstream::Senado, &format!("senador/{id}"), None, "");
            let sen = json_of(get(&url, "application/json").await).await?;
            let autores = data(env, "v1/autores.json").await;
            cards::senador(&sen, autores.as_ref())
        }
        Kind::Municipio => cards::municipio(&data(env, &format!("v1/municipio/{id}.json")).await?),
        Kind::Uf => cards::uf(&data(env, &format!("v1/uf/{id}.json")).await?),
        Kind::Autor => cards::autor(&data(env, &format!("v1/autor/{id}.json")).await?),
        Kind::Proposicao => cards::proposicao(&camara(&format!("proposicoes/{id}")).await?),
        Kind::Votacao => {
            let v = camara(&format!("votacoes/{id}")).await?;
            let votos = camara(&format!("votacoes/{id}/votos")).await;
            cards::votacao(&v, votos.as_ref())
        }
        Kind::Partido => {
            let list = camara(&format!("partidos?sigla={id}")).await?;
            let pid = list.pointer("/dados/0/id")?.as_i64()?;
            cards::partido(&camara(&format!("partidos/{pid}")).await?)
        }
    }
}

fn og_kind(k: Kind) -> og::OgKind {
    match k {
        Kind::Default => og::OgKind::Default,
        Kind::Deputado => og::OgKind::Deputado,
        Kind::Senador => og::OgKind::Senador,
        Kind::Municipio => og::OgKind::Municipio,
        Kind::Uf => og::OgKind::Uf,
        Kind::Autor => og::OgKind::Autor,
        Kind::Proposicao => og::OgKind::Proposicao,
        Kind::Votacao => og::OgKind::Votacao,
        Kind::Partido => og::OgKind::Partido,
    }
}

async fn to_og(c: CardSpec) -> og::OgCard {
    let photo = match &c.photo_url {
        Some(u) => match get(u, "image/*").await {
            Ok(mut r) if r.status_code() == 200 => r.bytes().await.ok(),
            _ => None,
        },
        None => None,
    };
    og::OgCard {
        kind: og_kind(c.kind),
        eyebrow: c.eyebrow,
        title: c.title,
        subtitle: c.subtitle,
        stats: c
            .stats
            .into_iter()
            .map(|(label, value)| og::OgStat { label, value })
            .collect(),
        badge: c.badge,
        accent: None,
        photo,
    }
}

async fn og_png(env: &Env, t: &Target) -> Out {
    let card = card_for(env, t).await.unwrap_or_else(cards::default_card);
    let png = match og::png(&to_og(card).await) {
        Ok(p) => Ok(p),
        Err(_) => og::png(&to_og(cards::default_card()).await),
    };
    match png {
        Ok(body) => Out {
            status: 200,
            ctype: "image/png".into(),
            body,
        },
        Err(_) => Out::error(500, "og render failed"),
    }
}

async fn page(env: &Env, t: &Target, origin: &str, path: &str) -> Out {
    let html = match from_assets(env, "/index.html").await {
        Ok(mut r) if r.status_code() == 200 => r.text().await.unwrap_or_default(),
        _ => String::new(),
    };
    if html.is_empty() {
        return Out::error(502, "index.html unavailable");
    }
    let m = meta::page_meta(t, origin, path, None);
    let html = meta::inject(&html, &meta::render(&m)).unwrap_or(html);
    Out {
        status: 200,
        ctype: "text/html; charset=utf-8".into(),
        body: html.into_bytes(),
    }
}

// ---------- analytics ----------

fn analytics_stub(env: &Env) -> Result<Stub> {
    env.durable_object("ANALYTICS")?
        .id_from_name("global")?
        .get_stub()
}

/// POST /api/hit. Same-origin beacon; always 204. Counts only non-DNT, non-bot UAs.
async fn hit(env: &Env, req: &Request) -> Result<Response> {
    let h = req.headers();
    let mut resp = Response::empty()?.with_status(204);
    resp.headers_mut().set("Cache-Control", "no-store")?;
    if !analytics::should_track(h.get("DNT")?.as_deref(), h.get("User-Agent")?.as_deref()) {
        return Ok(resp);
    }
    let existing = analytics::cookie_vid(h.get("Cookie")?.as_deref());
    let is_new = existing.is_none();
    let vid = match existing {
        Some(v) => v,
        None => {
            let mut b = [0u8; 16];
            getrandom::getrandom(&mut b).map_err(|e| Error::RustError(e.to_string()))?;
            analytics::vid_hex(b)
        }
    };
    let now = Date::now().as_millis();
    let day = analytics::day_string(now as f64);
    let secret = env
        .var("ANALYTICS_SALT")
        .map(|v| v.to_string())
        .unwrap_or_else(|_| "emenda.pl".into());
    let body = json!({ "hash": analytics::visitor_hash(&vid, &day, &secret), "day": day, "new": is_new, "now": now });
    let mut init = RequestInit::new();
    init.with_method(Method::Post)
        .with_body(Some(body.to_string().into()));
    let _ = analytics_stub(env)?
        .fetch_with_request(Request::new_with_init("https://do/hit", &init)?)
        .await;
    if is_new {
        resp.headers_mut()
            .set("Set-Cookie", &analytics::set_cookie(&vid))?;
    }
    Ok(resp)
}

async fn stats(env: &Env) -> Out {
    let res = async {
        let mut r = analytics_stub(env)?
            .fetch_with_str("https://do/stats")
            .await?;
        r.bytes().await
    }
    .await;
    match res {
        Ok(body) => Out {
            status: 200,
            ctype: "application/json; charset=utf-8".into(),
            body,
        },
        Err(_) => Out::error(502, "stats unavailable"),
    }
}

/// Single global DO. Storage: `counts` {day: distinct}, `total`, `last_day`, `v:{day}:{hash}` (today only).
#[durable_object]
pub struct Analytics {
    state: State,
    recent: RefCell<Recent>,
}

impl DurableObject for Analytics {
    fn new(state: State, _env: Env) -> Self {
        Self {
            state,
            recent: RefCell::new(Recent::default()),
        }
    }

    async fn fetch(&self, mut req: Request) -> Result<Response> {
        let s = self.state.storage();
        let now = Date::now().as_millis();
        let today = analytics::day_string(now as f64);
        if req.path() == "/hit" {
            let b: Value = req.json().await?;
            let (Some(hash), Some(day)) = (b["hash"].as_str(), b["day"].as_str()) else {
                return Response::error("bad hit", 400);
            };
            let key = format!("v:{day}:{hash}");
            if s.get::<u8>(&key).await?.is_none() {
                s.put(&key, 1u8).await?;
                let mut counts: BTreeMap<String, u64> = s.get("counts").await?.unwrap_or_default();
                analytics::record_day(&mut counts, day);
                analytics::prune_counts(&mut counts, day, 400);
                s.put("counts", &counts).await?;
            }
            if b["new"].as_bool() == Some(true) {
                let total: u64 = s.get("total").await?.unwrap_or(0);
                s.put("total", total + 1).await?;
            }
            let last: Option<String> = s.get("last_day").await?;
            if let Some(old) = last.filter(|l| l.as_str() != day) {
                let prefix = format!("v:{old}:");
                let keys: Vec<String> = s
                    .list_with_options(ListOptions::new().prefix(&prefix))
                    .await?
                    .keys()
                    .into_iter()
                    .filter_map(|k| k.ok()?.as_string())
                    .collect();
                for chunk in keys.chunks(128) {
                    s.delete_multiple(chunk.to_vec()).await?;
                }
            }
            s.put("last_day", day).await?;
            self.recent.borrow_mut().touch(hash, now);
            return Response::empty();
        }
        let counts: BTreeMap<String, u64> = s.get("counts").await?.unwrap_or_default();
        let total: u64 = s.get("total").await?.unwrap_or(0);
        let online = {
            let mut r = self.recent.borrow_mut();
            r.prune(now);
            r.online() as u64
        };
        Response::from_json(&analytics::aggregate(&counts, total, online, &today).to_json())
    }
}
