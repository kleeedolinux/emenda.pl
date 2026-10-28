//! Upstream JSON -> stable API shapes. Pure.
use super::AutoresQuery;
use crate::cards::chave_nome;
use serde_json::{json, Map, Value};
use std::collections::{BTreeMap, HashMap};

const SITE: &str = "https://emenda.online";

/// Trimmed non-empty string (numbers stringified) or null.
fn st(v: &Value, ptr: &str) -> Value {
    match v.pointer(ptr) {
        Some(Value::String(s)) if !s.trim().is_empty() => Value::String(s.trim().into()),
        Some(Value::Number(n)) => Value::String(n.to_string()),
        _ => Value::Null,
    }
}
fn num(v: &Value, ptr: &str) -> Option<i64> {
    let x = v.pointer(ptr)?;
    x.as_i64().or_else(|| x.as_str()?.trim().parse().ok())
}
fn https(v: Value) -> Value {
    match v {
        Value::String(s) => Value::String(s.replacen("http://", "https://", 1)),
        x => x,
    }
}
fn arr<'a>(v: &'a Value, ptr: &str) -> &'a [Value] {
    v.pointer(ptr)
        .and_then(Value::as_array)
        .map_or(&[], Vec::as_slice)
}
fn with_url(v: &Value, url: String) -> Value {
    let mut m = v.as_object().cloned().unwrap_or_default();
    m.insert("url".into(), url.into());
    Value::Object(m)
}

/// `chave` -> autor resumo (first wins: autores.json is sorted by value).
struct Autores<'a>(HashMap<&'a str, &'a Value>);

impl<'a> Autores<'a> {
    fn new(all: Option<&'a Value>) -> Self {
        let mut m = HashMap::new();
        for a in all.and_then(Value::as_array).map_or(&[][..], Vec::as_slice) {
            if let Some(k) = a.get("chave").and_then(Value::as_str) {
                m.entry(k).or_insert(a);
            }
        }
        Autores(m)
    }
    /// Emendas summary for the first name whose key matches.
    fn emendas(&self, nomes: &[&Value]) -> Value {
        nomes
            .iter()
            .filter_map(|n| n.as_str())
            .find_map(|n| self.0.get(chave_nome(n).as_str()))
            .map_or(Value::Null, |a| {
                let codigo = st(a, "/codigo");
                json!({
                    "codigo": codigo,
                    "n": num(a, "/n").unwrap_or(0),
                    "pago": num(a, "/pago").unwrap_or(0),
                    "empenhado": num(a, "/empenhado").unwrap_or(0),
                    "url": format!("/v1/autores/{}", codigo.as_str().unwrap_or_default()),
                })
            })
    }
}

/// Filter (`q`: código exact or name-key substring) + page over `autores.json`.
pub fn autores(all: &Value, q: &AutoresQuery) -> Value {
    let list = all.as_array().map_or(&[][..], Vec::as_slice);
    let hit = |a: &&Value| match q.q.as_deref() {
        None => true,
        Some(q) if q.bytes().all(|b| b.is_ascii_digit()) => {
            a.get("codigo").and_then(Value::as_str) == Some(q)
        }
        Some(q) => a
            .get("chave")
            .and_then(Value::as_str)
            .is_some_and(|c| c.contains(q)),
    };
    let found: Vec<&Value> = list.iter().filter(hit).collect();
    let itens: Vec<Value> = found
        .iter()
        .skip(q.offset)
        .take(q.limit)
        .map(|a| {
            let c = a.get("codigo").and_then(Value::as_str).unwrap_or_default();
            with_url(a, format!("/v1/autores/{c}"))
        })
        .collect();
    json!({ "total": found.len(), "limit": q.limit, "offset": q.offset, "itens": itens })
}

/// `brasil.json` `porUf` + links.
pub fn ufs(brasil: &Value) -> Value {
    arr(brasil, "/porUf")
        .iter()
        .map(|u| {
            let uf = u.get("uf").and_then(Value::as_str).unwrap_or_default();
            with_url(u, format!("/v1/ufs/{uf}"))
        })
        .collect()
}

