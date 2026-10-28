//! Request execution as a pure state machine: a handler either asks for upstream fetches
//! (`Step::Need`) or finishes (`Step::Done`). The wasm glue performs the fetches and calls
//! `run` again with the results, so every handler is tested natively with fixtures.
use super::registry::Req;
use super::render::{Body, Done};
use super::{busca, emendas, legis, ApiError};
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Fetch {
    /// ETL file, relative to the data base (`v1/...json`).
    Data(String),
    /// Static site asset (`/geo/municipios.json`).
    Asset(String),
    /// Câmara API v2, path + query after `/api/v2/`.
    Camara(String),
    /// Senado dados abertos, path + query after `/dadosabertos/`.
    Senado(String),
}

impl Fetch {
    pub fn url(&self, data_base: &str) -> String {
        match self {
            Fetch::Data(p) => format!("{data_base}{p}"),
            Fetch::Asset(p) => p.clone(),
            Fetch::Camara(p) => format!("{}{p}", super::CAMARA),
            Fetch::Senado(p) => format!("{}{p}", super::SENADO),
        }
    }
}

pub const META_FILE: &str = "v1/meta.json";

/// Request clock, from the glue. `today` is the civil date in Brasília.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Now {
    pub iso: String,
    pub today: String,
}

impl Now {
    pub fn year(&self) -> i64 {
        self.today
            .get(..4)
            .and_then(|y| y.parse().ok())
            .unwrap_or(2026)
    }
}

#[derive(Debug, Default)]
pub struct Ctx {
    got: BTreeMap<Fetch, Result<Vec<u8>, u16>>,
    pub now: Now,
}

pub enum Flow {
    Need(Vec<Fetch>),
    Fail(ApiError),
}

impl From<ApiError> for Flow {
    fn from(e: ApiError) -> Self {
        Flow::Fail(e)
    }
}

pub type R<T> = Result<T, Flow>;

pub fn upstream_err(status: u16) -> ApiError {
    match status {
        404 => ApiError::UpstreamNotFound,
        s => ApiError::Upstream(s),
    }
}

impl Ctx {
    pub fn new(now: Now) -> Self {
        Ctx {
            got: BTreeMap::new(),
            now,
        }
    }
    pub fn put(&mut self, f: Fetch, r: Result<Vec<u8>, u16>) {
        self.got.insert(f, r);
    }
    pub fn has(&self, f: &Fetch) -> bool {
        self.got.contains_key(f)
    }
    pub fn fetched(&self) -> impl Iterator<Item = &Fetch> {
        self.got.keys()
    }
    /// Asks for every missing fetch at once (they run in parallel).
    pub fn need(&self, fs: &[Fetch]) -> R<()> {
        let missing: Vec<Fetch> = fs.iter().filter(|f| !self.has(f)).cloned().collect();
        if missing.is_empty() {
            Ok(())
        } else {
            Err(Flow::Need(missing))
        }
    }
    pub fn raw(&self, f: &Fetch) -> R<&[u8]> {
        match self.got.get(f) {
            None => Err(Flow::Need(vec![f.clone()])),
            Some(Ok(b)) => Ok(b),
            Some(Err(s)) => Err(Flow::Fail(upstream_err(*s))),
        }
    }
    pub fn json(&self, f: &Fetch) -> R<Value> {
        serde_json::from_slice(self.raw(f)?).map_err(|_| Flow::Fail(ApiError::Upstream(0)))
    }
    /// Optional source: failures become `None`.
    pub fn opt(&self, f: &Fetch) -> R<Option<Value>> {
        match self.got.get(f) {
            None => Err(Flow::Need(vec![f.clone()])),
            Some(Ok(b)) => Ok(serde_json::from_slice(b).ok()),
            Some(Err(_)) => Ok(None),
        }
    }
}

#[derive(Debug)]
pub enum Step {
    Need(Vec<Fetch>),
    Done(Result<Done, ApiError>),
}

pub fn data(p: impl Into<String>) -> Fetch {
    Fetch::Data(p.into())
}
pub fn camara(p: impl Into<String>) -> Fetch {
    Fetch::Camara(p.into())
}
pub fn senado(p: impl Into<String>) -> Fetch {
    Fetch::Senado(p.into())
}

fn fonte(req: &Req, ctx: &Ctx) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut push = |s: String| {
        if !out.contains(&s) {
            out.push(s);
        }
    };
    for f in ctx.fetched() {
        match f {
            Fetch::Camara(_) | Fetch::Senado(_) => push(f.url("")),
            Fetch::Data(p) if p == META_FILE && req.op.id != "meta" => {}
            Fetch::Data(_) | Fetch::Asset(_) => {
                req.op.fonte.iter().for_each(|s| push(s.to_string()))
            }
        }
    }
    if ctx.fetched().next().is_none() {
        req.op.fonte.iter().for_each(|s| push(s.to_string()));
    }
    out
}

fn dispatch(req: &Req, ctx: &Ctx) -> R<Body> {
    match req.op.id {
        "index" => Ok(Body::Json(super::index())),
        "openapi" => Ok(Body::Json(super::openapi::spec())),
        "busca" => busca::run(req, ctx),
        id if emendas::handles(id) => emendas::run(req, ctx),
        _ => legis::run(req, ctx),
    }
}

pub fn run(req: &Req, ctx: &Ctx) -> Step {
    let body = match dispatch(req, ctx) {
        Ok(b) => b,
        Err(Flow::Need(fs)) => return Step::Need(fs),
        Err(Flow::Fail(e)) => return Step::Done(Err(e)),
    };
    let uses_data = ctx.fetched().any(|f| matches!(f, Fetch::Data(_)));
    let meta = data(META_FILE);
    if uses_data && !ctx.has(&meta) {
        return Step::Need(vec![meta]);
    }
    let atualizado = ctx
        .opt(&meta)
        .ok()
        .flatten()
        .and_then(|m| m.get("generatedAt")?.as_str().map(String::from))
        .unwrap_or_else(|| ctx.now.iso.clone());
    Step::Done(Ok(Done {
        body,
        fonte: fonte(req, ctx),
        atualizado,
    }))
}
