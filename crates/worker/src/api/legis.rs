//! Handlers over the live Câmara and Senado APIs (deputados, senadores, partidos, frentes,
//! comissões, proposições, votações, agenda). Pure: fetches are requested via `Ctx`.
use super::emendas::{emendas_autor, Filtro};
use super::map::{self, num, st};
use super::normas::{self, Entrada, Tramite};
use super::plan::{camara, data, senado, Ctx, Flow, R};
use super::registry::Req;
use super::render::{Body, Listing};
use super::{datas, ApiError};
use crate::cards::chave_nome;
use serde_json::{json, Value};

const SITE: &str = "https://emenda.online";

fn bad(m: impl Into<String>) -> Flow {
    Flow::Fail(ApiError::BadRequest(m.into()))
}
fn nf() -> Flow {
    Flow::Fail(ApiError::NotFound)
}

/// Senado XML→JSON: one item is an object, many are an array.
pub fn many(v: &Value, ptr: &str) -> Vec<Value> {
    match v.pointer(ptr) {
        Some(Value::Array(a)) => a.clone(),
        Some(o @ Value::Object(_)) => vec![o.clone()],
        _ => vec![],
    }
}
fn dados(v: &Value) -> Vec<Value> {
    many(v, "/dados")
}
fn has_next(v: &Value) -> bool {
    many(v, "/links").iter().any(|l| l["rel"] == "next")
}
/// Câmara `links[rel=last]` page number.
pub fn last_page(v: &Value) -> usize {
    many(v, "/links")
        .iter()
        .find(|l| l["rel"] == "last")
        .and_then(|l| l["href"].as_str())
        .and_then(|h| h.split(['?', '&']).find_map(|p| p.strip_prefix("pagina=")))
        .and_then(|n| n.parse().ok())
        .unwrap_or(1)
}
fn s<'a>(v: &'a Value, k: &str) -> &'a str {
    v[k].as_str().unwrap_or_default()
}
fn upper_eq(a: &str, b: &str) -> bool {
    chave_nome(a) == chave_nome(b)
}
fn list(rows: Vec<Value>) -> R<Body> {
    Ok(Body::List(Listing::all(rows)))
}
fn dep_id_uri(uri: &Value) -> Value {
    uri.as_str()
        .and_then(|u| u.rsplit_once('/'))
        .and_then(|(_, id)| id.parse::<i64>().ok())
        .map_or(Value::Null, Value::from)
}
/// "Sim: 300; Não: 100; ..." in a Câmara votação description.
pub fn placar_da_descricao(desc: &str) -> Option<Value> {
    let t = normas::fold(desc);
    let n = |k: &str| -> i64 {
        t.find(k)
            .map(|i| &t[i + k.len()..])
            .map(|r| {
                r.trim_start()
                    .chars()
                    .take_while(char::is_ascii_digit)
                    .collect::<String>()
            })
            .and_then(|d| d.parse().ok())
            .unwrap_or(0)
    };
    let sim = t.find("sim:")?;
    t[sim + 4..]
        .trim_start()
        .starts_with(|c: char| c.is_ascii_digit())
        .then_some(())?;
    Some(
        json!({ "sim": n("sim:"), "nao": n("nao:"), "abstencao": n("abstencao:"), "total": n("total:") }),
    )
}

fn pair(a: &str, b: &str) -> String {
    format!("{a}&{b}")
}

fn prop_row(p: &Value) -> Value {
    let id = num(p, "/id");
    json!({
        "id": id,
        "sigla": format!("{} {}/{}", s(p, "siglaTipo"), num(p, "/numero").unwrap_or(0), num(p, "/ano").unwrap_or(0)),
        "tipo": st(p, "/siglaTipo"),
        "numero": num(p, "/numero"),
        "ano": num(p, "/ano"),
        "ementa": st(p, "/ementa"),
        "url": id.map(|i| format!("/v1/proposicoes/{i}")),
    })
}

fn membro_cam(m: &Value) -> Value {
    let id = num(m, "/id");
    json!({
        "id": id, "nome": st(m, "/nome"), "partido": st(m, "/siglaPartido"), "uf": st(m, "/siglaUf"),
        "foto": st(m, "/urlFoto"), "cargo": st(m, "/titulo"), "inicio": st(m, "/dataInicio"), "fim": st(m, "/dataFim"),
        "url": id.map(|i| format!("/v1/deputados/{i}")),
    })
}

fn filtra_uf_partido(rows: Vec<Value>, req: &Req, q: bool) -> Vec<Value> {
    let uf = req.arg("uf");
    let partido = req.arg("partido");
    let qk = if q {
        req.arg("q").map(chave_nome)
    } else {
        None
    };
    rows.into_iter()
        .filter(|r| {
            uf.is_none_or(|u| r["uf"].as_str() == Some(u))
                && partido.is_none_or(|p| r["partido"].as_str().is_some_and(|x| upper_eq(x, p)))
                && qk.as_deref().is_none_or(|k| {
                    r["nome"]
                        .as_str()
                        .is_some_and(|n| chave_nome(n).contains(k))
                })
        })
        .collect()
}

pub struct Federacao {
    pub id: &'static str,
    pub nome: &'static str,
    pub partidos: &'static [&'static str],
    pub deferimento: &'static str,
}

