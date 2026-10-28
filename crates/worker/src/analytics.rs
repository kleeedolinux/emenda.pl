//! Audiência pública/anônima. Pure; storage lives in the `Analytics` Durable Object.
//! Raw visitor ids are never stored: only SHA-256(vid|day|secret), truncated.
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

pub const COOKIE: &str = "ep_vid";
pub const ONLINE_WINDOW_MS: u64 = 5 * 60 * 1000;
const BOT_MARKERS: [&str; 14] = [
    "bot",
    "crawl",
    "spider",
    "slurp",
    "facebookexternalhit",
    "preview",
    "headless",
    "curl",
    "wget",
    "python",
    "httpclient",
    "java/",
    "go-http",
    "lighthouse",
];

pub fn should_track(dnt: Option<&str>, ua: Option<&str>) -> bool {
    if dnt.map(str::trim) == Some("1") {
        return false;
    }
    let ua = ua.unwrap_or("").to_ascii_lowercase();
    !ua.is_empty() && !BOT_MARKERS.iter().any(|m| ua.contains(m))
}

pub fn vid_hex(bytes: [u8; 16]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Valid `ep_vid` from a Cookie header (32 lowercase hex chars).
pub fn cookie_vid(header: Option<&str>) -> Option<String> {
    header?
        .split(';')
        .filter_map(|p| p.trim().split_once('='))
        .find(|(k, _)| *k == COOKIE)
        .map(|(_, v)| v.to_string())
        .filter(|v| v.len() == 32 && v.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f')))
}

pub fn set_cookie(vid: &str) -> String {
    format!("{COOKIE}={vid}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax")
}

pub fn visitor_hash(vid: &str, day: &str, secret: &str) -> String {
    let d = Sha256::digest(format!("{vid}|{day}|{secret}").as_bytes());
    d[..16].iter().map(|b| format!("{b:02x}")).collect()
}

fn civil(days: i64) -> (i64, u32, u32) {
    // Howard Hinnant's days_from_civil inverse.
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (yoe + era * 400 + i64::from(m <= 2), m, d)
}

fn days_from_civil(y: i64, m: u32, d: u32) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let m = i64::from(m);
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + i64::from(d) - 1;
    era * 146_097 + yoe * 365 + yoe / 4 - yoe / 100 + doy - 719_468
}

pub(crate) fn fmt_day(days: i64) -> String {
    let (y, m, d) = civil(days);
    format!("{y:04}-{m:02}-{d:02}")
}

pub(crate) fn parse_day(s: &str) -> Option<i64> {
    let mut it = s.split('-');
    let (y, m, d) = (
        it.next()?.parse().ok()?,
        it.next()?.parse().ok()?,
        it.next()?.parse().ok()?,
    );
    Some(days_from_civil(y, m, d))
}

/// UTC day for a JS timestamp in ms.
pub fn day_string(ms: f64) -> String {
    fmt_day((ms / 86_400_000.0).floor() as i64)
}

/// The `n` days ending at `today`, oldest first.
pub fn days_back(today: &str, n: usize) -> Vec<String> {
    let t = parse_day(today).unwrap_or(0);
    (0..n as i64).rev().map(|i| fmt_day(t - i)).collect()
}

/// Hash -> last-seen ms. Pruned on every write.
#[derive(Debug, Default)]
pub struct Recent(BTreeMap<String, u64>);

impl Recent {
    pub fn touch(&mut self, hash: &str, now: u64) {
        self.prune(now);
        self.0.insert(hash.into(), now);
    }
    pub fn prune(&mut self, now: u64) {
        self.0
            .retain(|_, t| now.saturating_sub(*t) <= ONLINE_WINDOW_MS);
    }
    pub fn online(&self) -> usize {
        self.0.len()
    }
}

/// Count one new distinct visitor for `day`.
pub fn record_day(counts: &mut BTreeMap<String, u64>, day: &str) {
    *counts.entry(day.into()).or_default() += 1;
}

pub fn prune_counts(counts: &mut BTreeMap<String, u64>, today: &str, keep_days: usize) {
    let first = days_back(today, keep_days).swap_remove(0);
    counts.retain(|d, _| d.as_str() >= first.as_str());
}

#[derive(Debug, PartialEq, Eq)]
pub struct Stats {
    pub online: u64,
    pub hoje: u64,
    pub semana: u64,
    pub mes: u64,
    pub total: u64,
    pub serie: Vec<(String, u64)>,
}

/// semana/mes = sum of daily distinct visitors (daily salt prevents cross-day linking).
pub fn aggregate(counts: &BTreeMap<String, u64>, total: u64, online: u64, today: &str) -> Stats {
    let serie: Vec<(String, u64)> = days_back(today, 30)
        .into_iter()
        .map(|d| {
            let n = counts.get(&d).copied().unwrap_or(0);
            (d, n)
        })
        .collect();
    let sum = |n: usize| serie[30 - n..].iter().map(|(_, v)| v).sum();
    Stats {
        online,
        hoje: serie[29].1,
        semana: sum(7),
        mes: sum(30),
        total,
        serie,
    }
}

impl Stats {
    pub fn to_json(&self) -> Value {
        json!({
            "online": self.online, "hoje": self.hoje, "semana": self.semana, "mes": self.mes, "total": self.total,
            "serie": self.serie.iter().map(|(d, v)| json!({"dia": d, "visitantes": v})).collect::<Vec<_>>(),
        })
    }
}
