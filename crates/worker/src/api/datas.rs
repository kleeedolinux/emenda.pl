//! Civil-date arithmetic on `YYYY-MM-DD` strings (proleptic Gregorian). Pure.

/// Days since 1970-01-01 (Howard Hinnant's algorithm).
pub fn days_from_civil(y: i64, m: u32, d: u32) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let m = m as i64;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d as i64 - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

pub fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

pub fn parse(s: &str) -> Option<i64> {
    let y = s.get(..4)?.parse().ok()?;
    let m = s.get(5..7)?.parse().ok()?;
    let d = s.get(8..10)?.parse().ok()?;
    Some(days_from_civil(y, m, d))
}

pub fn fmt(days: i64) -> String {
    let (y, m, d) = civil_from_days(days);
    format!("{y:04}-{m:02}-{d:02}")
}

pub fn add(s: &str, n: i64) -> Option<String> {
    parse(s).map(|d| fmt(d + n))
}

/// `b - a` in days.
pub fn diff(a: &str, b: &str) -> Option<i64> {
    Some(parse(b)? - parse(a)?)
}

/// 0 = Monday … 6 = Sunday.
pub fn weekday(s: &str) -> Option<u32> {
    parse(s).map(|d| (d + 3).rem_euclid(7) as u32)
}

/// Brasília civil date from a UTC ISO timestamp (UTC−3, no DST since 2019).
pub fn today_sp(utc_iso: &str) -> Option<String> {
    let day = parse(utc_iso)?;
    let h: i64 = utc_iso.get(11..13)?.parse().ok()?;
    Some(fmt(if h < 3 { day - 1 } else { day }))
}

/// Validates a `de..ate` window: defaults (`ate` = today, `de` = ate − `back`), order, max span.
pub fn janela(
    de: Option<&str>,
    ate: Option<&str>,
    today: &str,
    back: i64,
    forward: i64,
    max: i64,
) -> Result<(String, String), String> {
    let (de, ate) = match (de, ate) {
        (Some(d), Some(a)) => (d.to_string(), a.to_string()),
        (Some(d), None) => (d.to_string(), add(d, back.max(forward)).unwrap_or_default()),
        (None, Some(a)) => (add(a, -back).unwrap_or_default(), a.to_string()),
        (None, None) => (
            add(today, -back).unwrap_or_default(),
            add(today, forward).unwrap_or_default(),
        ),
    };
    match diff(&de, &ate) {
        Some(n) if n < 0 => Err("de: deve ser anterior a ate".into()),
        Some(n) if n > max => Err(format!("período: máximo {max} dias")),
        Some(_) => Ok((de, ate)),
        None => Err("de/ate: data AAAA-MM-DD".into()),
    }
}