/// Federações registradas no TSE (curadoria; mesma lista de apps/web/src/features/federacoes).
pub const FEDERACOES: &[Federacao] = &[
    Federacao {
        id: "brasil-da-esperanca",
        nome: "Federação Brasil da Esperança",
        partidos: &["PT", "PCdoB", "PV"],
        deferimento: "2022-05-24",
    },
    Federacao {
        id: "psdb-cidadania",
        nome: "Federação PSDB Cidadania",
        partidos: &["PSDB", "CIDADANIA"],
        deferimento: "2022-05-26",
    },
    Federacao {
        id: "psol-rede",
        nome: "Federação PSOL REDE",
        partidos: &["PSOL", "REDE"],
        deferimento: "2022-05-26",
    },
    Federacao {
        id: "renovacao-solidaria",
        nome: "Federação Renovação Solidária",
        partidos: &["PRD", "SOLIDARIEDADE"],
        deferimento: "2025-12-04",
    },
    Federacao {
        id: "uniao-progressista",
        nome: "Federação União Progressista",
        partidos: &["UNIÃO", "PP"],
        deferimento: "2026-03-26",
    },
];

pub fn federacao_do_partido(sigla: &str) -> Option<&'static Federacao> {
    FEDERACOES
        .iter()
        .find(|f| f.partidos.iter().any(|p| upper_eq(p, sigla)))
}
fn federacao_json(f: &Federacao) -> Value {
    json!({ "id": f.id, "nome": f.nome, "partidos": f.partidos, "deferimento": f.deferimento,
            "fonte": "https://www.tse.jus.br/partidos/federacoes-registradas-no-tse" })
}

// ---------------------------------------------------------------- agenda

fn limpa(x: &Value) -> Option<String> {
    let t = x.as_str()?.split_whitespace().collect::<Vec<_>>().join(" ");
    (!t.is_empty()).then_some(t)
}
fn status_de(s: &str) -> &'static str {
    let t = normas::fold(s);
    if ["cancel", "anulad", "nao realizad", "adiad"]
        .iter()
        .any(|k| t.contains(k))
    {
        "cancelada"
    } else if ["andamento", "aberta", "em curso"]
        .iter()
        .any(|k| t.contains(k))
    {
        "em-andamento"
    } else if ["encerrad", "realizad", "finaliz"]
        .iter()
        .any(|k| t.contains(k))
    {
        "encerrada"
    } else {
        "agendada"
    }
}

pub fn evento_camara(e: &Value) -> Value {
    let o = &e["orgaos"][0];
    let sigla = s(o, "sigla");
    let plen = sigla == "PLEN" || many(e, "/orgaos").iter().any(|x| x["sigla"] == "PLEN");
    let inicio: String = s(e, "dataHoraInicio").chars().take(16).collect();
    let id = num(e, "/id").unwrap_or(0);
    json!({
        "id": format!("camara-{id}"), "casa": "camara", "ambito": if plen { "plenario" } else { "comissao" },
        "titulo": limpa(&e["descricaoTipo"]).unwrap_or_else(|| "Evento".into()),
        "descricao": limpa(&e["descricao"]),
        "orgao": limpa(&o["nome"]).unwrap_or_else(|| "Câmara dos Deputados".into()), "orgaoSigla": sigla,
        "dia": inicio.get(..10), "hora": inicio.get(11..16), "inicio": inicio,
        "status": status_de(s(e, "situacao")),
        "deliberativa": normas::fold(s(e, "descricaoTipo")).contains("deliberativ"),
        "local": limpa(&e["localCamara"]["nome"]).or_else(|| limpa(&e["localExterno"])),
        "fonte": format!("https://www.camara.leg.br/evento-legislativo/{id}"),
        "materias": [],
    })
}

pub fn sessao_senado(x: &Value) -> Value {
    let hora: String = x["Hora"]
        .as_str()
        .unwrap_or("00:00")
        .chars()
        .take(5)
        .collect();
    let dia = s(x, "Data");
    let cn = x["Casa"] == "CN";
    let tipo = limpa(&x["TipoSessao"]).unwrap_or_else(|| "Sessão".into());
    let num = limpa(&x["NumeroSessao"]);
    let tf = normas::fold(&tipo);
    let cod = s(x, "CodigoSessao");
    let materias: Vec<Value> = many(x, "/Materias/Materia")
        .iter()
        .map(|m| {
            let c = m["CodigoMateria"].as_str();
            json!({
                "id": c, "sigla": limpa(&m["DescricaoIdentificacaoMateria"]).or_else(|| limpa(&m["Identificacao"])),
                "ementa": limpa(&m["Ementa"]),
                "href": c.map(|c| format!("https://www25.senado.leg.br/web/atividade/materias/-/materia/{c}")),
            })
        })
        .collect();
    json!({
        "id": format!("senado-{cod}"), "casa": "senado", "ambito": "plenario",
        "titulo": match num { Some(n) => format!("{n} — {tipo}"), None => tipo.clone() },
        "descricao": limpa(&x["Evento"]["DescricaoEvento"]),
        "orgao": if cn { "Congresso Nacional" } else { "Plenário do Senado" }, "orgaoSigla": if cn { "CN" } else { "PLEN" },
        "dia": dia, "hora": hora, "inicio": format!("{dia}T{hora}"),
        "status": status_de(s(x, "SituacaoSessao")),
        "deliberativa": tf.contains("deliberativ") && !tf.contains("nao deliberativ"),
        "local": limpa(&x["LocalSessao"]),
        "fonte": format!("https://www25.senado.leg.br/web/atividade/sessao-plenaria/-/pauta/{cod}"),
        "materias": materias,
    })
}

