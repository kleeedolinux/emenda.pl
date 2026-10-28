//! Unified search (`/v1/busca`): autores, deputados, senadores, municípios, UFs, partidos,
//! federações and proposições ("PL 2630/2020"). Pure.
use super::emendas::{autores_rows, municipios_rows, MUNICIPIOS_ASSET};
use super::legis::FEDERACOES;
use super::map;
use super::plan::{camara, data, senado, Ctx, Fetch, R};
use super::registry::Req;
use super::render::Body;
use crate::cards::chave_nome;
use serde_json::{json, Value};

const UFS: &[(&str, &str)] = &[
    ("AC", "Acre"),
    ("AL", "Alagoas"),
    ("AP", "Amapá"),
    ("AM", "Amazonas"),
    ("BA", "Bahia"),
    ("CE", "Ceará"),
    ("DF", "Distrito Federal"),
    ("ES", "Espírito Santo"),
    ("GO", "Goiás"),
    ("MA", "Maranhão"),
    ("MT", "Mato Grosso"),
    ("MS", "Mato Grosso do Sul"),
    ("MG", "Minas Gerais"),
    ("PA", "Pará"),
    ("PB", "Paraíba"),
    ("PR", "Paraná"),
    ("PE", "Pernambuco"),
    ("PI", "Piauí"),
    ("RJ", "Rio de Janeiro"),
    ("RN", "Rio Grande do Norte"),
    ("RS", "Rio Grande do Sul"),
    ("RO", "Rondônia"),
    ("RR", "Roraima"),
    ("SC", "Santa Catarina"),
    ("SP", "São Paulo"),
    ("SE", "Sergipe"),
    ("TO", "Tocantins"),
];

/// "PL 2630/2020", "pec 45 2019", "MPV1303/2025" -> (sigla, número, ano).
pub fn sigla_proposicao(q: &str) -> Option<(String, u32, u32)> {
    let t = q.trim().to_ascii_uppercase();
    let sigla: String = t.chars().take_while(|c| c.is_ascii_alphabetic()).collect();
    if !(2..=6).contains(&sigla.len()) {
        return None;
    }
    let rest = &t[sigla.len()..];
    let nums: Vec<&str> = rest
        .split(|c: char| !c.is_ascii_digit())
        .filter(|s| !s.is_empty())
        .collect();
    match nums.as_slice() {
        [n, a] if a.len() == 4 => Some((sigla, n.parse().ok()?, a.parse().ok()?)),
        [n, a] if a.len() == 2 => Some((sigla, n.parse().ok()?, 2000 + a.parse::<u32>().ok()?)),
        _ => None,
    }
}

fn take(v: Vec<Value>, n: usize) -> Value {
    Value::Array(v.into_iter().take(n).collect())
}

pub fn run(req: &Req, ctx: &Ctx) -> R<Body> {
    let q = req.arg("q").unwrap_or_default();
    let n = req.int("limit").unwrap_or(10) as usize;
    let key = chave_nome(q);
    let prop = sigla_proposicao(q);
    let fa = data("v1/autores.json");
    let fm = Fetch::Asset(MUNICIPIOS_ASSET.into());
    let fd = camara("deputados?ordem=ASC&ordenarPor=nome");
    let fs = senado("senador/lista/atual");
    let fp = prop
        .as_ref()
        .map(|(s, n, a)| camara(format!("proposicoes?siglaTipo={s}&numero={n}&ano={a}")));
    let mut want = vec![fa.clone(), fm.clone(), fd.clone(), fs.clone()];
    want.extend(fp.clone());
    ctx.need(&want)?;
    let has = |nome: &Value| nome.as_str().is_some_and(|x| chave_nome(x).contains(&key));
    let autores = ctx
        .opt(&fa)?
        .map(|a| autores_rows(&a, Some(q)))
        .unwrap_or_default();
    let municipios = ctx
        .opt(&fm)?
        .map(|m| municipios_rows(&m, None, Some(q)))
        .unwrap_or_default();
    let deputados: Vec<Value> = ctx
        .opt(&fd)?
        .map(|l| map::deputados(&l, None))
        .and_then(|v| v.as_array().cloned())
        .unwrap_or_default()
        .into_iter()
        .filter(|d| has(&d["nome"]))
        .map(|mut d| {
            d.as_object_mut().map(|m| m.remove("emendas"));
            d
        })
        .collect();
    let senadores: Vec<Value> = ctx
        .opt(&fs)?
        .map(|l| map::senadores(&l, None))
        .and_then(|v| v.as_array().cloned())
        .unwrap_or_default()
        .into_iter()
        .filter(|d| has(&d["nome"]) || has(&d["nomeCompleto"]))
        .map(|mut d| {
            d.as_object_mut().map(|m| m.remove("emendas"));
            d
        })
        .collect();
    let ufs: Vec<Value> = UFS
        .iter()
        .filter(|(s, nome)| chave_nome(nome).contains(&key) || *s == key)
        .map(|(s, nome)| json!({ "uf": s, "nome": nome, "url": format!("/v1/ufs/{s}") }))
        .collect();
    let federacoes: Vec<Value> = FEDERACOES
        .iter()
        .filter(|f| {
            chave_nome(f.nome).contains(&key) || f.partidos.iter().any(|p| chave_nome(p) == key)
        })
        .map(|f| json!({ "id": f.id, "nome": f.nome, "partidos": f.partidos }))
        .collect();
    let mut partidos: Vec<String> = Vec::new();
    for d in ctx
        .opt(&fd)?
        .map(|l| map::deputados(&l, None))
        .and_then(|v| v.as_array().cloned())
        .unwrap_or_default()
    {
        if let Some(p) = d["partido"].as_str() {
            if chave_nome(p) == key && !partidos.iter().any(|x| x == p) {
                partidos.push(p.to_string());
            }
        }
    }
    let partidos: Vec<Value> = partidos
        .iter()
        .map(|p| json!({ "sigla": p, "url": format!("/v1/partidos/{p}") }))
        .collect();
    let proposicoes: Vec<Value> = match &fp {
        Some(f) => ctx.opt(f)?.and_then(|v| v["dados"].as_array().cloned()).unwrap_or_default().iter().map(|p| {
            let id = p["id"].as_i64();
            json!({ "id": id, "sigla": format!("{} {}/{}", p["siglaTipo"].as_str().unwrap_or(""), p["numero"], p["ano"]), "ementa": p["ementa"], "url": id.map(|i| format!("/v1/proposicoes/{i}")) })
        }).collect(),
        None => vec![],
    };
    // A proposição sigla ("PL 2630/2020") is not a name search.
    let n = if prop.is_some() { 0 } else { n };
    let np = req.int("limit").unwrap_or(10) as usize;
    Ok(Body::Json(json!({
        "q": q,
        "autores": take(autores, n), "deputados": take(deputados, n), "senadores": take(senadores, n),
        "municipios": take(municipios, n), "ufs": take(ufs, n), "partidos": take(partidos, n),
        "federacoes": take(federacoes, n), "proposicoes": take(proposicoes, np),
    })))
}
