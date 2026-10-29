//! Upstream API JSON -> asset sources. Pure.
use super::manifesto::Tipo;
use serde_json::Value;
use std::collections::BTreeMap;

pub const CAMARA: &str = "https://dadosabertos.camara.leg.br/api/v2/";
pub const SENADO: &str = "https://legis.senado.leg.br/dadosabertos/";

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub enum Alvo {
    Deputado(u64),
    Senador(u64),
    Partido(String),
    Proposicao(u64),
    Frente(u64),
    /// IBGE code of the município (TSE 2024 photo of the elected prefeito).
    Prefeito(String),
    VicePrefeito(String),
    BandeiraUf(String),
    BandeiraBrasil,
    /// IBGE code; Wikidata P41 (flag) / P94 (coat of arms), Commons thumbnails.
    BandeiraMunicipio(String),
    BrasaoMunicipio(String),
    /// TSE candidate photo `(ano, SQ_CANDIDATO)` (eleitos without a Câmara/Senado id).
    CandidatoTse(u16, u64),
}

impl Alvo {
    /// Party with a path-safe sigla (`[A-Za-z0-9]{1,20}`).
    pub fn partido(sigla: &str) -> Option<Self> {
        let ok = !sigla.is_empty()
            && sigla.len() <= 20
            && sigla.bytes().all(|b| b.is_ascii_alphanumeric());
        ok.then(|| Alvo::Partido(sigla.to_string()))
    }

    pub fn chave(&self) -> String {
        match self {
            Alvo::Deputado(id) => format!("foto/deputado/{id}"),
            Alvo::Senador(id) => format!("foto/senador/{id}"),
            Alvo::Partido(s) => format!("logo/partido/{s}"),
            Alvo::Proposicao(id) => format!("pdf/proposicao/{id}"),
            Alvo::Frente(id) => format!("pdf/frente/{id}"),
            Alvo::Prefeito(ibge) => format!("foto/prefeito/{ibge}"),
            Alvo::VicePrefeito(ibge) => format!("foto/vice-prefeito/{ibge}"),
            Alvo::BandeiraUf(uf) => format!("bandeira/uf/{uf}"),
            Alvo::BandeiraBrasil => "bandeira/pais/BR".into(),
            Alvo::BandeiraMunicipio(ibge) => format!("bandeira/municipio/{ibge}"),
            Alvo::BrasaoMunicipio(ibge) => format!("brasao/municipio/{ibge}"),
            Alvo::CandidatoTse(ano, sq) => format!("foto/tse/{ano}/{sq}"),
        }
    }

    pub fn tipo(&self) -> Tipo {
        match self {
            Alvo::Deputado(_)
            | Alvo::Senador(_)
            | Alvo::Prefeito(_)
            | Alvo::VicePrefeito(_)
            | Alvo::CandidatoTse(..) => Tipo::Foto,
            Alvo::BandeiraUf(_)
            | Alvo::BandeiraBrasil
            | Alvo::BandeiraMunicipio(_)
            | Alvo::BrasaoMunicipio(_) => Tipo::Bandeira,
            Alvo::Partido(_) => Tipo::Logo,
            Alvo::Proposicao(_) | Alvo::Frente(_) => Tipo::Pdf,
        }
    }

    /// Output paths. `svg`: the upstream logo is SVG (kept as-is).
    pub fn variantes(&self, svg: bool) -> Vec<String> {
        let c = self.chave();
        if let Alvo::BandeiraMunicipio(_) | Alvo::BrasaoMunicipio(_) = self {
            return vec![format!("{c}-64.webp"), format!("{c}-256.webp")];
        }
        match self.tipo() {
            Tipo::Foto => vec![
                format!("{c}-160.webp"),
                format!("{c}-512.webp"),
                format!("{c}-512.jpg"),
            ],
            Tipo::Logo if svg => vec![format!("{c}.svg")],
            Tipo::Logo => vec![format!("{c}.webp")],
            Tipo::Pdf => vec![format!("{c}.pdf")],
            Tipo::Bandeira => vec![format!("{c}.svg"), format!("{c}-64.webp")],
        }
    }
}