pub fn reuniao_senado(r: &Value) -> Value {
    let inicio: String = s(r, "dataInicio").chars().take(16).collect();
    let partes = many(r, "/partes");
    let cod = s(r, "codigo");
    let st = if r["realizada"] == "true" {
        "encerrada"
    } else {
        status_de(s(r, "situacao"))
    };
    let desc: Vec<String> = partes
        .iter()
        .filter_map(|p| limpa(&p["evento"]["finalidade"]))
        .collect();
    json!({
        "id": format!("senado-r{cod}"), "casa": "senado", "ambito": "comissao",
        "titulo": limpa(&r["titulo"]).unwrap_or_else(|| "Reunião".into()),
        "descricao": (!desc.is_empty()).then(|| desc.join(" · ")),
        "orgao": limpa(&r["colegiadoCriador"]["nome"]).unwrap_or_else(|| "Comissão do Senado".into()),
        "orgaoSigla": s(&r["colegiadoCriador"], "sigla"),
        "dia": inicio.get(..10), "hora": inicio.get(11..16), "inicio": inicio, "status": st,
        "deliberativa": partes.iter().any(|p| p["isDeliberativa"] == "true"),
        "local": limpa(&r["local"]),
        "fonte": format!("https://legis.senado.leg.br/comissoes/reuniao?reuniao={cod}"),
        "materias": [],
    })
}

/// YYYYMMDD of `de` plus the first day of each further month touched by `de..=ate`.
pub fn meses(de: &str, ate: &str) -> Vec<String> {
    let mut out = vec![de.replace('-', "")];
    let (a, b) = (
        datas::parse(de).unwrap_or(0),
        datas::parse(ate).unwrap_or(0),
    );
    for d in a..=b {
        let f = datas::fmt(d);
        if f[..7]
            != out
                .last()
                .map(|l| format!("{}-{}", &l[..4], &l[4..6]))
                .unwrap_or_default()
        {
            out.push(f.replace('-', ""));
        }
    }
    out
}

fn agenda(req: &Req, ctx: &Ctx) -> R<Body> {
    let (de, ate) =
        datas::janela(req.arg("de"), req.arg("ate"), &ctx.now.today, 0, 6, 31).map_err(bad)?;
    let (de, ate) = if req.arg("de").is_some() && req.arg("ate").is_none() {
        (de.clone(), datas::add(&de, 6).unwrap_or(ate))
    } else {
        (de, ate)
    };
    let casa = req.arg("casa");
    let cam = |p: usize| {
        camara(format!("eventos?dataInicio={de}&dataFim={ate}&ordem=ASC&ordenarPor=dataHoraInicio&itens=100&pagina={p}"))
    };
    let sen_plen: Vec<_> = meses(&de, &ate)
        .into_iter()
        .map(|m| senado(format!("plenario/agenda/mes/{m}.json")))
        .collect();
    let sen_com = senado(format!(
        "comissao/agenda/{}/{}.json",
        de.replace('-', ""),
        ate.replace('-', "")
    ));
    let mut want = Vec::new();
    if casa != Some("senado") {
        want.push(cam(1));
    }
    if casa != Some("camara") {
        want.extend(sen_plen.iter().cloned());
        want.push(sen_com.clone());
    }
    ctx.need(&want)?;
    let mut rows = Vec::new();
    let mut ok = false;
    if casa != Some("senado") {
        if let Some(p1) = ctx.opt(&cam(1))? {
            ok = true;
            let last = last_page(&p1).min(5);
            ctx.need(&(2..=last).map(cam).collect::<Vec<_>>())?;
            rows.extend(dados(&p1).iter().map(evento_camara));
            for p in 2..=last {
                if let Some(v) = ctx.opt(&cam(p))? {
                    rows.extend(dados(&v).iter().map(evento_camara));
                }
            }
        }
    }
    if casa != Some("camara") {
        let mut seen = std::collections::BTreeSet::new();
        for f in &sen_plen {
            if let Some(v) = ctx.opt(f)? {
                ok = true;
                for x in many(&v, "/AgendaPlenario/Sessoes/Sessao") {
                    let e = sessao_senado(&x);
                    if seen.insert(e["id"].to_string()) {
                        rows.push(e);
                    }
                }
            }
        }
        if let Some(v) = ctx.opt(&sen_com)? {
            ok = true;
            rows.extend(
                many(&v, "/AgendaReuniao/reunioes/reuniao")
                    .iter()
                    .map(reuniao_senado),
            );
        }
    }
    if !ok {
        return Err(Flow::Fail(ApiError::Upstream(0)));
    }
    rows.retain(|e| {
        e["dia"]
            .as_str()
            .is_some_and(|d| d >= de.as_str() && d <= ate.as_str())
    });
    rows.sort_by(|a, b| {
        s(a, "inicio")
            .cmp(s(b, "inicio"))
            .then_with(|| s(a, "casa").cmp(s(b, "casa")))
    });
    list(rows)
}

// ---------------------------------------------------------------- handlers

fn deputado_nomes(d: &Value) -> Vec<String> {
    let x = &d["dados"];
    [
        "/ultimoStatus/nomeEleitoral",
        "/ultimoStatus/nome",
        "/nomeCivil",
    ]
    .iter()
    .filter_map(|p| x.pointer(p)?.as_str().map(String::from))
    .collect()
}

fn emendas_de(ctx: &Ctx, nomes: &[String], req: &Req) -> R<Body> {
    let autores = ctx.json(&data("v1/autores.json"))?;
    let ns: Vec<&str> = nomes.iter().map(String::as_str).collect();
    match map::autor_codigo(Some(&autores), &ns) {
        Some(c) => emendas_autor(ctx, &c, &Filtro::from_req(req)),
        None => list(vec![]),
    }
}

fn anos_param(req: &Req, now_year: i64) -> String {
    match req.int("ano") {
        Some(a) => format!("ano={a}"),
        None => format!("ano={}&ano={now_year}", now_year - 1),
    }
}
fn pagina(req: &Req) -> usize {
    req.offset / req.limit.max(1) + 1
}

