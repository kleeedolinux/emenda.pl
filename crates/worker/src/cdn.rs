//! Asset mirror at `cdn.emenda.online` (and `/cdn/*` on any host): branch `assets` on GitHub raw. Pure.
use serde_json::Value;

pub const RAW_BASE: &str = "https://raw.githubusercontent.com/kleeedolinux/emenda.pl/assets/";
pub const ORIGIN: &str = "https://cdn.emenda.online/";
/// Paths are stable (not content-hashed): 30 days + 7 days stale.
pub const CACHE_CONTROL: &str =
    "public, max-age=2592000, s-maxage=2592000, stale-while-revalidate=604800";
/// `manifest.json` changes daily.
pub const CACHE_CONTROL_MANIFEST: &str =
    "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";
/// Redirects to upstream and 404s (the next mirror run may fill the path).
pub const CACHE_CONTROL_FALLBACK: &str = "public, max-age=300";
pub const SVG_CSP: &str = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

/// Mirror path (no leading slash) when the request targets the CDN.
pub fn scope<'a>(host: &str, path: &'a str) -> Option<&'a str> {
    if host.starts_with("cdn.") {
        return Some(path.trim_start_matches('/'));
    }
    if path == "/cdn" {
        return Some("");
    }
    path.strip_prefix("/cdn/")
}

/// Content type for a valid mirror path; None -> 404.
pub fn content_type(path: &str) -> Option<&'static str> {
    let ok = !path.is_empty()
        && path.split('/').all(|s| {
            !s.is_empty()
                && s != "."
                && s != ".."
                && s.bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"-_.".contains(&b))
        });
    if !ok {
        return None;
    }
    let ext = path.rsplit_once('.')?.1;
    Some(match ext {
        "webp" => "image/webp",
        "jpg" => "image/jpeg",
        "png" => "image/png",
        "svg" => "image/svg+xml",
        "pdf" => "application/pdf",
        "json" => "application/json; charset=utf-8",
        _ => return None,
    })
}

pub fn upstream(path: &str) -> String {
    format!("{RAW_BASE}{path}")
}

/// Same key for `cdn.*` and `/cdn/*`.
pub fn cache_key(path: &str) -> String {
    format!("{ORIGIN}{path}")
}

pub fn cache_control(path: &str) -> &'static str {
    if path == "manifest.json" {
        CACHE_CONTROL_MANIFEST
    } else {
        CACHE_CONTROL
    }
}

/// Headers of a 200 (ETag is passed through by the glue).
pub fn headers(path: &str) -> Vec<(&'static str, &'static str)> {
    let mut h = vec![
        (
            "Content-Type",
            content_type(path).unwrap_or("application/octet-stream"),
        ),
        ("Cache-Control", cache_control(path)),
        ("Access-Control-Allow-Origin", "*"),
        ("X-Content-Type-Options", "nosniff"),
        ("Cross-Origin-Resource-Policy", "cross-origin"),
        ("Referrer-Policy", "strict-origin-when-cross-origin"),
    ];
    if path.ends_with(".svg") {
        h.push(("Content-Security-Policy", SVG_CSP));
    }
    h
}

/// What to do when the mirror has no file yet.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Fallback {
    /// 302 to the official URL.
    Redirect(String),
    /// Look up `dados.{campo}` of a Câmara API path, then 302.
    Camara { path: String, campo: &'static str },
}

fn digits(s: &str) -> Option<&str> {
    (!s.is_empty() && s.len() <= 12 && s.bytes().all(|b| b.is_ascii_digit())).then_some(s)
}

pub fn fallback(path: &str) -> Option<Fallback> {
    let (dir, file) = path.rsplit_once('/')?;
    let stem = file.rsplit_once('.')?.0;
    let foto_id = || digits(stem.rsplit_once('-')?.0);
    Some(match dir {
        "foto/deputado" => Fallback::Redirect(format!(
            "https://www.camara.leg.br/internet/deputado/bandep/{}.jpg",
            foto_id()?
        )),
        "foto/senador" => Fallback::Redirect(format!(
            "https://www.senado.leg.br/senadores/img/fotos-oficiais/senador{}.jpg",
            foto_id()?
        )),
        "logo/partido" if file.ends_with(".webp") => Fallback::Redirect(format!(
            "https://www.camara.leg.br/internet/Deputado/img/partidos/{stem}.gif"
        )),
        "pdf/proposicao" => Fallback::Camara {
            path: format!("proposicoes/{}", digits(stem)?),
            campo: "urlInteiroTeor",
        },
        "pdf/frente" => Fallback::Camara {
            path: format!("frentes/{}", digits(stem)?),
            campo: "urlDocumento",
        },
        _ => return None,
    })
}

/// `dados.{campo}` as an https URL.
pub fn campo_url(v: &Value, campo: &str) -> Option<String> {
    let u = v["dados"][campo].as_str()?.trim();
    if let Some(r) = u.strip_prefix("http://") {
        return Some(format!("https://{r}"));
    }
    u.starts_with("https://").then(|| u.to_string())
}

/// `If-None-Match` (weak comparison) against the stored ETag.
pub fn etag_match(if_none_match: Option<&str>, etag: &str) -> bool {
    let strip = |s: &str| s.trim().trim_start_matches("W/").to_string();
    let e = strip(etag);
    if_none_match.is_some_and(|h| h.split(',').any(|t| t.trim() == "*" || strip(t) == e))
}
