//! OG image caching by versioned URL. Pure.
//!
//! Pages link `/og/<kind>/<id>.png?v=<version>`; the version changes when the data does
//! (ETL `meta.json` `generatedAt`; agenda: hourly bucket), so a versioned image is immutable
//! for the edge (`caches.default`), browsers and social crawlers. Requests without `v`, or
//! with a stale/junk `v`, still render but get a short TTL under the path-only cache key.
use crate::cards::Kind;
use serde_json::Value;

/// Bump when card layouts change, so versioned URLs change too.
pub const RENDER_REV: &str = "2";
/// Versioned URL matching the current data.
pub const IMMUTABLE: &str = "public, max-age=31536000, immutable";
/// No `v` or a mismatched `v`.
pub const SHORT: &str = "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";
/// Render fell back after an upstream failure: never pin it.
pub const FALLBACK: &str = "public, max-age=60";

fn clean(s: &str) -> String {
    let mapped: String = s
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' {
                c
            } else {
                ' '
            }
        })
        .collect();
    mapped.split_whitespace().collect::<Vec<_>>().join("-")
}

/// Brasília local time (UTC-3).
fn local_ms(now_ms: f64) -> f64 {
    now_ms - 3.0 * 3_600_000.0
}

/// ETL version from `meta.json` (`generatedAt`); daily bucket when unavailable.
pub fn data_version(meta: Option<&Value>, now_ms: f64) -> String {
    meta.and_then(|m| m.get("generatedAt"))
        .and_then(Value::as_str)
        .map(clean)
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| format!("dia-{}", crate::analytics::day_string(local_ms(now_ms))))
}

/// `v` for an OG kind: `{rev}-{data}`; agenda `{rev}-agenda-YYYY-MM-DDTHH` (Brasília).
pub fn og_version(kind: Kind, data_version: &str, now_ms: f64) -> String {
    if kind == Kind::Agenda {
        let l = local_ms(now_ms);
        let hour = ((l / 3_600_000.0).floor() as i64).rem_euclid(24);
        return format!(
            "{RENDER_REV}-agenda-{}T{hour:02}",
            crate::analytics::day_string(l)
        );
    }
    format!("{RENDER_REV}-{data_version}")
}

/// `/og/x/1.png` + `v` -> `/og/x/1.png?v=...`.
pub fn with_version(og_path: &str, v: &str) -> String {
    format!("{og_path}?v={v}")
}

/// Valid `v` from a raw query (other params are ignored).
pub fn request_version(query: Option<&str>) -> Option<String> {
    let v = query?
        .split('&')
        .filter_map(|p| p.split_once('='))
        .find(|(k, _)| *k == "v")?
        .1;
    let ok =
        !v.is_empty() && v.len() <= 64 && v.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-');
    ok.then(|| v.to_string())
}

/// Edge cache key: origin + path, plus `v` only for versioned entries. Junk params never count.
pub fn cache_key(origin: &str, path: &str, v: Option<&str>) -> String {
    let base = format!("{}{path}", origin.trim_end_matches('/'));
    match v {
        Some(v) => with_version(&base, v),
        None => base,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Freshness {
    /// `v` matches the current version and the render is complete.
    Versioned,
    Unversioned,
    Fallback,
}

pub fn freshness(request_v: Option<&str>, current_v: &str, durable: bool) -> Freshness {
    match (durable, request_v) {
        (false, _) => Freshness::Fallback,
        (true, Some(v)) if v == current_v => Freshness::Versioned,
        _ => Freshness::Unversioned,
    }
}

pub fn cache_control(f: Freshness) -> &'static str {
    match f {
        Freshness::Versioned => IMMUTABLE,
        Freshness::Unversioned => SHORT,
        Freshness::Fallback => FALLBACK,
    }
}

/// Strong ETag from the cache key (FNV-1a 64).
pub fn etag(key: &str) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in key.bytes() {
        h ^= u64::from(b);
        h = h.wrapping_mul(0x0100_0000_01b3);
    }
    format!("\"{h:016x}\"")
}
