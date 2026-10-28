//! Desfecho de proposições: norma gerada, sanção/veto, presidente na data. Pure.
//! Port of apps/web/src/features/legislativo/normas.ts (same tests in tests/normas.rs).
use serde_json::{json, Value};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Presidente {
    pub nome: &'static str,
    pub inicio: &'static str,
    pub fim: Option<&'static str>,
    pub interino: bool,
}

const fn pres(
    nome: &'static str,
    inicio: &'static str,
    fim: Option<&'static str>,
    interino: bool,
) -> Presidente {
    Presidente {
        nome,
        inicio,
        fim,
        interino,
    }
}

/// Presidentes desde 1995 (datas oficiais de posse/término).
pub const PRESIDENTES: &[Presidente] = &[
    pres(
        "Fernando Henrique Cardoso",
        "1995-01-01",
        Some("2002-12-31"),
        false,
    ),
    pres(
        "Luiz Inácio Lula da Silva",
        "2003-01-01",
        Some("2010-12-31"),
        false,
    ),
    pres("Dilma Rousseff", "2011-01-01", Some("2016-05-11"), false),
    pres("Michel Temer", "2016-05-12", Some("2016-08-30"), true),
    pres("Michel Temer", "2016-08-31", Some("2018-12-31"), false),
    pres("Jair Bolsonaro", "2019-01-01", Some("2022-12-31"), false),
    pres("Luiz Inácio Lula da Silva", "2023-01-01", None, false),
];

pub fn presidente_na_data(data: &str) -> Option<Presidente> {
    let d = data.get(..10).unwrap_or(data);
    PRESIDENTES
        .iter()
        .find(|p| d >= p.inicio && p.fim.is_none_or(|f| d <= f))
        .copied()
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Norma {
    pub tipo: &'static str,
    pub rotulo: &'static str,
    pub numero: u64,
    /// YYYY-MM-DD
    pub data: String,
}

/// Prefix (lowercase, no accents) -> (tipo, rótulo). Order matters ("lei" last).
const ROTULOS: &[(&str, &str, &str)] = &[
    (
        "emenda constitucional",
        "emenda.constitucional",
        "Emenda Constitucional",
    ),
    ("lei complementar", "lei.complementar", "Lei Complementar"),
    (
        "decreto legislativo",
        "decreto.legislativo",
        "Decreto Legislativo",
    ),
    ("resolucao", "resolucao", "Resolução"),
    (
        "medida provisoria",
        "medida.provisoria",
        "Medida Provisória",
    ),
    ("lei", "lei", "Lei"),
];

fn rotulo(tipo: &str) -> &'static str {
    ROTULOS.iter().find(|r| r.1 == tipo).map_or("Lei", |r| r.2)
}

/// Lowercase without accents (º/° kept).
pub fn fold(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'á' | 'à' | 'â' | 'ã' | 'ä' | 'Á' | 'À' | 'Â' | 'Ã' | 'Ä' => 'a',
            'é' | 'è' | 'ê' | 'ë' | 'É' | 'È' | 'Ê' | 'Ë' => 'e',
            'í' | 'ì' | 'î' | 'ï' | 'Í' | 'Ì' | 'Î' | 'Ï' => 'i',
            'ó' | 'ò' | 'ô' | 'õ' | 'ö' | 'Ó' | 'Ò' | 'Ô' | 'Õ' | 'Ö' => 'o',
            'ú' | 'ù' | 'û' | 'ü' | 'Ú' | 'Ù' | 'Û' | 'Ü' => 'u',
            'ç' | 'Ç' => 'c',
            'ñ' | 'Ñ' => 'n',
            c => c.to_ascii_lowercase(),
        })
        .collect()
}

/// Tiny cursor over chars for the hand-written matchers.
struct Cur<'a> {
    c: &'a [char],
    i: usize,
}

impl Cur<'_> {
    fn ws(&mut self) {
        while self.c.get(self.i).is_some_and(|c| c.is_whitespace()) {
            self.i += 1;
        }
    }
    fn many(&mut self, f: impl Fn(char) -> bool) -> String {
        let s = self.i;
        while self.c.get(self.i).is_some_and(|c| f(*c)) {
            self.i += 1;
        }
        self.c[s..self.i].iter().collect()
    }
    fn lit(&mut self, s: &str) -> bool {
        let w: Vec<char> = s.chars().collect();
        if self.c.get(self.i..self.i + w.len()) == Some(&w[..]) {
            self.i += w.len();
            true
        } else {
            false
        }
    }
    fn digits(&mut self, n: usize) -> Option<String> {
        let s = self.many(|c| c.is_ascii_digit());
        (s.len() == n).then_some(s)
    }
}

fn numero(s: &str) -> Option<u64> {
    let d: String = s.chars().filter(|c| *c != '.').collect();
    d.parse().ok()
}

