//! Handler output -> HTTP body: sort, paginate, sparse fields, CSV, envelope. Pure.
use super::registry::Req;
use super::{csv, envelope, envelope_raw, ApiError, Meta};
use serde_json::{json, Map, Value};
use std::cmp::Ordering;

pub const JSON: &str = "application/json; charset=utf-8";
pub const CSV: &str = "text/csv; charset=utf-8";

#[derive(Debug, Clone, PartialEq)]
pub struct Listing {
    pub rows: Vec<Value>,
    /// `None` when the upstream does not say.
    pub total: Option<usize>,
    /// Rows are already the requested page (upstream paging).
    pub paged: bool,
    /// `/v1/autores` legacy shape: `data = {total, limit, offset, itens}`.
    pub legacy: bool,
}

impl Listing {
    pub fn all(rows: Vec<Value>) -> Self {
        Listing {
            rows,
            total: None,
            paged: false,
            legacy: false,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum Body {
    /// Upstream JSON bytes, wrapped without parsing when possible.
    Raw(Vec<u8>),
    Json(Value),
    List(Listing),
}

#[derive(Debug, Clone, PartialEq)]
pub struct Done {
    pub body: Body,
    pub fonte: Vec<String>,
    pub atualizado: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Rendered {
    pub ctype: &'static str,
    pub bytes: Vec<u8>,
}

fn cmp_val(a: &Value, b: &Value) -> Ordering {
    match (a, b) {
        (Value::Number(x), Value::Number(y)) => x
            .as_f64()
            .unwrap_or(0.0)
            .partial_cmp(&y.as_f64().unwrap_or(0.0))
            .unwrap_or(Ordering::Equal),
        (Value::String(x), Value::String(y)) => {
            let k = |s: &str| crate::cards::chave_nome(s);
            k(x).cmp(&k(y)).then_with(|| x.cmp(y))
        }
        (Value::Bool(x), Value::Bool(y)) => x.cmp(y),
        _ => Ordering::Equal,
    }
}

/// Stable sort by a field; nulls/missing always last.
pub fn sort_rows(rows: &mut [Value], field: &str, desc: bool) {
    rows.sort_by(|a, b| {
        let (x, y) = (&a[field], &b[field]);
        match (x.is_null(), y.is_null()) {
            (true, true) => Ordering::Equal,
            (true, false) => Ordering::Greater,
            (false, true) => Ordering::Less,
            _ if desc => cmp_val(y, x),
            _ => cmp_val(x, y),
        }
    });
}

/// Keeps only `campos` (dotted paths allowed) of an object; arrays are projected per item.
pub fn project(v: &Value, campos: &[String]) -> Value {
    match v {
        Value::Array(a) => Value::Array(a.iter().map(|x| project(x, campos)).collect()),
        Value::Object(_) => {
            let mut out = Value::Object(Map::new());
            for c in campos {
                let ptr = format!("/{}", c.replace('.', "/"));
                if let Some(x) = v.pointer(&ptr) {
                    let mut cur = &mut out;
                    let parts: Vec<&str> = c.split('.').collect();
                    for (i, p) in parts.iter().enumerate() {
                        let m = match cur {
                            Value::Object(m) => m,
                            _ => break,
                        };
                        if i + 1 == parts.len() {
                            m.insert((*p).into(), x.clone());
                            break;
                        }
                        cur = m
                            .entry(p.to_string())
                            .or_insert_with(|| Value::Object(Map::new()));
                    }
                }
            }
            out
        }
        x => x.clone(),
    }
}

fn json_out(data: &Value, meta: &Meta) -> Rendered {
    Rendered {
        ctype: JSON,
        bytes: envelope(data, meta).to_string().into_bytes(),
    }
}

fn csv_out(rows: &[Value], order: Option<&[String]>) -> Rendered {
    Rendered {
        ctype: CSV,
        bytes: csv::to_csv(rows, order).into_bytes(),
    }
}

pub fn render(req: &Req, done: Done) -> Result<Rendered, ApiError> {
    let mut meta = Meta {
        fonte: done.fonte,
        atualizado: done.atualizado,
        paginacao: None,
    };
    let campos = req.campos.as_deref();
    let body = match done.body {
        Body::Raw(bytes) if !req.csv && campos.is_none() && !req.op.bare => {
            return envelope_raw(&bytes, &meta)
                .map(|bytes| Rendered { ctype: JSON, bytes })
                .ok_or(ApiError::Upstream(0));
        }
        Body::Raw(bytes) => {
            Body::Json(serde_json::from_slice(&bytes).map_err(|_| ApiError::Upstream(0))?)
        }
        b => b,
    };
    match body {
        Body::Json(v) if req.op.bare => Ok(Rendered {
            ctype: JSON,
            bytes: v.to_string().into_bytes(),
        }),
        Body::Json(v) if req.csv => {
            let rows = req
                .op
                .rows
                .and_then(|p| v.pointer(p))
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            let rows = campos.map_or(rows.clone(), |c| {
                rows.iter().map(|r| project(r, c)).collect()
            });
            Ok(csv_out(&rows, campos))
        }
        Body::Json(v) => Ok(json_out(
            &campos.map_or(v.clone(), |c| project(&v, c)),
            &meta,
        )),
        Body::List(mut l) => {
            let (limit, offset) = (req.limit.max(1), req.offset);
            if let Some((f, desc)) = &req.ordem {
                if !l.paged {
                    sort_rows(&mut l.rows, f, *desc);
                }
            }
            let (page, total): (Vec<Value>, Option<usize>) = if l.paged {
                (l.rows, l.total)
            } else {
                let t = l.rows.len();
                (
                    l.rows.into_iter().skip(offset).take(limit).collect(),
                    Some(t),
                )
            };
            let more = match total {
                Some(t) => offset + page.len() < t,
                None => page.len() >= limit,
            };
            let next = (more && offset + limit <= super::MAX_OFFSET)
                .then(|| req.canonical_at(offset + limit));
            meta.paginacao =
                Some(json!({ "total": total, "limit": limit, "offset": offset, "proximo": next }));
            let page: Vec<Value> = match campos {
                Some(c) => page.iter().map(|r| project(r, c)).collect(),
                None => page,
            };
            if req.csv {
                return Ok(csv_out(&page, campos));
            }
            let data = if l.legacy {
                json!({ "total": total, "limit": limit, "offset": offset, "itens": page })
            } else {
                Value::Array(page)
            };
            Ok(json_out(&data, &meta))
        }
        Body::Raw(_) => unreachable!("raw bodies are parsed above"),
    }
}
