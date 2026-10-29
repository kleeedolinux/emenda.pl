//! Handlers over the static ETL files (`v1/*.json`): emendas, municípios, autores, Pix,
//! pagamentos, rankings and gastos. Pure.
use super::plan::{data, Ctx, Fetch, Flow, R};
use super::registry::Req;
use super::render::{Body, Listing};
use super::ApiError;
use crate::cards::chave_nome;
use serde_json::{json, Value};

const OWN: &[&str] = &[
    "meta",
    "brasil",
    "uf",
    "municipio",
    "autor",
    "pix",
    "pix_ano",
    "feed",
    "feed_mes",
    "novidades",
    "abertas",
    "rankings",
    "gastos_deputado",
    "gastos_senador",
    "deputado_gastos",
    "senador_gastos",
    "ufs",
    "municipios",
    "municipio_emendas",
    "municipio_favorecidos",
    "municipio_convenios",
    "municipio_prefeito",
    "autores",
    "autor_emendas",
    "autor_favorecidos",
    "emendas",
    "gastos_ranking",
];

pub fn handles(id: &str) -> bool {
    OWN.contains(&id)
}

pub const MUNICIPIOS_ASSET: &str = "/geo/municipios.json";

fn arr(v: &Value, ptr: &str) -> Vec<Value> {
    v.pointer(ptr)
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

fn with_url(mut v: Value, url: String) -> Value {
    if let Value::Object(m) = &mut v {
        m.insert("url".into(), url.into());
    }
    v
}

/// Data file for a raw (pass-through) op.
fn raw_file(req: &Req) -> Option<String> {
    let a = |n| req.arg(n).unwrap_or_default();
    Some(match req.op.id {
        "meta" => "v1/meta.json".into(),
        "brasil" => "v1/brasil.json".into(),
        "uf" => format!("v1/uf/{}.json", a("uf")),
        "municipio" => format!("v1/municipio/{}.json", a("ibge")),
        "autor" => format!("v1/autor/{}.json", a("codigo")),
        "pix" => "v1/pix.json".into(),
        "pix_ano" => format!("v1/pix/{}.json", a("ano")),
        "feed" => "v1/feed.json".into(),
        "feed_mes" => format!("v1/feed/{}.json", a("mes")),
        "novidades" => "v1/novidades.json".into(),
        "abertas" => "v1/abertas.json".into(),
        "gastos_deputado" | "deputado_gastos" => format!("v1/gastos/deputado/{}.json", a("id")),
        "gastos_senador" | "senador_gastos" => format!("v1/gastos/senador/{}.json", a("codigo")),
        _ => return None,
    })
}

/// Filters shared by every emenda list (`autor`, `municipio`, `uf`, `tipo`, `ano`, `q`).
#[derive(Debug, Default, Clone)]
pub struct Filtro {
    pub ano: Option<i64>,
    pub tipo: Option<String>,
    pub uf: Option<String>,
    pub ibge: Option<String>,
    pub autor: Option<String>,
    pub q: Option<String>,
}

impl Filtro {
    pub fn from_req(req: &Req) -> Self {
        Filtro {
            ano: req.int("ano"),
            tipo: req.arg("tipo").map(String::from),
            uf: req.arg("uf").map(String::from),
            ibge: req.arg("municipio").map(String::from),
            autor: req.arg("autor").map(String::from),
            q: req.arg("q").map(chave_nome).filter(|q| !q.is_empty()),
        }
    }
    pub fn keep(&self, e: &Value) -> bool {
        let s = |p: &str| e.pointer(p).and_then(Value::as_str);
        self.ano.is_none_or(|a| e["ano"].as_i64() == Some(a))
            && self.tipo.as_deref().is_none_or(|t| s("/tipo") == Some(t))
            && self.uf.as_deref().is_none_or(|u| s("/uf") == Some(u))
            && self.ibge.as_deref().is_none_or(|i| s("/ibge") == Some(i))
            && self
                .autor
                .as_deref()
                .is_none_or(|c| s("/autor/codigo") == Some(c))
            && self.q.as_deref().is_none_or(|q| {
                [
                    "/funcao",
                    "/subfuncao",
                    "/programa",
                    "/acao",
                    "/localidade",
                    "/autor/nome",
                ]
                .iter()
                .filter_map(|p| s(p))
                .any(|x| chave_nome(x).contains(q))
            })
    }
    pub fn apply(&self, rows: Vec<Value>) -> Vec<Value> {
        rows.into_iter().filter(|e| self.keep(e)).collect()
    }
}

/// Emendas of an author file (also used for deputados/senadores).
pub fn emendas_autor(ctx: &Ctx, codigo: &str, f: &Filtro) -> R<Body> {
    let a = ctx.json(&data(format!("v1/autor/{codigo}.json")))?;
    Ok(Body::List(Listing::all(f.apply(arr(&a, "/emendas")))))
}

fn pix_itens(ano: i64, p: &Value) -> Vec<Value> {
    arr(p, "/itens")
        .into_iter()
        .map(|mut e| {
            if let Value::Object(m) = &mut e {
                m.entry("ano").or_insert(ano.into());
                m.entry("tipo").or_insert("pix".into());
            }
            e
        })
        .collect()
}

/// `autores.json` filter: digits = código exact; otherwise name-key substring.
pub fn autores_rows(all: &Value, q: Option<&str>) -> Vec<Value> {
    let key = q.map(|q| {
        if q.bytes().all(|b| b.is_ascii_digit()) {
            q.to_string()
        } else {
            chave_nome(q)
        }
    });
    all.as_array()
        .map_or(&[][..], Vec::as_slice)
        .iter()
        .filter(|a| match key.as_deref() {
            None | Some("") => true,
            Some(k) if k.bytes().all(|b| b.is_ascii_digit()) => {
                a.get("codigo").and_then(Value::as_str) == Some(k)
            }
            Some(k) => a
                .get("chave")
                .and_then(Value::as_str)
                .is_some_and(|c| c.contains(k)),
        })
        .map(|a| {
            let c = a.get("codigo").and_then(Value::as_str).unwrap_or_default();
            with_url(a.clone(), format!("/v1/autores/{c}"))
        })
        .collect()
}

/// `municipios.json` (`[[ibge, nome, uf], …]`) -> rows.
pub fn municipios_rows(all: &Value, uf: Option<&str>, q: Option<&str>) -> Vec<Value> {
    let q = q.map(chave_nome).filter(|q| !q.is_empty());
    all.as_array()
        .map_or(&[][..], Vec::as_slice)
        .iter()
        .filter_map(|m| {
            let ibge = match &m[0] {
                Value::Number(n) => n.to_string(),
                Value::String(s) => s.clone(),
                _ => return None,
            };
            let nome = m[1].as_str()?;
            let u = m[2].as_str()?;
            if uf.is_some_and(|x| x != u) || q.as_deref().is_some_and(|q| !chave_nome(nome).contains(q)) {
                return None;
            }
            Some(json!({ "ibge": ibge, "nome": nome, "uf": u, "url": format!("/v1/municipios/{ibge}") }))
        })
        .collect()
}

fn gastos_rows(rk: &Value, req: &Req) -> Vec<Value> {
    let ano = req.arg("ano");
    let casa = req.arg("casa");
    let uf = req.arg("uf");
    let partido = req.arg("partido").map(str::to_uppercase);
    let ex = req.flag("exercicio");
    arr(rk, "/parlamentares")
        .into_iter()
        .filter(|p| {
            let s = |k: &str| p[k].as_str();
            casa.is_none_or(|c| s("casa") == Some(c))
                && uf.is_none_or(|u| s("uf") == Some(u))
                && partido
                    .as_deref()
                    .is_none_or(|x| s("partido").map(str::to_uppercase).as_deref() == Some(x))
                && ex.is_none_or(|e| p["emExercicio"].as_bool() == Some(e))
        })
        .map(|mut p| {
            let id = p["id"].as_str().unwrap_or_default().to_string();
            let path = if p["casa"] == "senado" {
                "senadores"
            } else {
                "deputados"
            };
            if let Some(a) = ano {
                let v = p
                    .pointer(&format!("/porAno/{a}"))
                    .cloned()
                    .unwrap_or(0.into());
                p["valorAno"] = v;
            }
            with_url(p, format!("/v1/gastos/{path}/{id}"))
        })
        .collect()
}

pub fn run(req: &Req, ctx: &Ctx) -> R<Body> {
    if let Some(f) = raw_file(req) {
        return Ok(Body::Raw(ctx.raw(&data(f))?.to_vec()));
    }
    let a = |n| req.arg(n).unwrap_or_default();
    let list = |rows| Ok(Body::List(Listing::all(rows)));
    match req.op.id {
        "ufs" => {
            let b = ctx.json(&data("v1/brasil.json"))?;
            list(
                arr(&b, "/porUf")
                    .into_iter()
                    .map(|u| {
                        let uf = u["uf"].as_str().unwrap_or_default().to_string();
                        with_url(u, format!("/v1/ufs/{uf}"))
                    })
                    .collect(),
            )
        }
        "municipios" => {
            let m = ctx.json(&Fetch::Asset(MUNICIPIOS_ASSET.into()))?;
            list(municipios_rows(&m, req.arg("uf"), req.arg("q")))
        }
        "municipio_emendas"
        | "municipio_favorecidos"
        | "municipio_convenios"
        | "municipio_prefeito" => {
            let m = ctx.json(&data(format!("v1/municipio/{}.json", a("ibge"))))?;
            match req.op.id {
                "municipio_emendas" => list(Filtro::from_req(req).apply(arr(&m, "/emendas"))),
                "municipio_favorecidos" => list(arr(&m, "/favorecidos")),
                "municipio_convenios" => list(arr(&m, "/convenios")),
                _ => Ok(Body::Json(m["prefeito"].clone())),
            }
        }
        "autores" => {
            let all = ctx.json(&data("v1/autores.json"))?;
            let mut l = Listing::all(autores_rows(&all, req.arg("q")));
            l.legacy = true;
            Ok(Body::List(l))
        }
        "autor_emendas" => emendas_autor(ctx, a("codigo"), &Filtro::from_req(req)),
        "autor_favorecidos" => {
            let x = ctx.json(&data(format!("v1/autor/{}.json", a("codigo"))))?;
            list(arr(&x, "/favorecidos"))
        }
        "emendas" => {
            let f = Filtro::from_req(req);
            match (req.arg("autor"), req.arg("municipio"), req.int("ano")) {
                (Some(c), _, _) => emendas_autor(ctx, c, &f),
                (None, Some(m), _) => {
                    let x = ctx.json(&data(format!("v1/municipio/{m}.json")))?;
                    list(f.apply(arr(&x, "/emendas")))
                }
                (None, None, Some(ano)) if req.arg("tipo") == Some("pix") => {
                    let p = ctx.json(&data(format!("v1/pix/{ano}.json")))?;
                    list(f.apply(pix_itens(ano, &p)))
                }
                _ => Err(Flow::Fail(ApiError::BadRequest(
                    "informe autor, municipio ou tipo=pix&ano= (não há índice nacional linha a linha; veja /v1/brasil e /v1/ufs/{UF})".into(),
                ))),
            }
        }
        "rankings" => {
            let r = ctx.json(&data("v1/rankings.json"))?;
            match req.arg("janela") {
                None => Ok(Body::Json(r)),
                Some(j) => arr(&r, "/janelas")
                    .into_iter()
                    .find(|x| x["janela"] == j)
                    .map(|mut x| {
                        x["ultimoMes"] = r["ultimoMes"].clone();
                        Body::Json(x)
                    })
                    .ok_or(Flow::Fail(ApiError::NotFound)),
            }
        }
        "gastos_ranking" => {
            let rk = ctx.json(&data("v1/gastos/ranking.json"))?;
            list(gastos_rows(&rk, req))
        }
        _ => Err(Flow::Fail(ApiError::NotFound)),
    }
}