/// Câmara `/deputados` (current legislature).
pub fn deputados(list: &Value, autores: Option<&Value>) -> Value {
    let idx = Autores::new(autores);
    arr(list, "/dados")
        .iter()
        .filter_map(|d| {
            let id = num(d, "/id")?;
            Some(json!({
                "id": id,
                "nome": st(d, "/nome"),
                "partido": st(d, "/siglaPartido"),
                "uf": st(d, "/siglaUf"),
                "foto": st(d, "/urlFoto"),
                "email": st(d, "/email"),
                "emendas": idx.emendas(&[&st(d, "/nome")]),
                "url": format!("/v1/deputados/{id}"),
            }))
        })
        .collect()
}

/// Câmara `/deputados/{id}`.
pub fn deputado(det: &Value, autores: Option<&Value>) -> Option<Value> {
    let d = det.get("dados")?;
    let id = num(d, "/id")?;
    let u = "/ultimoStatus";
    let nome = st(d, &format!("{u}/nomeEleitoral"));
    let nome = if nome.is_null() {
        st(d, &format!("{u}/nome"))
    } else {
        nome
    };
    let email = match st(d, &format!("{u}/gabinete/email")) {
        Value::Null => st(d, &format!("{u}/email")),
        e => e,
    };
    let redes: Vec<Value> = arr(d, "/redeSocial").to_vec();
    let emendas =
        Autores::new(autores).emendas(&[&nome, &st(d, &format!("{u}/nome")), &st(d, "/nomeCivil")]);
    Some(json!({
        "id": id,
        "nome": nome,
        "nomeCivil": st(d, "/nomeCivil"),
        "partido": st(d, &format!("{u}/siglaPartido")),
        "uf": st(d, &format!("{u}/siglaUf")),
        "foto": st(d, &format!("{u}/urlFoto")),
        "email": email,
        "telefone": st(d, &format!("{u}/gabinete/telefone")),
        "situacao": st(d, &format!("{u}/situacao")),
        "condicao": st(d, &format!("{u}/condicaoEleitoral")),
        "sexo": st(d, "/sexo"),
        "escolaridade": st(d, "/escolaridade"),
        "nascimento": {
            "data": st(d, "/dataNascimento"),
            "municipio": st(d, "/municipioNascimento"),
            "uf": st(d, "/ufNascimento"),
        },
        "redesSociais": redes,
        "emendas": emendas,
        "links": {
            "camara": format!("https://www.camara.leg.br/deputados/{id}"),
            "site": format!("{SITE}/deputado/{id}"),
        },
    }))
}

fn senador_base(p: &Value, idx: &Autores) -> Option<Map<String, Value>> {
    let i = "/IdentificacaoParlamentar";
    let codigo = st(p, &format!("{i}/CodigoParlamentar"));
    let cod = codigo.as_str()?.to_string();
    let nome = st(p, &format!("{i}/NomeParlamentar"));
    let completo = st(p, &format!("{i}/NomeCompletoParlamentar"));
    let emendas = idx.emendas(&[&nome, &completo]);
    let v = json!({
        "codigo": codigo,
        "nome": nome,
        "nomeCompleto": completo,
        "partido": st(p, &format!("{i}/SiglaPartidoParlamentar")),
        "uf": st(p, &format!("{i}/UfParlamentar")),
        "sexo": st(p, &format!("{i}/SexoParlamentar")),
        "foto": https(st(p, &format!("{i}/UrlFotoParlamentar"))),
        "email": st(p, &format!("{i}/EmailParlamentar")),
        "emendas": emendas,
        "url": format!("/v1/senadores/{cod}"),
    });
    v.as_object().cloned()
}