/// `n[ºo°.]*\s*([\d.]+)\s*,?\s*de\s*(\d{2})/(\d{2})/(\d{4})`
fn match_numero_data(c: &[char], at: usize) -> Option<(u64, String)> {
    let mut k = Cur { c, i: at };
    if !k.lit("n") {
        return None;
    }
    k.many(|c| matches!(c, 'º' | 'o' | '°' | '.'));
    k.ws();
    let n = numero(&k.many(|c| c.is_ascii_digit() || c == '.'))?;
    k.ws();
    k.lit(",");
    k.ws();
    if !k.lit("de") {
        return None;
    }
    k.ws();
    let d = k.digits(2)?;
    k.lit("/").then_some(())?;
    let m = k.digits(2)?;
    k.lit("/").then_some(())?;
    let y = k.digits(4)?;
    Some((n, format!("{y}-{m}-{d}")))
}

/// "Lei nº 14.902 de 27/06/2024" -> norma.
pub fn parse_norma_gerada(s: &str) -> Option<Norma> {
    let t = fold(s);
    let t = t.trim();
    let r = ROTULOS.iter().find(|r| t.starts_with(r.0))?;
    let c: Vec<char> = t.chars().collect();
    let (numero, data) = (0..c.len()).find_map(|i| match_numero_data(&c, i))?;
    Some(Norma {
        tipo: r.1,
        rotulo: r.2,
        numero,
        data,
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Links {
    pub urn: String,
    pub lexml: String,
    pub normas: String,
    pub planalto: Option<String>,
}

fn ato_planalto(ano: u32) -> Option<String> {
    const F: &[(u32, u32)] = &[
        (2004, 2006),
        (2007, 2010),
        (2011, 2014),
        (2015, 2018),
        (2019, 2022),
        (2023, 2026),
        (2027, 2030),
    ];
    F.iter()
        .find(|(a, b)| (*a..=*b).contains(&ano))
        .map(|(a, b)| format!("_ato{a}-{b}"))
}

pub fn links_norma(n: &Norma) -> Links {
    let urn = format!("urn:lex:br:federal:{}:{};{}", n.tipo, n.data, n.numero);
    let ano: u32 = n.data.get(..4).and_then(|y| y.parse().ok()).unwrap_or(0);
    let base = "https://www.planalto.gov.br/ccivil_03";
    let planalto = match n.tipo {
        "lei" => ato_planalto(ano).map(|a| format!("{base}/{a}/{ano}/lei/l{}.htm", n.numero)),
        "lei.complementar" => Some(format!("{base}/leis/lcp/lcp{}.htm", n.numero)),
        "emenda.constitucional" => Some(format!(
            "{base}/constituicao/emendas/emc/emc{}.htm",
            n.numero
        )),
        _ => None,
    };
    Links {
        lexml: format!("https://www.lexml.gov.br/urn/{urn}"),
        normas: format!("https://normas.leg.br/?urn={urn}"),
        urn,
        planalto,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Veto {
    Parcial,
    Total,
}

impl Veto {
    pub fn as_str(self) -> &'static str {
        match self {
            Veto::Parcial => "parcial",
            Veto::Total => "total",
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct Entrada {
    pub situacao_camara: Option<String>,
    pub situacao_senado: Option<String>,
    pub norma_gerada: Option<String>,
    pub norma: Option<Norma>,
    pub veto: Option<Veto>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Desfecho {
    pub tipo: &'static str,
    pub rotulo: &'static str,
    pub veto: Option<Veto>,
    pub norma: Option<Norma>,
    pub presidente: Option<Presidente>,
    pub promulgada_congresso: bool,
}

/// Junta situação da Câmara e do Senado num desfecho legível.
pub fn desfecho(i: &Entrada) -> Desfecho {
    let t = fold(&format!(
        "{} | {}",
        i.situacao_camara.as_deref().unwrap_or(""),
        i.situacao_senado.as_deref().unwrap_or("")
    ));
    let norma = i
        .norma_gerada
        .as_deref()
        .and_then(parse_norma_gerada)
        .or_else(|| i.norma.clone());
    let veto = i.veto.or(
        if t.contains("veto parcial") || t.contains("vetado parcialmente") {
            Some(Veto::Parcial)
        } else if t.contains("veto total")
            || t.contains("vetado totalmente")
            || t.contains("vetada totalmente")
        {
            Some(Veto::Total)
        } else {
            None
        },
    );
    let tipo = if t.contains("norma juridica") || norma.is_some() {
        "lei"
    } else if veto == Some(Veto::Total) {
        "vetada"
    } else if t.contains("rejeitad") {
        "rejeitada"
    } else if t.contains("arquivad") {
        "arquivada"
    } else {
        "tramitando"
    };
    let promulgada_congresso = norma.as_ref().is_some_and(|n| {
        matches!(
            n.tipo,
            "emenda.constitucional" | "decreto.legislativo" | "resolucao"
        )
    });
    let rotulo = match tipo {
        "lei" => "Virou norma jurídica",
        "vetada" => "Vetada totalmente",
        "rejeitada" => "Rejeitada",
        "arquivada" => "Arquivada",
        _ => "Em tramitação",
    };
    let presidente = norma
        .as_ref()
        .filter(|_| !promulgada_congresso)
        .and_then(|n| presidente_na_data(&n.data));
    Desfecho {
        tipo,
        rotulo,
        veto,
        norma,
        presidente,
        promulgada_congresso,
    }
}

#[derive(Debug, Clone)]
pub struct Tramite {
    pub data_hora: String,
    pub descricao: String,
    pub despacho: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DaTramitacao {
    pub norma: Option<Norma>,
    pub veto: Option<Veto>,
    pub veto_derrubado: bool,
}

const TRANSF: &[(&str, &str)] = &[
    ("lei ordinaria", "lei"),
    ("lei complementar", "lei.complementar"),
    ("emenda constitucional", "emenda.constitucional"),
    ("decreto legislativo", "decreto.legislativo"),
    ("resolucao", "resolucao"),
    ("lei", "lei"),
];

/// `transformad[oa] n[ao]s?\s+(tipo)\s*(?:n[º°.o]*\s*)?([\d.]+)\s*/\s*(\d{4})` -> (tipo, número).
fn match_transformado(c: &[char], at: usize) -> Option<(&'static str, u64)> {
    let mut k = Cur { c, i: at };
    if !k.lit("transformad")
        || !(k.lit("o") || k.lit("a"))
        || !k.lit(" n")
        || !(k.lit("a") || k.lit("o"))
    {
        return None;
    }
    k.lit("s");
    let w = k.i;
    k.ws();
    if k.i == w {
        return None;
    }
    let tipo = TRANSF.iter().find(|(s, _)| k.lit(s))?.1;
    k.ws();
    let save = k.i;
    if k.lit("n") {
        k.many(|c| matches!(c, 'º' | '°' | '.' | 'o'));
        k.ws();
        if !k.c.get(k.i).is_some_and(|c| c.is_ascii_digit()) {
            k.i = save;
        }
    }
    let n = numero(&k.many(|c| c.is_ascii_digit() || c == '.'))?;
    k.ws();
    k.lit("/").then_some(())?;
    k.ws();
    k.digits(4)?;
    Some((tipo, n))
}

/// Lê a norma gerada nas tramitações da Câmara ("Transformado na Lei Ordinária 14902/2024").
pub fn norma_da_tramitacao(ts: &[Tramite]) -> DaTramitacao {
    let mut r = DaTramitacao {
        norma: None,
        veto: None,
        veto_derrubado: false,
    };
    for t in ts {
        let txt = fold(&format!("{} {}", t.descricao, t.despacho));
        if txt.contains("rejeicao de veto")
            || txt.contains("veto derrubado")
            || txt.contains("veto foi derrubado")
        {
            r.veto_derrubado = true;
        }
        if txt.contains("vetado parcialmente") || txt.contains("veto parcial") {
            r.veto = Some(Veto::Parcial);
        } else if txt.contains("vetado totalmente") || txt.contains("veto total") {
            r.veto = Some(Veto::Total);
        }
        if r.norma.is_none() {
            let c: Vec<char> = txt.chars().collect();
            if let Some((tipo, numero)) = (0..c.len()).find_map(|i| match_transformado(&c, i)) {
                r.norma = Some(Norma {
                    tipo,
                    rotulo: rotulo(tipo),
                    numero,
                    data: t.data_hora.get(..10).unwrap_or(&t.data_hora).to_string(),
                });
            }
        }
    }
    r
}

pub fn norma_json(n: &Norma) -> Value {
    let l = links_norma(n);
    json!({
        "tipo": n.tipo, "rotulo": n.rotulo, "numero": n.numero, "data": n.data,
        "links": { "urn": l.urn, "lexml": l.lexml, "normas": l.normas, "planalto": l.planalto },
    })
}

pub fn desfecho_json(d: &Desfecho, veto_derrubado: bool) -> Value {
    json!({
        "tipo": d.tipo,
        "rotulo": d.rotulo,
        "veto": d.veto.map(Veto::as_str),
        "vetoDerrubado": veto_derrubado,
        "norma": d.norma.as_ref().map(norma_json),
        "presidente": d.presidente.map(|p| json!({ "nome": p.nome, "inicio": p.inicio, "fim": p.fim, "interino": p.interino })),
        "promulgadaPeloCongresso": d.promulgada_congresso,
    })
}