pub fn run(req: &Req, ctx: &Ctx) -> R<Body> {
    let a = |n| req.arg(n).unwrap_or_default();
    let autores = data("v1/autores.json");
    match req.op.id {
        "deputados" => {
            let path = match req.int("legislatura") {
                Some(l) => format!("deputados?idLegislatura={l}&ordem=ASC&ordenarPor=nome"),
                None => "deputados?ordem=ASC&ordenarPor=nome".into(),
            };
            let f = camara(path);
            ctx.need(&[f.clone(), autores.clone()])?;
            let l = ctx.json(&f)?;
            let mut seen = std::collections::BTreeMap::new();
            for d in map::deputados(&l, ctx.opt(&autores)?.as_ref())
                .as_array()
                .cloned()
                .unwrap_or_default()
            {
                seen.insert(d["id"].as_i64().unwrap_or(0), d);
            }
            let mut rows: Vec<Value> = seen.into_values().collect();
            rows.sort_by_key(|r| chave_nome(s(r, "nome")));
            list(filtra_uf_partido(rows, req, true))
        }
        "deputado" => {
            let f = camara(format!("deputados/{}", a("id")));
            ctx.need(&[f.clone(), autores.clone()])?;
            let d = ctx.json(&f)?;
            Ok(Body::Json(
                map::deputado(&d, ctx.opt(&autores)?.as_ref()).ok_or_else(nf)?,
            ))
        }
        "deputado_mandatos" => {
            let v = ctx.json(&camara(format!("deputados/{}/historico", a("id"))))?;
            list(dados(&v).iter().map(|h| json!({
                "data": st(h, "/dataHora"), "legislatura": num(h, "/idLegislatura"), "nome": st(h, "/nomeEleitoral"),
                "partido": st(h, "/siglaPartido"), "uf": st(h, "/siglaUf"), "situacao": st(h, "/situacao"),
                "condicao": st(h, "/condicaoEleitoral"), "descricao": st(h, "/descricaoStatus"),
            })).collect())
        }
        "deputado_proposicoes" | "proposicoes" => {
            let mut q: Vec<String> = Vec::new();
            if req.op.id == "deputado_proposicoes" {
                q.push(format!("idDeputadoAutor={}", a("id")));
            }
            if let Some(t) = req.arg("tipo") {
                q.push(format!("siglaTipo={t}"));
            }
            for (k, up) in [
                ("numero", "numero"),
                ("autor", "autor"),
                ("tema", "codTema"),
                ("q", "keywords"),
            ] {
                if let Some(v) = req.arg(k) {
                    q.push(format!("{up}={}", super::registry::enc(v)));
                }
            }
            if req.arg("ano").is_some() || req.arg("numero").is_none() {
                q.push(anos_param(req, ctx.now.year()));
            }
            let (campo, desc) = req.ordem.clone().unwrap_or(("id".into(), true));
            q.push(format!(
                "ordem={}&ordenarPor={campo}",
                if desc { "DESC" } else { "ASC" }
            ));
            q.push(pair(
                &format!("itens={}", req.limit),
                &format!("pagina={}", pagina(req)),
            ));
            let v = ctx.json(&camara(format!("proposicoes?{}", q.join("&"))))?;
            let rows: Vec<Value> = dados(&v).iter().map(prop_row).collect();
            let total = (!has_next(&v)).then(|| req.offset + rows.len());
            Ok(Body::List(Listing {
                rows,
                total,
                paged: true,
                legacy: false,
            }))
        }
        "deputado_votos" => {
            let (de, ate) = datas::janela(req.arg("de"), req.arg("ate"), &ctx.now.today, 60, 0, 92)
                .map_err(bad)?;
            let lista = ctx.json(&camara(format!(
                "votacoes?idOrgao=180&dataInicio={de}&dataFim={ate}&itens=200&ordem=DESC&ordenarPor=dataHoraRegistro"
            )))?;
            let nominais: Vec<Value> = dados(&lista)
                .into_iter()
                .filter(|v| placar_da_descricao(s(v, "descricao")).is_some())
                .collect();
            let page: Vec<&Value> = nominais.iter().skip(req.offset).take(req.limit).collect();
            let fs: Vec<_> = page
                .iter()
                .map(|v| camara(format!("votacoes/{}/votos", s(v, "id"))))
                .collect();
            ctx.need(&fs)?;
            let id: i64 = a("id").parse().unwrap_or(0);
            let mut rows = Vec::new();
            for (v, f) in page.iter().zip(&fs) {
                let votos = ctx.opt(f)?;
                let meu = votos.as_ref().and_then(|x| {
                    dados(x)
                        .into_iter()
                        .find(|y| y["deputado_"]["id"].as_i64() == Some(id))
                });
                let vid = s(v, "id");
                rows.push(json!({
                    "votacao": vid, "data": st(v, "/data"), "descricao": st(v, "/descricao"),
                    "placar": placar_da_descricao(s(v, "descricao")),
                    "voto": match (&votos, &meu) { (None, _) => Value::Null, (Some(_), Some(m)) => st(m, "/tipoVoto"), (Some(_), None) => "Sem registro".into() },
                    "partidoNaData": meu.as_ref().map(|m| st(&m["deputado_"], "/siglaPartido")),
                    "url": format!("/v1/votacoes/{vid}"),
                }));
            }
            Ok(Body::List(Listing {
                rows,
                total: Some(nominais.len()),
                paged: true,
                legacy: false,
            }))
        }
        "deputado_despesas" => {
            let ano = req.int("ano").unwrap_or(ctx.now.year());
            let mes = req
                .int("mes")
                .map(|m| format!("&mes={m}"))
                .unwrap_or_default();
            let v = ctx.json(&camara(format!(
                "deputados/{}/despesas?ano={ano}{mes}&itens={}&pagina={}&ordem=DESC&ordenarPor=dataDocumento",
                a("id"), req.limit, pagina(req)
            )))?;
            let cent = |x: &Value| x.as_f64().map(|f| (f * 100.0).round() as i64);
            let rows: Vec<Value> = dados(&v).iter().map(|d| json!({
                "ano": num(d, "/ano"), "mes": num(d, "/mes"), "data": st(d, "/dataDocumento"), "tipo": st(d, "/tipoDespesa"),
                "fornecedor": st(d, "/nomeFornecedor"), "cnpjCpf": st(d, "/cnpjCpfFornecedor"),
                "valor": cent(&d["valorLiquido"]), "valorDocumento": cent(&d["valorDocumento"]), "glosa": cent(&d["valorGlosa"]),
                "documento": st(d, "/urlDocumento"),
            })).collect();
            let total = (!has_next(&v)).then(|| req.offset + rows.len());
            Ok(Body::List(Listing {
                rows,
                total,
                paged: true,
                legacy: false,
            }))
        }
        "deputado_frentes" => {
            let v = ctx.json(&camara(format!("deputados/{}/frentes", a("id"))))?;
            list(dados(&v).iter().map(|f| {
                let id = num(f, "/id");
                json!({ "id": id, "titulo": st(f, "/titulo"), "legislatura": num(f, "/idLegislatura"), "url": id.map(|i| format!("/v1/frentes/{i}")) })
            }).collect())
        }
        "deputado_orgaos" => {
            let v = ctx.json(&camara(format!(
                "deputados/{}/orgaos?itens=100&ordem=DESC&ordenarPor=dataInicio",
                a("id")
            )))?;
            list(dados(&v).iter().map(|o| json!({
                "id": num(o, "/idOrgao"), "sigla": st(o, "/siglaOrgao"), "nome": st(o, "/nomePublicacao"),
                "cargo": st(o, "/titulo"), "inicio": st(o, "/dataInicio"), "fim": st(o, "/dataFim"),
            })).collect())
        }
        "deputado_emendas" => {
            let d = ctx.json(&camara(format!("deputados/{}", a("id"))))?;
            emendas_de(ctx, &deputado_nomes(&d), req)
        }
        "senadores" => {
            let f = senado("senador/lista/atual");
            ctx.need(&[f.clone(), autores.clone()])?;
            let l = ctx.json(&f)?;
            let rows = map::senadores(&l, ctx.opt(&autores)?.as_ref())
                .as_array()
                .cloned()
                .unwrap_or_default();
            list(filtra_uf_partido(rows, req, true))
        }
        "senador" => {
            let f = senado(format!("senador/{}", a("codigo")));
            ctx.need(&[f.clone(), autores.clone()])?;
            let d = ctx.json(&f)?;
            Ok(Body::Json(
                map::senador(&d, ctx.opt(&autores)?.as_ref()).ok_or_else(nf)?,
            ))
        }
        "senador_mandatos" => {
            let v = ctx.json(&senado(format!("senador/{}/mandatos", a("codigo"))))?;
            list(many(&v, "/MandatoParlamentar/Parlamentar/Mandatos/Mandato").iter().map(|m| {
                let legs: Vec<Value> = ["PrimeiraLegislaturaDoMandato", "SegundaLegislaturaDoMandato"].iter()
                    .filter(|k| m[**k].is_object())
                    .map(|k| json!({ "numero": st(&m[*k], "/NumeroLegislatura"), "inicio": st(&m[*k], "/DataInicio"), "fim": st(&m[*k], "/DataFim") }))
                    .collect();
                json!({
                    "codigo": st(m, "/CodigoMandato"), "uf": st(m, "/UfParlamentar"), "participacao": st(m, "/DescricaoParticipacao"),
                    "inicio": legs.first().map(|l| l["inicio"].clone()), "fim": legs.last().map(|l| l["fim"].clone()),
                    "legislaturas": legs,
                    "suplentes": many(m, "/Suplentes/Suplente").iter().map(|x| json!({ "codigo": st(x, "/CodigoParlamentar"), "nome": st(x, "/NomeParlamentar"), "participacao": st(x, "/DescricaoParticipacao") })).collect::<Vec<_>>(),
                    "partidos": many(m, "/Partidos/Partido").iter().map(|x| json!({ "sigla": st(x, "/Sigla"), "nome": st(x, "/Nome"), "filiacao": st(x, "/DataFiliacao"), "desfiliacao": st(x, "/DataDesfiliacao") })).collect::<Vec<_>>(),
                })
            }).collect())
        }
        "senador_comissoes" => {
            let v = ctx.json(&senado(format!("senador/{}/comissoes", a("codigo"))))?;
            let ativas = req.flag("ativas");
            list(many(&v, "/MembroComissaoParlamentar/Parlamentar/MembroComissoes/Comissao").iter()
                .map(|c| json!({
                    "codigo": st(c, "/IdentificacaoComissao/CodigoComissao"), "sigla": st(c, "/IdentificacaoComissao/SiglaComissao"),
                    "nome": st(c, "/IdentificacaoComissao/NomeComissao"), "casa": st(c, "/IdentificacaoComissao/SiglaCasaComissao"),
                    "participacao": st(c, "/DescricaoParticipacao"), "inicio": st(c, "/DataInicio"), "fim": st(c, "/DataFim"),
                }))
                .filter(|c| ativas.is_none_or(|x| c["fim"].is_null() == x))
                .collect())
        }
        "senador_proposicoes" => {
            let v = ctx.json(&senado(format!(
                "processo?codigoParlamentarAutor={}",
                a("codigo")
            )))?;
            let tipos: Vec<&str> = req
                .arg("tipo")
                .map(|t| t.split(',').collect())
                .unwrap_or_default();
            let ano = req.arg("ano");
            list(v.as_array().cloned().unwrap_or_default().iter()
                .filter(|p| {
                    let ident = s(p, "identificacao");
                    (tipos.is_empty() || tipos.iter().any(|t| ident.split(' ').next() == Some(*t)))
                        && ano.is_none_or(|y| ident.split('/').nth(1).is_some_and(|x| x.starts_with(y)))
                })
                .map(|p| {
                    let cm = num(p, "/codigoMateria");
                    json!({
                        "id": num(p, "/id"), "codigoMateria": cm, "identificacao": st(p, "/identificacao"), "ementa": st(p, "/ementa"),
                        "data": st(p, "/dataApresentacao"), "situacao": st(p, "/situacaoAtual"), "normaGerada": st(p, "/normaGerada"),
                        "tramitando": st(p, "/tramitando"),
                        "link": cm.map(|c| format!("https://www25.senado.leg.br/web/atividade/materias/-/materia/{c}")),
                    })
                })
                .collect())
        }
        "senador_votos" => {
            let (de, ate) =
                datas::janela(req.arg("de"), req.arg("ate"), &ctx.now.today, 90, 0, 366)
                    .map_err(bad)?;
            let cod = a("codigo");
            let v = ctx.json(&senado(format!(
                "votacao?codigoParlamentar={cod}&dataInicio={de}&dataFim={ate}"
            )))?;
            let c: i64 = cod.parse().unwrap_or(0);
            let mut rows: Vec<Value> = v.as_array().cloned().unwrap_or_default().iter().map(|x| {
                let meu = many(x, "/votos").into_iter().find(|y| y["codigoParlamentar"].as_i64() == Some(c));
                json!({
                    "data": st(x, "/dataSessao"), "identificacao": st(x, "/identificacao"), "descricao": st(x, "/descricaoVotacao"),
                    "ementa": st(x, "/ementa"), "resultado": st(x, "/resultadoVotacao"), "secreta": x["votacaoSecreta"] == "S",
                    "voto": meu.as_ref().map(|m| st(m, "/siglaVotoParlamentar")).unwrap_or(Value::Null),
                    "partidoNaData": meu.as_ref().map(|m| st(m, "/siglaPartidoParlamentar")),
                    "codigoSessaoVotacao": num(x, "/codigoSessaoVotacao"), "codigoMateria": num(x, "/codigoMateria"),
                })
            }).collect();
            rows.sort_by(|a, b| s(b, "data").cmp(s(a, "data")));
            list(rows)
        }
        "senador_emendas" => {
            let d = ctx.json(&senado(format!("senador/{}", a("codigo"))))?;
            let i = "/DetalheParlamentar/Parlamentar/IdentificacaoParlamentar";
            let nomes: Vec<String> = ["NomeParlamentar", "NomeCompletoParlamentar"]
                .iter()
                .filter_map(|k| d.pointer(&format!("{i}/{k}"))?.as_str().map(String::from))
                .collect();
            if nomes.is_empty() {
                return Err(nf());
            }
            emendas_de(ctx, &nomes, req)
        }
        "partidos" => {
            let l = req.int("legislatura").unwrap_or(57);
            let v = ctx.json(&camara(format!(
                "partidos?idLegislatura={l}&itens=100&ordem=ASC&ordenarPor=sigla"
            )))?;
            list(dados(&v).iter().map(|p| {
                let sg = s(p, "sigla");
                json!({ "id": num(p, "/id"), "sigla": sg, "nome": st(p, "/nome"),
                        "federacao": federacao_do_partido(sg).map(|f| f.id), "url": format!("/v1/partidos/{sg}") })
            }).collect())
        }
        "partido" => partido(req, ctx),
        "federacoes" => list(FEDERACOES.iter().map(federacao_json).collect()),
        "frentes" => {
            let l = req.int("legislatura").unwrap_or(57);
            let pg = |p: usize| camara(format!("frentes?idLegislatura={l}&itens=100&pagina={p}"));
            let p1 = ctx.json(&pg(1))?;
            let last = last_page(&p1).min(10);
            ctx.need(&(2..=last).map(pg).collect::<Vec<_>>())?;
            let mut all = dados(&p1);
            for p in 2..=last {
                all.extend(dados(&ctx.json(&pg(p))?));
            }
            let q = req.arg("q").map(chave_nome);
            list(all.iter()
                .filter(|f| q.as_deref().is_none_or(|q| chave_nome(s(f, "titulo")).contains(q)))
                .map(|f| { let id = num(f, "/id"); json!({ "id": id, "titulo": st(f, "/titulo"), "legislatura": num(f, "/idLegislatura"), "url": id.map(|i| format!("/v1/frentes/{i}")) }) })
                .collect())
        }
        "frente" => {
            let v = ctx.json(&camara(format!("frentes/{}", a("id"))))?;
            let d = &v["dados"];
            let c = &d["coordenador"];
            Ok(Body::Json(json!({
                "id": num(d, "/id"), "titulo": st(d, "/titulo"), "legislatura": num(d, "/idLegislatura"),
                "telefone": st(d, "/telefone"), "email": st(d, "/email"), "situacao": st(d, "/situacao"),
                "site": st(d, "/urlWebsite"), "documento": st(d, "/urlDocumento"),
                "coordenador": if c.is_object() { json!({ "id": num(c, "/id"), "nome": st(c, "/nome"), "partido": st(c, "/siglaPartido"), "uf": st(c, "/siglaUf"), "foto": st(c, "/urlFoto") }) } else { Value::Null },
                "membros": format!("/v1/frentes/{}/membros", a("id")),
            })))
        }
        "frente_membros" => {
            let v = ctx.json(&camara(format!("frentes/{}/membros", a("id"))))?;
            list(filtra_uf_partido(
                dados(&v).iter().map(membro_cam).collect(),
                req,
                false,
            ))
        }
        "comissoes" => {
            let casa = req.arg("casa");
            let fc = camara("orgaos?codTipoOrgao=2&itens=100&ordem=ASC&ordenarPor=sigla");
            let fs = senado("comissao/lista/colegiados");
            let want: Vec<_> = [
                (casa != Some("senado"), fc.clone()),
                (casa != Some("camara"), fs.clone()),
            ]
            .into_iter()
            .filter(|x| x.0)
            .map(|x| x.1)
            .collect();
            ctx.need(&want)?;
            let mut rows = Vec::new();
            if casa != Some("senado") {
                rows.extend(dados(&ctx.json(&fc)?).iter().map(|o| {
                    let id = num(o, "/id");
                    json!({ "casa": "camara", "id": id, "sigla": st(o, "/sigla"), "nome": st(o, "/nome"), "tipo": st(o, "/tipoOrgao"),
                            "url": id.map(|i| format!("/v1/comissoes/{i}/membros?casa=camara")) })
                }));
            }
            if casa != Some("camara") {
                rows.extend(many(&ctx.json(&fs)?, "/ListaColegiados/Colegiados/Colegiado").iter().map(|c| {
                    let id = s(c, "Codigo");
                    json!({ "casa": "senado", "id": id.parse::<i64>().ok(), "sigla": st(c, "/Sigla"), "nome": st(c, "/Nome"),
                            "tipo": st(c, "/DescricaoTipoColegiado"), "casaColegiado": st(c, "/SiglaCasa"),
                            "url": format!("/v1/comissoes/{id}/membros?casa=senado") })
                }));
            }
            let q = req.arg("q").map(chave_nome);
            rows.retain(|r| {
                q.as_deref().is_none_or(|q| {
                    chave_nome(&format!("{} {}", s(r, "sigla"), s(r, "nome"))).contains(q)
                })
            });
            list(rows)
        }
        "comissao_membros" => {
            if req.arg("casa") == Some("senado") {
                let f = senado(format!("composicao/comissao/{}?ativas=S", a("id")));
                let lista = senado("senador/lista/atual");
                ctx.need(&[f.clone(), lista.clone()])?;
                let v = ctx.json(&f)?;
                let idx: Vec<Value> = ctx
                    .opt(&lista)?
                    .map(|l| map::senadores(&l, None))
                    .and_then(|x| x.as_array().cloned())
                    .unwrap_or_default();
                let c = "/ComposicaoAtivaComissaoSf/ComposicaoComissao";
                list(many(&v, &format!("{c}/Membros/Membro")).iter().map(|m| {
                    let cod = s(m, "CodigoMembro");
                    let sen = idx.iter().find(|x| x["codigo"] == cod);
                    json!({ "codigo": cod, "nome": st(m, "/NomeMembro"), "cargo": st(m, "/TipoVaga"), "inicio": st(m, "/DataInicioMembroVaga"),
                            "partido": sen.map(|x| x["partido"].clone()), "uf": sen.map(|x| x["uf"].clone()),
                            "url": format!("/v1/senadores/{cod}") })
                }).collect())
            } else {
                let pg =
                    |p: usize| camara(format!("orgaos/{}/membros?itens=100&pagina={p}", a("id")));
                let p1 = ctx.json(&pg(1))?;
                let mut rows: Vec<Value> = dados(&p1).iter().map(membro_cam).collect();
                if has_next(&p1) {
                    rows.extend(dados(&ctx.json(&pg(2))?).iter().map(membro_cam));
                }
                list(rows)
            }
        }
        "proposicao" => {
            let f = camara(format!("proposicoes/{}", a("id")));
            let fa = camara(format!("proposicoes/{}/autores", a("id")));
            ctx.need(&[f.clone(), fa.clone()])?;
            let p = ctx.json(&f)?;
            Ok(Body::Json(
                map::proposicao(&p, ctx.opt(&fa)?.as_ref()).ok_or_else(nf)?,
            ))
        }
        "proposicao_tramitacoes" => {
            let v = ctx.json(&camara(format!("proposicoes/{}/tramitacoes", a("id"))))?;
            list(dados(&v).iter().map(|t| json!({
                "sequencia": num(t, "/sequencia"), "data": st(t, "/dataHora"), "orgao": st(t, "/siglaOrgao"),
                "situacao": st(t, "/descricaoSituacao"), "tramitacao": st(t, "/descricaoTramitacao"),
                "despacho": st(t, "/despacho"), "regime": st(t, "/regime"), "documento": st(t, "/url"),
            })).collect())
        }
        "proposicao_autores" => {
            let v = ctx.json(&camara(format!("proposicoes/{}/autores", a("id"))))?;
            list(dados(&v).iter().map(|x| {
                let dep = dep_id_uri(&x["uri"]);
                let dep = if s(x, "uri").contains("/deputados/") { dep } else { Value::Null };
                json!({ "nome": st(x, "/nome"), "tipo": st(x, "/tipo"), "proponente": num(x, "/proponente") == Some(1),
                        "ordem": num(x, "/ordemAssinatura"), "deputadoId": dep.clone(),
                        "url": dep.as_i64().map(|i| format!("/v1/deputados/{i}")) })
            }).collect())
        }
        "proposicao_votacoes" | "votacoes" => {
            let f = if req.op.id == "votacoes" {
                let (de, ate) =
                    datas::janela(req.arg("de"), req.arg("ate"), &ctx.now.today, 30, 0, 92)
                        .map_err(bad)?;
                camara(format!("votacoes?idOrgao=180&dataInicio={de}&dataFim={ate}&itens=200&ordem=DESC&ordenarPor=dataHoraRegistro"))
            } else {
                camara(format!("proposicoes/{}/votacoes", a("id")))
            };
            let v = ctx.json(&f)?;
            let nom = req.flag("nominais");
            list(dados(&v).iter().map(|x| {
                let id = s(x, "id");
                json!({
                    "id": id, "data": st(x, "/data"), "registro": st(x, "/dataHoraRegistro"), "orgao": st(x, "/siglaOrgao"),
                    "descricao": st(x, "/descricao"),
                    "aprovada": match num(x, "/aprovacao") { Some(1) => Value::Bool(true), Some(0) => Value::Bool(false), _ => Value::Null },
                    "placar": placar_da_descricao(s(x, "descricao")),
                    "proposicaoObjeto": st(x, "/proposicaoObjeto"),
                    "url": format!("/v1/votacoes/{id}"), "site": format!("{SITE}/votacao/{id}"),
                })
            }).filter(|r| nom.is_none_or(|n| r["placar"].is_null() != n)).collect())
        }
        "proposicao_resultado" => {
            let f = camara(format!("proposicoes/{}", a("id")));
            let ft = camara(format!("proposicoes/{}/tramitacoes", a("id")));
            ctx.need(&[f.clone(), ft.clone()])?;
            let p = ctx.json(&f)?;
            let d = &p["dados"];
            let ts: Vec<Tramite> = ctx
                .opt(&ft)?
                .map(|t| dados(&t))
                .unwrap_or_default()
                .iter()
                .map(|t| Tramite {
                    data_hora: s(t, "dataHora").into(),
                    descricao: s(t, "descricaoTramitacao").into(),
                    despacho: s(t, "despacho").into(),
                })
                .collect();
            let r = normas::norma_da_tramitacao(&ts);
            let situacao = d
                .pointer("/statusProposicao/descricaoSituacao")
                .and_then(Value::as_str)
                .map(String::from);
            let des = normas::desfecho(&Entrada {
                situacao_camara: situacao.clone(),
                norma: r.norma,
                veto: r.veto,
                ..Default::default()
            });
            let id = num(d, "/id").ok_or_else(nf)?;
            let mut out = normas::desfecho_json(&des, r.veto_derrubado);
            out["proposicao"] = json!({ "id": id, "sigla": format!("{} {}/{}", s(d, "siglaTipo"), num(d, "/numero").unwrap_or(0), num(d, "/ano").unwrap_or(0)), "situacaoCamara": situacao, "url": format!("/v1/proposicoes/{id}") });
            Ok(Body::Json(out))
        }
        "votacao" => {
            let id = a("id");
            let (f, fv, fo) = (
                camara(format!("votacoes/{id}")),
                camara(format!("votacoes/{id}/votos")),
                camara(format!("votacoes/{id}/orientacoes")),
            );
            ctx.need(&[f.clone(), fv.clone(), fo.clone()])?;
            let v = ctx.json(&f)?;
            Ok(Body::Json(
                map::votacao(&v, ctx.opt(&fv)?.as_ref(), ctx.opt(&fo)?.as_ref()).ok_or_else(nf)?,
            ))
        }
        "agenda" => agenda(req, ctx),
        _ => Err(nf()),
    }
}

