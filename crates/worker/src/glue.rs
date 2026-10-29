//! wasm32 glue: Workers runtime I/O around the pure modules.
use crate::analytics::{self, Recent};
use crate::cards::{self, Kind};
use crate::meta;
use crate::route::{self, CacheClass, DataSource, Disposition, Route, Target, Upstream};
use crate::seo::Fetched;
use crate::{foto, ogcache, viral};
use serde_json::{json, Value};
use std::cell::RefCell;
use std::collections::BTreeMap;
use worker::*;

const UA: &str = "emenda.pl (+https://emenda.pl)";
const ASSET_HOST: &str = "https://assets.local";

pub(crate) struct Out {
    pub(crate) status: u16,
    pub(crate) ctype: String,
    pub(crate) body: Vec<u8>,
}

impl Out {
    pub(crate) fn json(status: u16, v: &Value) -> Self {
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
    if let Some(p) = crate::cdn::scope(&host, url.path()) {
        return crate::glue_cdn::handle(&req, p).await;
    }
    match crate::api::scope(&host, url.path()) {
        crate::api::Scope::Site => {}
        sc => {
            let mut resp = crate::glue_api::handle(&req, &env, &url, &host, sc).await?;
            security_headers(&mut resp)?;
            return Ok(resp);
        }
    }
    if let Some(sr) = crate::seo::route(&method, url.path(), url.query()) {
        let mut resp = crate::seo::glue_seo::handle(&req, &env, &url, &host, sr).await?;
        security_headers(&mut resp)?;
        return Ok(resp);
    }
    let r = route::route(&method, url.path(), url.query());
    let cors = matches!(
        r,
        Route::Proxy { .. }
            | Route::Og(_)
            | Route::OgImg(_)
            | Route::Health
            | Route::Options
            | Route::Stats
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
        Route::Og(t) => {
            let origin = route::public_origin(url.scheme(), &host);
            og_route(&env, &req, &origin, t).await?
        }
        Route::Stats => {
            let key = route::cache_key(url.as_str());
            cached(&key, CacheClass::Stats, || stats(&env)).await?
        }
        Route::Proxy {
            upstream: up @ (Upstream::Camara | Upstream::Senado),
            rest,
            query,
        } => {
            let class = route::cache_class(&r).unwrap_or(CacheClass::CamaraList);
            let key = route::cache_key(url.as_str());
            crate::glue_espelho::handle(&env, *up, rest, query.as_deref(), &key, class).await?
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

pub(crate) fn respond(o: Out) -> Result<Response> {
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
        Route::OgImg(i) => og_img(i).await,
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
pub(crate) async fn proxy(env: &Env, up: Upstream, rest: &str, query: Option<&str>) -> Out {
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

async fn photo(url: Option<&str>) -> Option<Vec<u8>> {
    match get(url?, "image/*").await {
        Ok(mut r) if r.status_code() == 200 => r.bytes().await.ok(),
        _ => None,
    }
}

/// Voto / agenda cards; None -> caller falls back to the default card.
async fn share_png(t: &Target) -> Option<Vec<u8>> {
    match t.kind {
        Kind::Voto => {
            let (vid, dep) = t.id.split_once('/')?;
            let v = camara(&format!("votacoes/{vid}")).await?;
            let votos = camara(&format!("votacoes/{vid}/votos")).await?;
            let spec = cards::voto(&v, &votos, dep.parse().ok()?)?;
            let photo = photo(spec.photo_url.as_deref()).await;
            og::voto_png(&og::OgVoto {
                deputado: spec.deputado,
                partido_uf: spec.partido_uf,
                voto: spec.voto,
                titulo: spec.titulo,
                data: spec.data,
                placar: Some(spec.placar),
                photo,
            })
            .ok()
        }
        Kind::Agenda => {
            let dia = if t.id == "hoje" {
                cards::dia_brasilia(Date::now().as_millis() as f64)
            } else {
                t.id.clone()
            };
            let ev = camara(&format!(
                "eventos?dataInicio={dia}&dataFim={dia}&ordem=ASC&ordenarPor=dataHoraInicio&itens=100"
            ))
            .await?;
            let pauta = match cards::agenda_evento_principal(&ev) {
                Some(id) => camara(&format!("eventos/{id}/pauta")).await,
                None => None,
            };
            let a = cards::agenda(&dia, &ev, pauta.as_ref())?;
            og::agenda_png(&og::OgAgenda {
                dia: a.dia,
                casa: a.casa,
                total: a.total,
                items: a
                    .items
                    .into_iter()
                    .map(|i| og::OgAgendaItem {
                        hora: i.hora,
                        sigla: i.sigla,
                        titulo: i.titulo,
                    })
                    .collect(),
            })
            .ok()
        }
        _ => None,
    }
}

fn png_out(body: Vec<u8>) -> Out {
    Out {
        status: 200,
        ctype: "image/png".into(),
        body,
    }
}

/// PNG + whether it is complete (`false`: fallback after an upstream failure).
async fn og_png(env: &Env, t: &Target) -> (Out, bool) {
    if let Some(body) = share_png(t).await {
        return (png_out(body), true);
    }
    if let Some((body, durable)) = viral_png(env, t).await {
        return (png_out(body), durable);
    }
    match og::png(&og::OgCard::site_default()) {
        Ok(body) => (png_out(body), false),
        Err(_) => (Out::error(500, "og render failed"), false),
    }
}

/// Current OG version (`?v=`): render revision + ETL `generatedAt` (agenda: hour bucket).
async fn og_version(env: &Env, kind: Kind) -> String {
    let now = Date::now().as_millis() as f64;
    let meta = if kind == Kind::Agenda {
        None
    } else {
        json_of(data_fetch(env, "v1/meta.json").await).await
    };
    ogcache::og_version(kind, &ogcache::data_version(meta.as_ref(), now), now)
}

fn og_response(body: Vec<u8>, cc: &str, etag: &str, state: &str) -> Result<Response> {
    let mut r = Response::from_bytes(body)?;
    let h = r.headers_mut();
    h.set("Content-Type", "image/png")?;
    h.set("Cache-Control", cc)?;
    h.set("ETag", etag)?;
    h.set("x-emenda-cache", state)?;
    Ok(r)
}

async fn cache_hit(cache: &Cache, key: &str) -> Option<(Vec<u8>, String)> {
    let mut hit = cache.get(key, true).await.ok()??;
    let cc = hit.headers().get("Cache-Control").ok()??;
    Some((hit.bytes().await.ok()?, cc))
}

/// `/og/*`: versioned URLs are immutable; others render with a short TTL under the path-only key.
async fn og_route(env: &Env, req: &Request, origin: &str, t: &Target) -> Result<Response> {
    let url = req.url()?;
    let path = url.path();
    let req_v = ogcache::request_version(url.query());
    let inm = req.headers().get("If-None-Match")?;
    let cache = Cache::default();
    let serve = |body: Vec<u8>, cc: &str, key: &str, state: &str| -> Result<Response> {
        let etag = ogcache::etag(key);
        if crate::cdn::etag_match(inm.as_deref(), &etag) {
            let mut r = Response::empty()?.with_status(304);
            r.headers_mut().set("ETag", &etag)?;
            r.headers_mut().set("Cache-Control", cc)?;
            return Ok(r);
        }
        og_response(body, cc, &etag, state)
    };
    // Versioned entries exist only for the matching version: a hit needs no version check.
    if let Some(v) = req_v.as_deref() {
        let key = ogcache::cache_key(origin, path, Some(v));
        if let Some((body, cc)) = cache_hit(&cache, &key).await {
            return serve(body, &cc, &key, "HIT");
        }
    }
    let current = og_version(env, t.kind).await;
    let versioned = req_v.as_deref() == Some(current.as_str());
    let key = ogcache::cache_key(origin, path, versioned.then_some(current.as_str()));
    if !versioned {
        if let Some((body, cc)) = cache_hit(&cache, &key).await {
            return serve(body, &cc, &key, "HIT");
        }
    }
    let (out, durable) = og_png(env, t).await;
    if out.status != 200 {
        return respond(out);
    }
    let f = ogcache::freshness(req_v.as_deref(), &current, durable);
    let cc = ogcache::cache_control(f);
    if f != ogcache::Freshness::Fallback {
        let stored = og_response(out.body.clone(), cc, &ogcache::etag(&key), "HIT")?;
        let _ = cache.put(key.as_str(), stored).await;
    }
    serve(out.body, cc, &key, "MISS")
}

// ---------- viral cards ----------

async fn viral_png(env: &Env, t: &Target) -> Option<(Vec<u8>, bool)> {
    let (spec, durable) = match viral::extra_page(&t.id).filter(|_| t.kind == Kind::Pagina) {
        Some(s) => (s, true),
        None => {
            let page = viral::page_of(t)?;
            let today = cards::dia_brasilia(Date::now().as_millis() as f64);
            let srcs = crate::seo::pages::sources(&page, &today);
            let extra = viral::extra_sources(&page);
            let (d, x) = futures_util::join!(
                crate::seo::glue_seo::fetch_all(env, &srcs),
                crate::seo::glue_seo::fetch_all(env, &extra)
            );
            let now = crate::seo::iso_brasilia(Date::now().as_millis() as f64);
            let doc = crate::seo::pages::build(&page, &d, &now);
            let ok = !d.iter().chain(&x).any(|f| *f == Fetched::Failed);
            (viral::spec(&page, &d, &x, &doc), ok)
        }
    };
    og::viral_png(&resolve(spec).await)
        .ok()
        .map(|b| (b, durable))
}

async fn bytes(url: &str) -> Option<Vec<u8>> {
    match get(url, "image/*").await {
        Ok(mut r) if r.status_code() == 200 => r.bytes().await.ok().filter(|b| !b.is_empty()),
        _ => None,
    }
}

/// First URL answering 200 with an SVG or a known raster image.
async fn first_svg_or_image(urls: &[String]) -> Option<Vec<u8>> {
    for u in urls {
        if let Some(b) = bytes(u).await {
            let head = String::from_utf8_lossy(&b[..b.len().min(256)]).to_string();
            if foto::sniff(&b).is_some() || head.contains("<svg") {
                return Some(b);
            }
        }
    }
    None
}

async fn first_bytes(urls: &[String]) -> Option<Vec<u8>> {
    for u in urls {
        if let Some(b) = bytes(u).await.filter(|b| foto::sniff(b).is_some()) {
            return Some(b);
        }
    }
    None
}

async fn senado_lista() -> Option<Value> {
    let url = route::upstream_url(Upstream::Senado, foto::SENADO_LISTA, None, "");
    json_of(get(&url, "application/json").await).await
}

/// Author name -> senador in office, else deputado (last 4 legislatures). Exact names only.
async fn pessoa(chave: &str, senado: Option<&Value>) -> Option<foto::Pessoa> {
    if let Some(p) = senado.and_then(|l| foto::senador_por_nome(l, chave)) {
        return Some(p);
    }
    camara(&foto::nome_query(chave))
        .await
        .and_then(|r| foto::deputado_por_nome(&r, chave))
}

/// Photo bytes (+ resolved person for name lookups).
async fn foto_bytes(
    f: &foto::Foto,
    size: u32,
    senado: Option<&Value>,
) -> (Option<Vec<u8>>, Option<foto::Pessoa>) {
    let img = match f {
        foto::Foto::Url(u) => return (bytes(u).await, None),
        foto::Foto::Deputado(id) => foto::OgImg::Deputado(*id),
        foto::Foto::Senador(id) => foto::OgImg::Senador(*id),
        foto::Foto::Nome(c) => match pessoa(c, senado).await {
            Some(p) => {
                let b = first_bytes(&foto::candidates(&p.img(), size)).await;
                return (b, Some(p));
            }
            None => return (None, None),
        },
    };
    (first_bytes(&foto::candidates(&img, size)).await, None)
}

async fn face(f: viral::FaceSpec, senado: Option<&Value>) -> og::OgFace {
    let (photo, p) = match &f.foto {
        Some(x) => foto_bytes(x, 160, senado).await,
        None => (None, None),
    };
    match p {
        Some(p) => og::OgFace {
            detalhe: [p.tag(), f.detalhe]
                .into_iter()
                .filter(|x| !x.is_empty())
                .collect::<Vec<_>>()
                .join(" · "),
            nome: p.nome,
            photo,
        },
        None => og::OgFace {
            nome: f.nome,
            detalhe: f.detalhe,
            photo,
        },
    }
}

async fn resolve(v: viral::ViralSpec) -> og::OgViral {
    let by_name = |f: &Option<foto::Foto>| matches!(f, Some(foto::Foto::Nome(_)));
    let senado = if by_name(&v.retrato) || v.faces.iter().any(|f| by_name(&f.foto)) {
        senado_lista().await
    } else {
        None
    };
    let senado = senado.as_ref();
    let flag = async {
        match &v.uf {
            Some(u) => first_svg_or_image(&foto::flag_candidates(u)).await,
            None => None,
        }
    };
    let logo = async {
        match v
            .partido
            .as_ref()
            .filter(|p| p.bytes().all(|b| b.is_ascii_alphanumeric()))
        {
            Some(p) => first_bytes(&foto::logo_candidates(p)).await,
            None => None,
        }
    };
    let retrato = async {
        match &v.retrato {
            Some(f) => foto_bytes(f, 512, senado).await.0,
            None => None,
        }
    };
    let (faces, retrato, bandeira, logo) = futures_util::join!(
        futures_util::future::join_all(v.faces.iter().take(3).cloned().map(|f| face(f, senado))),
        retrato,
        flag,
        logo
    );
    og::OgViral {
        rotulo: v.rotulo,
        secundario: v.secundario,
        numero: v.numero,
        frase: v.frase,
        gancho: v.gancho,
        faces,
        faces_titulo: v.faces_titulo,
        retrato,
        selo: v.selo,
        logo,
        bandeira,
        placar: v.placar,
    }
}

/// `/og-img/*`: photo bytes, same-origin (no redirects).
async fn og_img(img: &foto::OgImg) -> Out {
    let found = match img {
        foto::OgImg::Nome(c) => match pessoa(c, senado_lista().await.as_ref()).await {
            Some(p) => first_bytes(&foto::candidates(&p.img(), 512)).await,
            None => None,
        },
        i => first_bytes(&foto::candidates(i, 512)).await,
    };
    match found {
        Some(body) => Out {
            status: 200,
            ctype: foto::sniff(&body).unwrap_or("image/jpeg").into(),
            body,
        },
        None => Out::error(404, "photo not found"),
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
    let v = og_version(env, t.kind).await;
    let m = meta::page_meta(t, origin, path, None, Some(&v));
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
