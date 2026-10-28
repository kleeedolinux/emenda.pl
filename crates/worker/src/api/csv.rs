//! JSON rows -> CSV (RFC 4180, CRLF). Nested objects flatten to dotted columns; arrays are
//! JSON-encoded. Strings that a spreadsheet would run as a formula get a leading `'`. Pure.
use serde_json::{Map, Value};

fn flatten(prefix: &str, v: &Value, out: &mut Vec<(String, String)>) {
    match v {
        Value::Object(m) => {
            for (k, x) in m {
                let key = if prefix.is_empty() {
                    k.clone()
                } else {
                    format!("{prefix}.{k}")
                };
                flatten(&key, x, out);
            }
        }
        _ => out.push((prefix.to_string(), cell(v))),
    }
}

fn cell(v: &Value) -> String {
    match v {
        Value::Null => String::new(),
        Value::String(s) if s.starts_with(['=', '+', '@', '\t', '\r']) => format!("'{s}"),
        Value::String(s) => s.clone(),
        Value::Array(_) | Value::Object(_) => v.to_string(),
        x => x.to_string(),
    }
}

fn quote(s: &str) -> String {
    if s.contains([',', '"', '\n', '\r']) {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

/// Columns follow `order` (a column `a.b` belongs to `a`), then first appearance.
pub fn to_csv(rows: &[Value], order: Option<&[String]>) -> String {
    let mut cols: Vec<String> = Vec::new();
    let mut flat: Vec<Map<String, Value>> = Vec::with_capacity(rows.len());
    for r in rows {
        let mut cells = Vec::new();
        match r {
            Value::Object(_) => flatten("", r, &mut cells),
            x => cells.push(("valor".into(), cell(x))),
        }
        let mut m = Map::new();
        for (k, v) in cells {
            if !cols.contains(&k) {
                cols.push(k.clone());
            }
            m.insert(k, Value::String(v));
        }
        flat.push(m);
    }
    if let Some(o) = order {
        let rank = |c: &String| {
            o.iter()
                .position(|f| c == f || c.starts_with(&format!("{f}.")))
                .unwrap_or(usize::MAX)
        };
        cols.sort_by_key(rank);
    }
    let mut out = String::new();
    out.push_str(&cols.iter().map(|c| quote(c)).collect::<Vec<_>>().join(","));
    out.push_str("\r\n");
    for m in &flat {
        let line: Vec<String> = cols
            .iter()
            .map(|c| quote(m.get(c).and_then(Value::as_str).unwrap_or("")))
            .collect();
        out.push_str(&line.join(","));
        out.push_str("\r\n");
    }
    out
}
