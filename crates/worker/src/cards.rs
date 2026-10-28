//! OG card content from upstream JSON. Pure; converted to `og::OgCard` in glue.
use crate::money::compact_brl;
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Default,
    Deputado,
    Senador,
    Municipio,
    Uf,
    Autor,
    Proposicao,
    Votacao,
    Partido,
}

const SLUGS: [(Kind, &str); 8] = [
    (Kind::Deputado, "deputado"),
    (Kind::Senador, "senador"),
    (Kind::Municipio, "municipio"),
    (Kind::Uf, "uf"),
    (Kind::Autor, "autor"),
    (Kind::Proposicao, "proposicao"),
    (Kind::Votacao, "votacao"),
    (Kind::Partido, "partido"),
];

impl Kind {
    pub fn slug(self) -> &'static str {
        SLUGS
            .iter()
            .find(|(k, _)| *k == self)
            .map_or("default", |(_, s)| s)
    }
    pub fn from_slug(s: &str) -> Option<Kind> {
        SLUGS.iter().find(|(_, x)| *x == s).map(|(k, _)| *k)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CardSpec {
    pub kind: Kind,
    pub eyebrow: String,
    pub title: String,
    pub subtitle: String,
    pub stats: Vec<(String, String)>,
    pub badge: Option<String>,
    pub photo_url: Option<String>,
}

impl CardSpec {
    fn new(kind: Kind, eyebrow: &str, title: String, subtitle: String) -> Self {
        CardSpec {
            kind,
            eyebrow: eyebrow.into(),
            title,
            subtitle,
            stats: vec![],
            badge: None,
            photo_url: None,
        }
    }
    fn stat(mut self, label: &str, value: String) -> Self {
        self.stats.push((label.into(), value));
        self
    }
}

/// Uppercase, accents stripped, non-letters -> space, collapsed. Matches contracts `chaveNome`.
pub fn chave_nome(s: &str) -> String {
    let mapped: String = s
        .chars()
        .map(|c| {
            let c = match c {
                'á' | 'à' | 'â' | 'ã' | 'ä' | 'Á' | 'À' | 'Â' | 'Ã' | 'Ä' => 'A',
                'é' | 'è' | 'ê' | 'ë' | 'É' | 'È' | 'Ê' | 'Ë' => 'E',
                'í' | 'ì' | 'î' | 'ï' | 'Í' | 'Ì' | 'Î' | 'Ï' => 'I',
                'ó' | 'ò' | 'ô' | 'õ' | 'ö' | 'Ó' | 'Ò' | 'Ô' | 'Õ' | 'Ö' => 'O',
                'ú' | 'ù' | 'û' | 'ü' | 'Ú' | 'Ù' | 'Û' | 'Ü' => 'U',
                'ç' | 'Ç' => 'C',
                'ñ' | 'Ñ' => 'N',
                c => c.to_ascii_uppercase(),
            };
            if c.is_ascii_uppercase() {
                c
            } else {
                ' '
            }
        })
        .collect();
    mapped.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn s(v: &Value, ptr: &str) -> Option<String> {
    match v.pointer(ptr)? {
        Value::String(x) if !x.trim().is_empty() => Some(x.trim().to_string()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}
fn i(v: &Value, ptr: &str) -> Option<i64> {
    let x = v.pointer(ptr)?;
    x.as_i64()
        .or_else(|| x.as_f64().map(|f| f as i64))
        .or_else(|| x.as_str()?.parse().ok())
}
fn truncate(t: &str, max: usize) -> String {
    if t.chars().count() <= max {
        return t.into();
    }
    format!(
        "{}…",
        t.chars().take(max - 1).collect::<String>().trim_end()
    )
}

pub fn default_card() -> CardSpec {
    CardSpec::new(
        Kind::Default,
        "emenda.pl",
        "Para onde vão as emendas parlamentares".into(),
        "Quem enviou, quanto foi pago e onde o dinheiro chegou.".into(),
    )
}

/// `autores`: data `autores.json` (array of AutorResumo); `n_prop`: Câmara x-total-count.
pub fn deputado(dep: &Value, autores: Option<&Value>, n_prop: Option<u64>) -> Option<CardSpec> {
    let st = "/dados/ultimoStatus";
    let nome = s(dep, &format!("{st}/nomeEleitoral")).or_else(|| s(dep, "/dados/nomeCivil"))?;
    let sub = format!(
        "{}-{}",
        s(dep, &format!("{st}/siglaPartido")).unwrap_or_default(),
        s(dep, &format!("{st}/siglaUf")).unwrap_or_default()
    );
    let mut c = CardSpec::new(
        Kind::Deputado,
        "Deputado(a) federal",
        nome.clone(),
        sub.trim_matches('-').into(),
    );
    c.photo_url = s(dep, &format!("{st}/urlFoto"));
    if let Some(a) = autores.and_then(|a| find_autor(a, &nome)) {
        c = c
            .stat("Pago em emendas", compact_brl(i(a, "/pago").unwrap_or(0)))
            .stat("Emendas", i(a, "/n").unwrap_or(0).to_string());
    }
    if let Some(n) = n_prop {
        c = c.stat("Proposições", n.to_string());
    }
    Some(c)
}

fn find_autor<'a>(autores: &'a Value, nome: &str) -> Option<&'a Value> {
    let key = chave_nome(nome);
    autores
        .as_array()?
        .iter()
        .find(|a| a.get("chave").and_then(Value::as_str) == Some(key.as_str()))
}

pub fn senador(sen: &Value, autores: Option<&Value>) -> Option<CardSpec> {
    let p = "/DetalheParlamentar/Parlamentar/IdentificacaoParlamentar";
    let nome = s(sen, &format!("{p}/NomeParlamentar"))?;
    let sub = format!(
        "{}-{}",
        s(sen, &format!("{p}/SiglaPartidoParlamentar")).unwrap_or_default(),
        s(sen, &format!("{p}/UfParlamentar")).unwrap_or_default()
    );
    let mut c = CardSpec::new(
        Kind::Senador,
        "Senador(a)",
        nome.clone(),
        sub.trim_matches('-').into(),
    );
    c.photo_url =
        s(sen, &format!("{p}/UrlFotoParlamentar")).map(|u| u.replacen("http://", "https://", 1));
    if let Some(a) = autores.and_then(|a| find_autor(a, &nome)) {
        c = c
            .stat("Pago em emendas", compact_brl(i(a, "/pago").unwrap_or(0)))
            .stat("Emendas", i(a, "/n").unwrap_or(0).to_string());
    }
    Some(c)
}

fn totais(c: CardSpec, v: &Value) -> CardSpec {
    c.stat("Pago", compact_brl(i(v, "/totais/pago").unwrap_or(0)))
        .stat("Emendas", i(v, "/totais/n").unwrap_or(0).to_string())
}

pub fn municipio(m: &Value) -> Option<CardSpec> {
    let title = format!("{}-{}", s(m, "/nome")?, s(m, "/uf").unwrap_or_default());
    let sub = match (s(m, "/prefeito/nome"), s(m, "/prefeito/partido")) {
        (Some(n), Some(p)) => format!("Prefeito: {n} ({p})"),
        (Some(n), None) => format!("Prefeito: {n}"),
        _ => "Emendas parlamentares recebidas".into(),
    };
    Some(totais(
        CardSpec::new(Kind::Municipio, "Município", title, sub),
        m,
    ))
}

pub fn uf(u: &Value) -> Option<CardSpec> {
    let title = format!("{} ({})", s(u, "/nome")?, s(u, "/uf").unwrap_or_default());
    let n_mun = u
        .get("municipios")
        .and_then(Value::as_array)
        .map_or(0, Vec::len);
    let c = CardSpec::new(
        Kind::Uf,
        "Estado",
        title,
        "Emendas parlamentares destinadas ao estado".into(),
    );
    Some(totais(c, u).stat("Municípios", n_mun.to_string()))
}

pub fn autor(a: &Value) -> Option<CardSpec> {
    let c = CardSpec::new(
        Kind::Autor,
        "Autor de emendas",
        s(a, "/nome")?,
        format!("Código {}", s(a, "/codigo").unwrap_or_default()),
    );
    Some(totais(c, a))
}

pub fn proposicao(p: &Value) -> Option<CardSpec> {
    let d = "/dados";
    let title = format!(
        "{} {}/{}",
        s(p, &format!("{d}/siglaTipo"))?,
        s(p, &format!("{d}/numero"))?,
        s(p, &format!("{d}/ano"))?
    );
    let mut c = CardSpec::new(
        Kind::Proposicao,
        "Proposição",
        title,
        truncate(&s(p, &format!("{d}/ementa")).unwrap_or_default(), 180),
    );
    c.badge = s(p, &format!("{d}/statusProposicao/descricaoSituacao"));
    Some(c)
}

pub fn votacao(v: &Value, votos: Option<&Value>) -> Option<CardSpec> {
    let desc = s(v, "/dados/descricao")?;
    let eyebrow = format!(
        "Votação · {}",
        s(v, "/dados/siglaOrgao").unwrap_or_default()
    );
    let mut c = CardSpec::new(
        Kind::Votacao,
        eyebrow.trim_end_matches(" · "),
        truncate(&desc, 120),
        s(v, "/dados/data").unwrap_or_default(),
    );
    if let Some(list) = votos.and_then(|x| x.get("dados")).and_then(Value::as_array) {
        let count = |t: &str| {
            list.iter()
                .filter(|x| x.get("tipoVoto").and_then(Value::as_str) == Some(t))
                .count()
        };
        c = c
            .stat("Sim", count("Sim").to_string())
            .stat("Não", count("Não").to_string());
    }
    Some(c)
}

pub fn partido(p: &Value) -> Option<CardSpec> {
    let mut c = CardSpec::new(
        Kind::Partido,
        "Partido",
        s(p, "/dados/sigla")?,
        s(p, "/dados/nome").unwrap_or_default(),
    );
    if let Some(n) = s(p, "/dados/status/totalMembros") {
        c = c.stat("Deputados", n);
    }
    Some(c)
}
