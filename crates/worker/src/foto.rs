//! Politician photos for OG cards and client share images. Pure.
//!
//! `/og-img/{deputado|senador}/{id}` and `/og-img/nome/{CHAVE-COM-HIFENS}` serve bytes
//! same-origin with CORS (no redirects), so canvases stay untainted.
use crate::cards::chave_nome;
use crate::cdn::RAW_BASE;
use crate::seo::pages::title_case;
use serde_json::Value;

/// How a card refers to a photo; resolved by the glue.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Foto {
    Deputado(u64),
    Senador(u64),
    /// `chaveNome` of an emenda author; resolved by name lookup.
    Nome(String),
    /// Absolute https URL.
    Url(String),
}

/// `/og-img/*` target.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OgImg {
    Deputado(u64),
    Senador(u64),
    Nome(String),
}

/// A resolved politician.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Pessoa {
    pub casa: Casa,
    pub id: u64,
    pub nome: String,
    pub partido: String,
    pub uf: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Casa {
    Camara,
    Senado,
}

fn id(s: &str) -> Option<u64> {
    (!s.is_empty() && s.len() <= 12 && s.bytes().all(|b| b.is_ascii_digit()))
        .then(|| s.parse().ok())
        .flatten()
}

/// `rest` after `/og-img/`.
pub fn parse(rest: &str) -> Option<OgImg> {
    let (kind, v) = rest.split_once('/')?;
    match kind {
        "deputado" => id(v).map(OgImg::Deputado),
        "senador" => id(v).map(OgImg::Senador),
        "nome" => {
            let ok = !v.is_empty()
                && v.len() <= 80
                && v.bytes().all(|b| b.is_ascii_uppercase() || b == b'-')
                && !v.starts_with('-')
                && !v.ends_with('-');
            ok.then(|| OgImg::Nome(v.replace('-', " ")))
        }
        _ => None,
    }
}

/// Same-origin path for the client (`None` for plain URLs).
pub fn path(f: &Foto) -> Option<String> {
    Some(match f {
        Foto::Deputado(id) => format!("/og-img/deputado/{id}"),
        Foto::Senador(id) => format!("/og-img/senador/{id}"),
        Foto::Nome(c) => format!("/og-img/nome/{}", chave_nome(c).replace(' ', "-")),
        Foto::Url(_) => return None,
    })
}

/// Fetch order for one photo: mirror (`size` 160 or 512) then the official site.
pub fn candidates(img: &OgImg, size: u32) -> Vec<String> {
    let size = if size > 160 { 512 } else { 160 };
    match img {
        OgImg::Deputado(id) => vec![
            format!("{RAW_BASE}foto/deputado/{id}-{size}.webp"),
            format!("https://www.camara.leg.br/internet/deputado/bandep/{id}.jpg"),
        ],
        OgImg::Senador(id) => vec![
            format!("{RAW_BASE}foto/senador/{id}-{size}.webp"),
            format!("https://www.senado.leg.br/senadores/img/fotos-oficiais/senador{id}.jpg"),
        ],
        OgImg::Nome(_) => vec![],
    }
}

/// Party logo: mirror, then the Câmara GIF.
pub fn logo_candidates(sigla: &str) -> Vec<String> {
    vec![
        format!("{RAW_BASE}logo/partido/{sigla}.webp"),
        format!("https://www.camara.leg.br/internet/Deputado/img/partidos/{sigla}.gif"),
    ]
}

/// State flag (SVG) from the mirror.
pub fn flag_candidates(uf: &str) -> Vec<String> {
    vec![format!("{RAW_BASE}bandeira/uf/{uf}.svg")]
}

/// Câmara search across the last four legislatures (2011+), newest first.
pub fn nome_query(chave: &str) -> String {
    let q = chave_nome(chave).replace(' ', "%20");
    format!(
        "deputados?nome={q}&idLegislatura=57&idLegislatura=56&idLegislatura=55&idLegislatura=54&ordem=DESC&ordenarPor=idLegislatura&itens=20"
    )
}

/// Senado list of senators in office.
pub const SENADO_LISTA: &str = "senador/lista/atual";

fn str_at(v: &Value, k: &str) -> String {
    match v.get(k) {
        Some(Value::String(s)) => s.trim().to_string(),
        Some(Value::Number(n)) => n.to_string(),
        _ => String::new(),
    }
}

/// Exact `chaveNome` match only (no fuzzy fallback: "X Filho" is another person).
pub fn deputado_por_nome(resp: &Value, chave: &str) -> Option<Pessoa> {
    let list = resp.get("dados")?.as_array()?;
    let key = chave_nome(chave);
    let hit = list
        .iter()
        .find(|d| chave_nome(&str_at(d, "nome")) == key)?;
    Some(Pessoa {
        casa: Casa::Camara,
        id: hit.get("id")?.as_u64()?,
        nome: title_case(&str_at(hit, "nome")),
        partido: str_at(hit, "siglaPartido"),
        uf: str_at(hit, "siglaUf"),
    })
}

/// Exact `chaveNome` match on `NomeParlamentar` (or full name).
pub fn senador_por_nome(lista: &Value, chave: &str) -> Option<Pessoa> {
    let ps = lista.pointer("/ListaParlamentarEmExercicio/Parlamentares/Parlamentar")?;
    let list: Vec<&Value> = match ps {
        Value::Array(a) => a.iter().collect(),
        v @ Value::Object(_) => vec![v],
        _ => return None,
    };
    let key = chave_nome(chave);
    list.into_iter().find_map(|p| {
        let idp = p.get("IdentificacaoParlamentar")?;
        let nomes = [
            str_at(idp, "NomeParlamentar"),
            str_at(idp, "NomeCompletoParlamentar"),
        ];
        nomes.iter().any(|n| chave_nome(n) == key).then(|| Pessoa {
            casa: Casa::Senado,
            id: str_at(idp, "CodigoParlamentar").parse().unwrap_or(0),
            nome: str_at(idp, "NomeParlamentar"),
            partido: str_at(idp, "SiglaPartidoParlamentar"),
            uf: str_at(idp, "UfParlamentar"),
        })
    })
}

impl Pessoa {
    pub fn img(&self) -> OgImg {
        match self.casa {
            Casa::Camara => OgImg::Deputado(self.id),
            Casa::Senado => OgImg::Senador(self.id),
        }
    }
    /// "PSD-BA".
    pub fn tag(&self) -> String {
        format!("{}-{}", self.partido, self.uf)
            .trim_matches('-')
            .to_string()
    }
}

/// Image content type from magic bytes (PNG, JPEG, WebP, GIF).
pub fn sniff(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("image/jpeg")
    } else if bytes.len() > 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else if bytes.starts_with(b"GIF8") {
        Some("image/gif")
    } else {
        None
    }
}

/// `/og-img` responses: 7 days at the edge and in browsers.
pub const CACHE_CONTROL: &str =
    "public, max-age=604800, s-maxage=604800, stale-while-revalidate=604800";