/// Where the bytes come from: a direct URL or a Câmara detail path resolved later.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Origem {
    Url(String),
    /// Câmara API path (e.g. `proposicoes/1`); see [`resolver`].
    Camara(String),
    /// Wikimedia Commons file title; see [`commons`].
    Commons(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Fonte {
    pub alvo: Alvo,
    pub origem: Origem,
}

fn dados(v: &Value) -> &[Value] {
    v["dados"].as_array().map(Vec::as_slice).unwrap_or(&[])
}

fn https(u: &str) -> String {
    match u.strip_prefix("http://") {
        Some(r) => format!("https://{r}"),
        None => u.to_string(),
    }
}

/// Keeps the first source per key, ordered by key.
pub fn dedupe(v: Vec<Fonte>) -> Vec<Fonte> {
    let mut m = BTreeMap::new();
    for f in v {
        m.entry(f.alvo.clone()).or_insert(f);
    }
    m.into_values().collect()
}

/// `links[rel=next].href` of a Câmara page.
pub fn proximo(v: &Value) -> Option<String> {
    v["links"].as_array()?.iter().find(|l| l["rel"] == "next")?["href"]
        .as_str()
        .map(String::from)
}

pub fn foto_deputado(id: u64) -> String {
    format!("https://www.camara.leg.br/internet/deputado/bandep/{id}.jpg")
}

pub fn foto_senador(codigo: u64) -> String {
    format!("https://www.senado.leg.br/senadores/img/fotos-oficiais/senador{codigo}.jpg")
}

/// `/deputados` page -> photos (deduped by id).
pub fn deputados(v: &Value) -> Vec<Fonte> {
    let v = dados(v)
        .iter()
        .filter_map(|d| {
            let id = d["id"].as_u64()?;
            let url = d["urlFoto"]
                .as_str()
                .filter(|u| !u.is_empty())
                .map(https)
                .unwrap_or_else(|| foto_deputado(id));
            Some(Fonte {
                alvo: Alvo::Deputado(id),
                origem: Origem::Url(url),
            })
        })
        .collect();
    dedupe(v)
}

/// Senado `lista/atual` or `lista/legislatura/..` -> photos.
pub fn senadores(v: &Value) -> Vec<Fonte> {
    let lista = ["ListaParlamentarEmExercicio", "ListaParlamentarLegislatura"]
        .iter()
        .find_map(|k| v.get(k))
        .map(|l| &l["Parlamentares"]["Parlamentar"]);
    let ps: Vec<&Value> = match lista {
        Some(Value::Array(a)) => a.iter().collect(),
        Some(o @ Value::Object(_)) => vec![o],
        _ => vec![],
    };
    ps.into_iter()
        .filter_map(|p| {
            let c = &p["IdentificacaoParlamentar"]["CodigoParlamentar"];
            let id = c
                .as_u64()
                .or_else(|| c.as_str().and_then(|s| s.parse().ok()))?;
            Some(Fonte {
                alvo: Alvo::Senador(id),
                origem: Origem::Url(foto_senador(id)),
            })
        })
        .collect()
}

/// `/partidos` -> logos (resolved via `partidos/{id}`).
pub fn partidos(v: &Value) -> Vec<Fonte> {
    dados(v)
        .iter()
        .filter_map(|p| {
            let id = p["id"].as_u64()?;
            Some(Fonte {
                alvo: Alvo::partido(p["sigla"].as_str()?)?,
                origem: Origem::Camara(format!("partidos/{id}")),
            })
        })
        .collect()
}

/// `/votacoes` page -> proposição ids (votação id = `{idProposicao}-{seq}`), first-seen order.
pub fn proposicoes_votadas(v: &Value) -> Vec<u64> {
    let mut out = Vec::new();
    for d in dados(v) {
        let id = d["id"]
            .as_str()
            .and_then(|s| s.split_once('-'))
            .and_then(|(p, _)| p.parse::<u64>().ok());
        if let Some(id) = id.filter(|i| !out.contains(i)) {
            out.push(id);
        }
    }
    out
}

pub fn proposicao(id: u64) -> Fonte {
    Fonte {
        alvo: Alvo::Proposicao(id),
        origem: Origem::Camara(format!("proposicoes/{id}")),
    }
}

/// `/frentes` -> statutes (resolved via `frentes/{id}`).
pub fn frentes(v: &Value) -> Vec<Fonte> {
    dados(v)
        .iter()
        .filter_map(|f| {
            let id = f["id"].as_u64()?;
            Some(Fonte {
                alvo: Alvo::Frente(id),
                origem: Origem::Camara(format!("frentes/{id}")),
            })
        })
        .collect()
}

/// `camaraId: N` entries of `apps/web/src/features/legislativo/pautas.ts`, deduped, file order.
pub fn pautas(ts: &str) -> Vec<u64> {
    let mut out = Vec::new();
    for part in ts.split("camaraId").skip(1) {
        let n: String = part
            .trim_start_matches([':', ' ', '\t'])
            .chars()
            .take_while(char::is_ascii_digit)
            .collect();
        if let Ok(id) = n.parse::<u64>() {
            if !out.contains(&id) {
                out.push(id);
            }
        }
    }
    out
}

/// Upstream URL from a Câmara detail response (`Origem::Camara`).
pub fn resolver(alvo: &Alvo, detalhe: &Value) -> Option<String> {
    let campo = match alvo {
        Alvo::Proposicao(_) => "urlInteiroTeor",
        Alvo::Frente(_) => "urlDocumento",
        Alvo::Partido(_) => "urlLogo",
        _ => return None,
    };
    detalhe["dados"][campo]
        .as_str()
        .filter(|u| !u.trim().is_empty())
        .map(|u| https(u.trim()))
}

fn dias_no_mes(y: i64, m: i64) -> i64 {
    match m {
        2 if (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    }
}

/// `meses` months ending in the month of `hoje`, as 3-month `(inicio, fim)` windows
/// (the Câmara `/votacoes` range limit), oldest first.
pub fn janelas(hoje: (i64, i64, i64), meses: i64) -> Vec<(String, String)> {
    let (y, m, _) = hoje;
    let fim_idx = y * 12 + (m - 1);
    let mut ini = fim_idx - meses + 1;
    let mut out = Vec::new();
    while ini <= fim_idx {
        let fim = (ini + 2).min(fim_idx);
        let (ya, ma) = (ini.div_euclid(12), ini.rem_euclid(12) + 1);
        let (yb, mb) = (fim.div_euclid(12), fim.rem_euclid(12) + 1);
        out.push((
            format!("{ya:04}-{ma:02}-01"),
            format!("{yb:04}-{mb:02}-{:02}", dias_no_mes(yb, mb)),
        ));
        ini = fim + 1;
    }
    out
}

// ---------- TSE 2024 (prefeitos e vices eleitos) ----------

/// Photo inside the TSE per-UF zip.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FotoTse {
    pub alvo: Alvo,
    pub ano: u16,
    pub uf: String,
    pub sq: u64,
}

/// Elected prefeitos and vices (IBGE -> SQ_CANDIDATO), ordered by IBGE.
pub fn prefeitos(tse: &crate::read::Tse) -> Vec<FotoTse> {
    let mut v: Vec<_> = tse.por_ibge.iter().collect();
    v.sort_by(|a, b| a.0.cmp(b.0));
    let mut out = Vec::new();
    for (ibge, p) in v {
        let Some(uf) = crate::norm::uf_de_codigo(ibge) else {
            continue;
        };
        let mut push = |alvo: Alvo, sq: &str| {
            if let Ok(sq) = sq.trim().parse() {
                out.push(FotoTse {
                    alvo,
                    ano: 2024,
                    uf: uf.to_string(),
                    sq,
                });
            }
        };
        push(Alvo::Prefeito(ibge.clone()), &p.sq);
        if let Some(vc) = &p.vice {
            push(Alvo::VicePrefeito(ibge.clone()), &vc.sq);
        }
    }
    out
}

pub fn zip_tse(ano: u16, uf: &str) -> String {
    format!("https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes{ano}/fotos/foto_cand{ano}_{uf}_div.zip")
}

/// `F{UF}{SQ}_div.jpeg` -> SQ.
pub fn sq_da_entrada(nome: &str) -> Option<u64> {
    let r = nome.strip_prefix('F')?;
    let r = r.get(2..)?;
    let (sq, _) = r.split_once("_div.")?;
    sq.parse().ok()
}

// ---------- Bandeiras (Wikimedia Commons, domínio público) ----------

const BANDEIRAS: [(&str, &str); 28] = [
    ("AC", "Bandeira do Acre.svg"),
    ("AL", "Bandeira de Alagoas.svg"),
    ("AP", "Bandeira do Amapá.svg"),
    ("AM", "Bandeira do Amazonas.svg"),
    ("BA", "Bandeira da Bahia.svg"),
    ("CE", "Bandeira do Ceará.svg"),
    ("DF", "Bandeira do Distrito Federal (Brasil).svg"),
    ("ES", "Bandeira do Espírito Santo.svg"),
    ("GO", "Flag of Goiás.svg"),
    ("MA", "Bandeira do Maranhão.svg"),
    ("MT", "Bandeira de Mato Grosso.svg"),
    ("MS", "Bandeira de Mato Grosso do Sul.svg"),
    ("MG", "Bandeira de Minas Gerais.svg"),
    ("PA", "Bandeira do Pará.svg"),
    ("PB", "Bandeira da Paraíba.svg"),
    ("PR", "Bandeira do Paraná.svg"),
    ("PE", "Bandeira de Pernambuco.svg"),
    ("PI", "Bandeira do Piauí.svg"),
    ("RJ", "Bandeira do estado do Rio de Janeiro.svg"),
    ("RN", "Bandeira do Rio Grande do Norte.svg"),
    ("RS", "Bandeira do Rio Grande do Sul.svg"),
    ("RO", "Bandeira de Rondônia.svg"),
    ("RR", "Bandeira de Roraima.svg"),
    ("SC", "Bandeira de Santa Catarina.svg"),
    ("SP", "Bandeira do estado de São Paulo.svg"),
    ("SE", "Bandeira de Sergipe.svg"),
    ("TO", "Bandeira do Tocantins.svg"),
    ("BR", "Flag of Brazil.svg"),
];

pub fn bandeiras() -> Vec<Fonte> {
    BANDEIRAS
        .iter()
        .map(|(uf, t)| Fonte {
            alvo: match *uf {
                "BR" => Alvo::BandeiraBrasil,
                u => Alvo::BandeiraUf(u.into()),
            },
            origem: Origem::Commons((*t).into()),
        })
        .collect()
}

fn pct(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (b as char).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}

/// Commons API URL: original file URL + license of `File:{titulo}`.
pub fn commons_api(titulo: &str) -> String {
    format!(
        "https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url%7Cextmetadata&iiextmetadatafilter=LicenseShortName&titles={}",
        pct(&format!("File:{titulo}"))
    )
}

/// Commons API response -> (file URL without query, license).
pub fn commons(v: &Value) -> Option<(String, Option<String>)> {
    let pages = v["query"]["pages"].as_object()?;
    let ii = pages.values().find_map(|p| p["imageinfo"].get(0))?;
    let url = ii["url"].as_str()?.split('?').next()?.to_string();
    let lic = ii["extmetadata"]["LicenseShortName"]["value"]
        .as_str()
        .map(String::from);
    Some((url, lic))
}

// ---------- Bandeiras e brasões municipais (Wikidata P1585/P41/P94 + Commons) ----------

pub const WIKIDATA_SPARQL: &str = "SELECT ?ibge ?flag ?coa WHERE { ?m wdt:P1585 ?ibge . OPTIONAL { ?m wdt:P41 ?flag } OPTIONAL { ?m wdt:P94 ?coa } }";

pub fn wikidata_api() -> String {
    format!(
        "https://query.wikidata.org/sparql?format=json&query={}",
        pct(WIKIDATA_SPARQL)
    )
}

fn pct_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Some(x) = std::str::from_utf8(&b[i + 1..i + 3])
                .ok()
                .and_then(|h| u8::from_str_radix(h, 16).ok())
            {
                out.push(x);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// SPARQL result -> first flag / coat of arms per IBGE code (7 digits), as Commons titles.
pub fn wikidata_emblemas(v: &Value) -> Vec<(Alvo, String)> {
    let mut m: BTreeMap<Alvo, String> = BTreeMap::new();
    let titulo = |b: &Value, k: &str| {
        let u = b[k]["value"].as_str()?;
        Some(pct_decode(u.rsplit_once("Special:FilePath/")?.1))
    };
    for b in v["results"]["bindings"].as_array().into_iter().flatten() {
        let Some(ibge) = b["ibge"]["value"]
            .as_str()
            .filter(|i| i.len() == 7 && i.bytes().all(|c| c.is_ascii_digit()))
        else {
            continue;
        };
        if let Some(t) = titulo(b, "flag") {
            m.entry(Alvo::BandeiraMunicipio(ibge.into())).or_insert(t);
        }
        if let Some(t) = titulo(b, "coa") {
            m.entry(Alvo::BrasaoMunicipio(ibge.into())).or_insert(t);
        }
    }
    m.into_iter().collect()
}

/// Commons file: download URL (thumbnail) + attribution.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Credito {
    pub url: String,
    pub licenca: Option<String>,
    pub autor: Option<String>,
    pub pagina: Option<String>,
    pub atribuicao: bool,
}

/// Up to 50 titles per request.
pub fn commons_lote_api(titulos: &[String], largura: u32) -> String {
    let t: Vec<String> = titulos.iter().map(|t| format!("File:{t}")).collect();
    format!(
        "https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url%7Cextmetadata&iiurlwidth={largura}&iiextmetadatafilter=LicenseShortName%7CArtist%7CAttributionRequired&titles={}",
        pct(&t.join("|"))
    )
}

fn sem_tags(html: &str) -> String {
    let mut out = String::new();
    let mut dentro = false;
    for c in html.chars() {
        match c {
            '<' => dentro = true,
            '>' => dentro = false,
            c if !dentro => out.push(c),
            _ => {}
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Batch response -> title (without `File:`, as requested) -> credit.
pub fn commons_lote(v: &Value) -> BTreeMap<String, Credito> {
    let q = &v["query"];
    let mut de_para: BTreeMap<String, String> = BTreeMap::new();
    for n in q["normalized"].as_array().into_iter().flatten() {
        if let (Some(f), Some(t)) = (n["from"].as_str(), n["to"].as_str()) {
            de_para.insert(t.to_string(), f.to_string());
        }
    }
    let mut out = BTreeMap::new();
    for p in q["pages"].as_object().into_iter().flat_map(|o| o.values()) {
        let (Some(t), Some(ii)) = (p["title"].as_str(), p["imageinfo"].get(0)) else {
            continue;
        };
        let pedido = de_para.get(t).map(String::as_str).unwrap_or(t);
        let Some(url) = ii["thumburl"].as_str().or(ii["url"].as_str()) else {
            continue;
        };
        let meta = &ii["extmetadata"];
        let txt = |k: &str| {
            meta[k]["value"]
                .as_str()
                .map(sem_tags)
                .filter(|s| !s.is_empty())
        };
        out.insert(
            pedido.trim_start_matches("File:").to_string(),
            Credito {
                url: url.to_string(),
                licenca: txt("LicenseShortName"),
                autor: txt("Artist"),
                pagina: ii["descriptionurl"].as_str().map(String::from),
                atribuicao: meta["AttributionRequired"]["value"].as_str() == Some("true"),
            },
        );
    }
    out
}

// ---------- nomes (índice por nome para quem não tem id) ----------

/// `(nome, uf, chave da foto)` of a `/deputados` page.
pub fn nomes_deputados(v: &Value) -> Vec<(String, Option<String>, String)> {
    dados(v)
        .iter()
        .filter_map(|d| {
            let id = d["id"].as_u64()?;
            Some((
                d["nome"].as_str()?.to_string(),
                d["siglaUf"].as_str().map(String::from),
                Alvo::Deputado(id).chave(),
            ))
        })
        .collect()
}

/// `(nome, uf, chave)` of a Senado list (parliamentary and full name).
pub fn nomes_senadores(v: &Value) -> Vec<(String, Option<String>, String)> {
    let lista = ["ListaParlamentarEmExercicio", "ListaParlamentarLegislatura"]
        .iter()
        .find_map(|k| v.get(k))
        .map(|l| &l["Parlamentares"]["Parlamentar"]);
    let ps: Vec<&Value> = match lista {
        Some(Value::Array(a)) => a.iter().collect(),
        Some(o @ Value::Object(_)) => vec![o],
        _ => vec![],
    };
    let mut out = Vec::new();
    for p in ps {
        let i = &p["IdentificacaoParlamentar"];
        let c = &i["CodigoParlamentar"];
        let Some(id) = c
            .as_u64()
            .or_else(|| c.as_str().and_then(|s| s.parse().ok()))
        else {
            continue;
        };
        let m = &p["Mandatos"]["Mandato"];
        let uf = i["UfParlamentar"]
            .as_str()
            .or(m["UfParlamentar"].as_str())
            .or(m[0]["UfParlamentar"].as_str())
            .map(String::from);
        for k in ["NomeParlamentar", "NomeCompletoParlamentar"] {
            if let Some(n) = i[k].as_str().filter(|n| !n.is_empty()) {
                out.push((n.to_string(), uf.clone(), Alvo::Senador(id).chave()));
            }
        }
    }
    out
}
