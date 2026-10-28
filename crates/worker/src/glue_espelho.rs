//! wasm32 glue do espelho: /api/{camara,senado}/* servido do snapshot (`v1/espelho`) com a API
//! ao vivo como reserva. Regras puras em `crate::espelho`.
use crate::cards;
use crate::espelho::{self, Casa, Montado};
use crate::glue::{data_fetch, proxy, respond, Out};
use crate::route::{self, CacheClass, Upstream};
use futures_util::future::join_all;
use serde_json::Value;
use std::cell::RefCell;
use worker::*;

/// Cache do snapshot servido só porque a API ao vivo falhou (endpoint sensível ao tempo).
const CC_RESERVA: &str = "public, max-age=60, s-maxage=300, stale-while-revalidate=86400";
const META_TTL_MS: f64 = 5.0 * 60_000.0;

thread_local! {
    static META: RefCell<Option<(f64, Option<String>)>> = const { RefCell::new(None) };
}

struct Saida {
    out: Out,
    fonte: &'static str,
    gerado: Option<String>,
    total: Option<usize>,
    reserva: bool,
}

async fn json(env: &Env, rest: &str) -> Option<Value> {
    let mut r = data_fetch(env, rest).await.ok()?;
    let html = r
        .headers()
        .get("Content-Type")
        .ok()
        .flatten()
        .is_some_and(|c| c.starts_with("text/html"));
    if r.status_code() != 200 || html {
        return None;
    }
    r.json().await.ok()
}

/// `gerado` de `v1/espelho/meta.json` (memorizado 5 min por isolate).
async fn gerado(env: &Env, agora: f64) -> Option<String> {
    if let Some((t, g)) = META.with(|m| m.borrow().clone()) {
        if agora - t < META_TTL_MS {
            return g;
        }
    }
    let g = json(env, espelho::META)
        .await
        .and_then(|m| m.get("gerado").and_then(Value::as_str).map(String::from));
    META.with(|m| *m.borrow_mut() = Some((agora, g.clone())));
    g
}

async fn snapshot(env: &Env, plano: &espelho::Plano) -> Option<Montado> {
    let urls: Vec<String> = plano
        .chaves()
        .iter()
        .map(|k| format!("{}{k}", espelho::RAIZ))
        .collect();
    let docs = join_all(urls.iter().map(|u| json(env, u))).await;
    let docs: Option<Vec<Value>> = docs.into_iter().collect();
    espelho::montar(plano, docs?)
}

fn de_snapshot(m: Montado, gerado: Option<String>, reserva: bool) -> Saida {
    Saida {
        out: Out::json(200, &m.corpo),
        fonte: "espelho",
        gerado,
        total: m.total,
        reserva,
    }
}

fn ao_vivo(out: Out, gerado: Option<String>) -> Saida {
    Saida {
        out,
        fonte: "ao-vivo",
        gerado,
        total: None,
        reserva: false,
    }
}

async fn produzir(env: &Env, up: Upstream, rest: &str, query: Option<&str>) -> Saida {
    let casa = if up == Upstream::Camara {
        Casa::Camara
    } else {
        Casa::Senado
    };
    let agora = Date::now().as_millis() as f64;
    let hoje = cards::dia_brasilia(agora);
    let Some(res) = espelho::resolver(casa, rest, query, &hoje) else {
        return ao_vivo(proxy(env, up, rest, query).await, None);
    };
    let g = gerado(env, agora).await;
    if espelho::ao_vivo_primeiro(res.sensivel, g.as_deref(), agora) {
        let vivo = proxy(env, up, rest, query).await;
        if vivo.status == 200 {
            return ao_vivo(vivo, g);
        }
        return match snapshot(env, &res.plano).await {
            Some(m) => de_snapshot(m, g, true),
            None => ao_vivo(vivo, g),
        };
    }
    match snapshot(env, &res.plano).await {
        Some(m) => de_snapshot(m, g, false),
        None => ao_vivo(proxy(env, up, rest, query).await, g),
    }
}

const COPIADOS: [&str; 5] = [
    "Content-Type",
    "Cache-Control",
    "x-emenda-fonte",
    "x-emenda-espelho-data",
    "x-total-count",
];

/// GET /api/camara/* e /api/senado/*: snapshot primeiro, API ao vivo como reserva; cache de borda.
pub(crate) async fn handle(
    env: &Env,
    up: Upstream,
    rest: &str,
    query: Option<&str>,
    key: &str,
    class: CacheClass,
) -> Result<Response> {
    let cache = Cache::default();
    if let Ok(Some(mut hit)) = cache.get(key, true).await {
        let body = hit.bytes().await?;
        let mut r = Response::from_bytes(body)?;
        for h in COPIADOS {
            if let Some(v) = hit.headers().get(h)? {
                r.headers_mut().set(h, &v)?;
            }
        }
        r.headers_mut().set("x-emenda-cache", "HIT")?;
        return Ok(r);
    }
    let s = produzir(env, up, rest, query).await;
    let ok = s.out.status == 200;
    let mut r = respond(s.out)?;
    let h = r.headers_mut();
    h.set("x-emenda-fonte", s.fonte)?;
    if let Some(g) = &s.gerado {
        h.set("x-emenda-espelho-data", g)?;
    }
    if let Some(t) = s.total {
        h.set("x-total-count", &t.to_string())?;
    }
    h.set("x-emenda-cache", "MISS")?;
    if !ok {
        h.set("Cache-Control", "no-store")?;
        return Ok(r);
    }
    let cc = if s.reserva {
        CC_RESERVA.to_string()
    } else {
        route::cache_control(class)
    };
    h.set("Cache-Control", &cc)?;
    let _ = cache.put(key, r.cloned()?).await;
    Ok(r)
}