/// Senado `/senador/lista/atual`. `Parlamentar` may be an object when there is one.
pub fn senadores(list: &Value, autores: Option<&Value>) -> Value {
    let idx = Autores::new(autores);
    let ps: Vec<&Value> =
        match list.pointer("/ListaParlamentarEmExercicio/Parlamentares/Parlamentar") {
            Some(Value::Array(a)) => a.iter().collect(),
            Some(o @ Value::Object(_)) => vec![o],
            _ => vec![],
        };
    ps.into_iter()
        .filter_map(|p| senador_base(p, &idx).map(Value::Object))
        .collect()
}

/// Senado `/senador/{codigo}`.
pub fn senador(det: &Value, autores: Option<&Value>) -> Option<Value> {
    let p = det.pointer("/DetalheParlamentar/Parlamentar")?;
    let mut m = senador_base(p, &Autores::new(autores))?;
    let cod = m["codigo"].as_str().unwrap_or_default().to_string();
    let b = "/DadosBasicosParlamentar";
    m.remove("url");
    m.insert(
        "nascimento".into(),
        json!({
            "data": st(p, &format!("{b}/DataNascimento")),
            "municipio": st(p, &format!("{b}/Naturalidade")),
            "uf": st(p, &format!("{b}/UfNaturalidade")),
        }),
    );
    m.insert(
        "links".into(),
        json!({
            "senado": format!("https://www25.senado.leg.br/web/senadores/senador/-/perfil/{cod}"),
            "site": format!("{SITE}/senador/{cod}"),
        }),
    );
    Some(Value::Object(m))
}

fn dep_id_from_uri(uri: &Value) -> Value {
    uri.as_str()
        .and_then(|u| u.split_once("/deputados/"))
        .and_then(|(_, id)| id.parse::<i64>().ok())
        .map_or(Value::Null, Value::from)
}

/// Câmara `/proposicoes/{id}` (+ optional `/autores`).
pub fn proposicao(p: &Value, autores: Option<&Value>) -> Option<Value> {
    let d = p.get("dados")?;
    let id = num(d, "/id")?;
    let sigla = format!(
        "{} {}/{}",
        st(d, "/siglaTipo").as_str()?,
        num(d, "/numero")?,
        num(d, "/ano")?
    );
    let keywords: Vec<&str> = d
        .get("keywords")
        .and_then(Value::as_str)
        .map(|k| {
            k.split(',')
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .collect()
        })
        .unwrap_or_default();
    let s = "/statusProposicao";
    let autores: Vec<Value> = autores
        .map(|a| arr(a, "/dados"))
        .unwrap_or_default()
        .iter()
        .map(|a| {
            json!({
                "nome": st(a, "/nome"),
                "tipo": st(a, "/tipo"),
                "proponente": num(a, "/proponente") == Some(1),
                "deputadoId": dep_id_from_uri(&a["uri"]),
            })
        })
        .collect();
    Some(json!({
        "id": id,
        "sigla": sigla,
        "tipo": { "sigla": st(d, "/siglaTipo"), "descricao": st(d, "/descricaoTipo") },
        "numero": num(d, "/numero"),
        "ano": num(d, "/ano"),
        "ementa": st(d, "/ementa"),
        "apresentacao": st(d, "/dataApresentacao"),
        "keywords": keywords,
        "inteiroTeor": st(d, "/urlInteiroTeor"),
        "situacao": {
            "descricao": st(d, &format!("{s}/descricaoSituacao")),
            "tramitacao": st(d, &format!("{s}/descricaoTramitacao")),
            "orgao": st(d, &format!("{s}/siglaOrgao")),
            "data": st(d, &format!("{s}/dataHora")),
            "regime": st(d, &format!("{s}/regime")),
            "apreciacao": st(d, &format!("{s}/apreciacao")),
            "despacho": st(d, &format!("{s}/despacho")),
        },
        "autores": autores,
        "links": {
            "camara": format!("https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao={id}"),
            "site": format!("{SITE}/proposicao/{id}"),
        },
    }))
}

#[derive(Default, Clone, Copy)]
struct Placar {
    sim: u32,
    nao: u32,
    abstencao: u32,
    obstrucao: u32,
    outros: u32,
}