fn partido(req: &Req, ctx: &Ctx) -> R<Body> {
    let sigla = req.arg("sigla").unwrap_or_default();
    let busca = ctx.json(&camara(format!(
        "partidos?sigla={}&itens=100",
        super::registry::enc(sigla)
    )))?;
    let p = dados(&busca)
        .into_iter()
        .find(|p| upper_eq(s(p, "sigla"), sigla))
        .ok_or_else(nf)?;
    let id = num(&p, "/id").ok_or_else(nf)?;
    let fd = camara(format!("partidos/{id}"));
    let fm = |pg: usize| camara(format!("partidos/{id}/membros?itens=100&pagina={pg}"));
    let fs = senado("senador/lista/atual");
    ctx.need(&[fd.clone(), fm(1), fs.clone()])?;
    let d = ctx.json(&fd)?;
    let m1 = ctx.opt(&fm(1))?;
    let mut membros: Vec<Value> = m1.as_ref().map(dados).unwrap_or_default();
    if m1.as_ref().is_some_and(has_next) {
        if let Some(m2) = ctx.opt(&fm(2))? {
            membros.extend(dados(&m2));
        }
    }
    let senadores: Vec<Value> = ctx
        .opt(&fs)?
        .map(|l| map::senadores(&l, None))
        .and_then(|x| x.as_array().cloned())
        .unwrap_or_default()
        .into_iter()
        .filter(|x| x["partido"].as_str().is_some_and(|p| upper_eq(p, sigla)))
        .collect();
    let x = &d["dados"];
    let l = &x["status"]["lider"];
    let sg = s(x, "sigla");
    Ok(Body::Json(json!({
        "id": id, "sigla": sg, "nome": st(x, "/nome"), "numeroEleitoral": st(x, "/numeroEleitoral"),
        "logo": st(x, "/urlLogo"), "site": st(x, "/urlWebSite"),
        "situacao": st(x, "/status/situacao"), "totalMembros": num(x, "/status/totalMembros"),
        "lider": if l.is_object() { json!({ "nome": st(l, "/nome"), "uf": st(l, "/uf"), "deputadoId": dep_id_uri(&l["uri"]), "foto": st(l, "/urlFoto") }) } else { Value::Null },
        "federacao": federacao_do_partido(sg).map(federacao_json),
        "deputados": membros.iter().map(membro_cam).collect::<Vec<_>>(),
        "senadores": senadores,
        "links": { "camara": format!("https://www.camara.leg.br/partidos/{id}"), "site": format!("{SITE}/partido/{sg}") },
    })))
}