impl Placar {
    fn add(&mut self, voto: &str) {
        match voto {
            "Sim" => self.sim += 1,
            "Não" => self.nao += 1,
            "Abstenção" => self.abstencao += 1,
            "Obstrução" => self.obstrucao += 1,
            _ => self.outros += 1,
        }
    }
    fn total(&self) -> u32 {
        self.sim + self.nao + self.abstencao + self.obstrucao + self.outros
    }
    fn json(&self) -> Map<String, Value> {
        let v = json!({
            "sim": self.sim, "nao": self.nao, "abstencao": self.abstencao,
            "obstrucao": self.obstrucao, "outros": self.outros, "total": self.total(),
        });
        v.as_object().cloned().unwrap_or_default()
    }
}

/// Câmara `/votacoes/{id}` (+ optional `/votos`, `/orientacoes`).
pub fn votacao(v: &Value, votos: Option<&Value>, orientacoes: Option<&Value>) -> Option<Value> {
    let d = v.get("dados")?;
    let id = st(d, "/id");
    id.as_str()?;
    let aprovada = match num(d, "/aprovacao") {
        Some(1) => Value::Bool(true),
        Some(0) => Value::Bool(false),
        _ => Value::Null,
    };
    let mut placar = Placar::default();
    let mut partidos: BTreeMap<String, Placar> = BTreeMap::new();
    let lista: Vec<Value> = votos
        .map(|x| arr(x, "/dados"))
        .unwrap_or_default()
        .iter()
        .map(|x| {
            let voto = st(x, "/tipoVoto");
            let dep = &x["deputado_"];
            let partido = st(dep, "/siglaPartido");
            let vs = voto.as_str().unwrap_or_default();
            placar.add(vs);
            partidos
                .entry(partido.as_str().unwrap_or("S/PARTIDO").into())
                .or_default()
                .add(vs);
            json!({
                "deputadoId": num(dep, "/id"),
                "nome": st(dep, "/nome"),
                "partido": partido,
                "uf": st(dep, "/siglaUf"),
                "voto": voto,
            })
        })
        .collect();
    let mut por: Vec<(String, Placar)> = partidos.into_iter().collect();
    por.sort_by(|a, b| b.1.total().cmp(&a.1.total()).then_with(|| a.0.cmp(&b.0)));
    let por_partido: Vec<Value> = por
        .into_iter()
        .map(|(p, c)| {
            let mut m = Map::new();
            m.insert("partido".into(), p.into());
            m.extend(c.json());
            Value::Object(m)
        })
        .collect();
    let orient: Vec<Value> = orientacoes
        .map(|o| arr(o, "/dados"))
        .unwrap_or_default()
        .iter()
        .filter(|o| !st(o, "/orientacaoVoto").is_null())
        .map(|o| json!({ "bancada": st(o, "/siglaPartidoBloco"), "orientacao": st(o, "/orientacaoVoto") }))
        .collect();
    let props: Vec<Value> = arr(d, "/proposicoesAfetadas")
        .iter()
        .filter_map(|p| {
            let pid = num(p, "/id")?;
            Some(json!({
                "id": pid,
                "sigla": format!("{} {}/{}", st(p, "/siglaTipo").as_str().unwrap_or_default(), num(p, "/numero").unwrap_or(0), num(p, "/ano").unwrap_or(0)),
                "url": format!("/v1/proposicoes/{pid}"),
            }))
        })
        .collect();
    let idv = id.as_str().unwrap_or_default().to_string();
    Some(json!({
        "id": id,
        "data": st(d, "/data"),
        "registro": st(d, "/dataHoraRegistro"),
        "orgao": st(d, "/siglaOrgao"),
        "descricao": st(d, "/descricao"),
        "aprovada": aprovada,
        "placar": Value::Object(placar.json()),
        "porPartido": por_partido,
        "orientacoes": orient,
        "votos": lista,
        "proposicoes": props,
        "links": {
            "camara": format!("{}votacoes/{idv}", super::CAMARA),
            "site": format!("{SITE}/votacao/{idv}"),
        },
    }))
}
