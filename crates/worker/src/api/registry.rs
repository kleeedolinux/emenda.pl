//! Single endpoint registry: routing, validation, caps, canonical cache keys and the
//! OpenAPI spec are all derived from `OPS`. Pure.
use super::{ApiError, MAX_OFFSET, MAX_Q, MAX_QUERY};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Chars {
    Digits,
    /// Two letters, uppercased.
    Uf,
    /// `[A-Za-z0-9]`.
    Code,
    /// `digits-digits` (Câmara votação id).
    VotId,
    /// `YYYYMM`.
    Month,
    /// Free text (trimmed, whitespace collapsed, no control chars).
    Text,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Ty {
    Int {
        min: i64,
        max: i64,
    },
    Str {
        min: usize,
        max: usize,
        chars: Chars,
    },
    Enum(&'static [&'static str]),
    Date,
    Bool,
    /// Comma-separated codes, uppercased.
    Codes {
        max: usize,
    },
}

#[derive(Debug, Clone, Copy)]
pub struct Param {
    pub name: &'static str,
    pub path: bool,
    pub ty: Ty,
    pub required: bool,
    pub desc: &'static str,
    pub example: &'static str,
}

#[derive(Debug, Clone, Copy)]
pub struct List {
    pub default: usize,
    pub max: usize,
    /// Fields accepted by `?ordem=`.
    pub sort: &'static [&'static str],
    /// Paged upstream (Câmara): `offset` must be a multiple of `limit`.
    pub upstream: bool,
}

#[derive(Debug)]
pub struct Op {
    pub id: &'static str,
    pub path: &'static str,
    pub tag: &'static str,
    pub summary: &'static str,
    pub desc: &'static str,
    pub params: &'static [Param],
    pub list: Option<List>,
    /// JSON pointer of the rows used for `?formato=csv` on object bodies.
    pub rows: Option<&'static str>,
    pub ttl: u32,
    pub fonte: &'static [&'static str],
    pub example: &'static str,
    /// Served without the `{data, meta}` envelope (OpenAPI document).
    pub bare: bool,
}

impl Op {
    pub fn csv(&self) -> bool {
        self.list.is_some() || self.rows.is_some()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Req {
    pub op: &'static Op,
    /// Validated path + query params (canonical string form).
    pub args: BTreeMap<&'static str, String>,
    pub limit: usize,
    pub offset: usize,
    /// (field, descending)
    pub ordem: Option<(String, bool)>,
    pub campos: Option<Vec<String>>,
    pub csv: bool,
}

impl PartialEq for Op {
    fn eq(&self, o: &Self) -> bool {
        self.id == o.id
    }
}
impl Eq for Op {}

impl Req {
    pub fn arg(&self, n: &str) -> Option<&str> {
        self.args.get(n).map(String::as_str)
    }
    pub fn int(&self, n: &str) -> Option<i64> {
        self.arg(n)?.parse().ok()
    }
    pub fn flag(&self, n: &str) -> Option<bool> {
        self.arg(n).map(|v| v == "true")
    }
    pub fn canonical(&self) -> String {
        self.canonical_at(self.offset)
    }
    /// Canonical path+query with another offset (`paginacao.proximo`).
    pub fn canonical_at(&self, offset: usize) -> String {
        let mut path = String::new();
        let mut q: Vec<(String, String)> = Vec::new();
        for seg in self.op.path.split('/').filter(|s| !s.is_empty()) {
            path.push('/');
            match seg.strip_prefix('{').and_then(|s| s.strip_suffix('}')) {
                Some(n) => path.push_str(self.arg(n).unwrap_or_default()),
                None => path.push_str(seg),
            }
        }
        for p in self.op.params.iter().filter(|p| !p.path) {
            if let Some(v) = self.arg(p.name) {
                q.push((p.name.into(), enc(v)));
            }
        }
        if self.op.list.is_some() {
            q.push(("limit".into(), self.limit.to_string()));
            q.push(("offset".into(), offset.to_string()));
        }
        if let Some((f, desc)) = &self.ordem {
            q.push((
                "ordem".into(),
                format!("{}{f}", if *desc { "-" } else { "" }),
            ));
        }
        if let Some(c) = &self.campos {
            q.push(("campos".into(), c.join(",")));
        }
        if self.csv {
            q.push(("formato".into(), "csv".into()));
        }
        q.sort();
        if q.is_empty() {
            return path;
        }
        let qs: Vec<String> = q.into_iter().map(|(k, v)| format!("{k}={v}")).collect();
        format!("{path}?{}", qs.join("&"))
    }
}

/// Percent-encodes everything outside `[A-Za-z0-9-._~,]`.
pub fn enc(s: &str) -> String {
    let mut o = String::with_capacity(s.len());
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'.' | b'_' | b'~' | b',') {
            o.push(b as char);
        } else {
            o.push_str(&format!("%{b:02X}"));
        }
    }
    o
}

pub fn pct_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let hex = |c: u8| (c as char).to_digit(16).map(|d| d as u8);
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'+' => out.push(b' '),
            b'%' if i + 2 < b.len() => match (hex(b[i + 1]), hex(b[i + 2])) {
                (Some(h), Some(l)) => {
                    out.push(h * 16 + l);
                    i += 2;
                }
                _ => out.push(b'%'),
            },
            c => out.push(c),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

pub fn query_pairs(query: &str) -> Vec<(String, String)> {
    query
        .split('&')
        .filter(|p| !p.is_empty())
        .map(|p| match p.split_once('=') {
            Some((k, v)) => (pct_decode(k), pct_decode(v)),
            None => (pct_decode(p), String::new()),
        })
        .collect()
}

fn valid_date(s: &str) -> bool {
    let b = s.as_bytes();
    if b.len() != 10 || b[4] != b'-' || b[7] != b'-' {
        return false;
    }
    let (y, m, d) = (
        s[..4].parse::<u32>(),
        s[5..7].parse::<u32>(),
        s[8..].parse::<u32>(),
    );
    let (Ok(y), Ok(m), Ok(d)) = (y, m, d) else {
        return false;
    };
    let leap = y % 4 == 0 && (y % 100 != 0 || y % 400 == 0);
    let dim = match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => return false,
    };
    (1900..=2200).contains(&y) && (1..=dim).contains(&d)
}

/// Validates one value; `Ok(None)` = empty (treated as absent).
fn check(p: &Param, raw: &str) -> Result<Option<String>, ApiError> {
    let v: String = raw.split_whitespace().collect::<Vec<_>>().join(" ");
    if v.is_empty() {
        return Ok(None);
    }
    let n = p.name;
    let bad = |m: String| Err(ApiError::BadRequest(m));
    match p.ty {
        Ty::Int { min, max } => match v.parse::<i64>() {
            Ok(x) if (min..=max).contains(&x) && v.bytes().all(|b| b.is_ascii_digit()) => {
                Ok(Some(x.to_string()))
            }
            _ => bad(format!("{n}: inteiro entre {min} e {max}")),
        },
        Ty::Enum(vals) => {
            let l = v.to_lowercase();
            if vals.contains(&l.as_str()) {
                Ok(Some(l))
            } else {
                bad(format!("{n}: use um de {}", vals.join(", ")))
            }
        }
        Ty::Date if valid_date(&v) => Ok(Some(v)),
        Ty::Date => bad(format!("{n}: data AAAA-MM-DD")),
        Ty::Bool => match v.to_lowercase().as_str() {
            "true" | "1" | "sim" => Ok(Some("true".into())),
            "false" | "0" | "nao" | "não" => Ok(Some("false".into())),
            _ => bad(format!("{n}: true ou false")),
        },
        Ty::Codes { max } => {
            let items: Vec<String> = v
                .split(',')
                .map(|s| s.trim().to_ascii_uppercase())
                .filter(|s| !s.is_empty())
                .collect();
            if items.len() > max
                || items
                    .iter()
                    .any(|s| s.len() > 12 || !s.bytes().all(|b| b.is_ascii_alphanumeric()))
            {
                return bad(format!("{n}: até {max} siglas separadas por vírgula"));
            }
            Ok((!items.is_empty()).then(|| items.join(",")))
        }
        Ty::Str { min, max, chars } => {
            let len = v.chars().count();
            let ok_chars = match chars {
                Chars::Digits => v.bytes().all(|b| b.is_ascii_digit()),
                Chars::Uf => len == 2 && v.bytes().all(|b| b.is_ascii_alphabetic()),
                Chars::Code => v.bytes().all(|b| b.is_ascii_alphanumeric()),
                Chars::VotId => {
                    let parts: Vec<&str> = v.split('-').collect();
                    parts.len() == 2
                        && parts
                            .iter()
                            .all(|x| !x.is_empty() && x.bytes().all(|b| b.is_ascii_digit()))
                }
                Chars::Month => {
                    v.len() == 6
                        && v.bytes().all(|b| b.is_ascii_digit())
                        && matches!(v[4..].parse::<u8>(), Ok(1..=12))
                }
                Chars::Text => !v.chars().any(char::is_control),
            };
            if chars == Chars::Uf && !ok_chars {
                return bad(format!("{n}: sigla de UF"));
            }
            if len > max {
                return bad(format!("{n}: máximo {max} caracteres"));
            }
            if len < min {
                return bad(format!("{n}: mínimo {min} caracteres"));
            }
            if !ok_chars {
                return bad(format!("{n}: valor inválido"));
            }
            Ok(Some(if chars == Chars::Uf {
                v.to_ascii_uppercase()
            } else {
                v
            }))
        }
    }
}

fn match_path(op: &'static Op, segs: &[&str]) -> Option<BTreeMap<&'static str, String>> {
    let tpl: Vec<&'static str> = op.path.split('/').filter(|s| !s.is_empty()).collect();
    if tpl.len() != segs.len() {
        return None;
    }
    let mut args = BTreeMap::new();
    for (t, s) in tpl.iter().zip(segs) {
        match t.strip_prefix('{').and_then(|x| x.strip_suffix('}')) {
            Some(n) => {
                let p = op.params.iter().find(|p| p.path && p.name == n)?;
                if s.is_empty() || s.contains("..") {
                    return None;
                }
                let v = check(p, s).ok()??;
                args.insert(p.name, v);
            }
            None if t == s => {}
            None => return None,
        }
    }
    Some(args)
}

fn bad(m: impl Into<String>) -> ApiError {
    ApiError::BadRequest(m.into())
}

/// `rest`: path after `/v1`. Unknown query params are ignored.
pub fn resolve(rest: &str, query: Option<&str>) -> Result<Req, ApiError> {
    let query = query.unwrap_or("");
    if query.len() > MAX_QUERY {
        return Err(bad("query muito longa"));
    }
    if !(rest.is_empty() || rest.starts_with('/')) {
        return Err(ApiError::NotFound);
    }
    let full = format!("/v1{rest}");
    let full = full.strip_suffix('/').unwrap_or(&full);
    let segs: Vec<&str> = full.split('/').skip(1).collect();
    let (op, mut args) = OPS
        .iter()
        .find_map(|op| match_path(op, &segs).map(|a| (op, a)))
        .ok_or(ApiError::NotFound)?;
    let pairs = query_pairs(query);
    let get = |k: &str| {
        pairs
            .iter()
            .rev()
            .find(|(n, _)| n == k)
            .map(|(_, v)| v.as_str())
    };
    for p in op.params.iter().filter(|p| !p.path) {
        match get(p.name).map(|v| check(p, v)).transpose()?.flatten() {
            Some(v) => {
                args.insert(p.name, v);
            }
            None if p.required => return Err(bad(format!("{}: obrigatório", p.name))),
            None => {}
        }
    }
    let mut r = Req {
        op,
        args,
        limit: 0,
        offset: 0,
        ordem: None,
        campos: None,
        csv: false,
    };
    if let Some(l) = op.list {
        r.limit = match get("limit").filter(|v| !v.is_empty()) {
            None => l.default,
            Some(v) => v
                .parse()
                .ok()
                .filter(|x| (1..=l.max).contains(x))
                .ok_or_else(|| bad(format!("limit: 1..={}", l.max)))?,
        };
        r.offset = match get("offset").filter(|v| !v.is_empty()) {
            None => 0,
            Some(v) => v
                .parse()
                .ok()
                .filter(|x| *x <= MAX_OFFSET)
                .ok_or_else(|| bad(format!("offset: 0..={MAX_OFFSET}")))?,
        };
        if l.upstream && !r.offset.is_multiple_of(r.limit) {
            return Err(bad("offset: múltiplo de limit"));
        }
        if let Some(o) = get("ordem").filter(|v| !v.trim().is_empty()) {
            let o = o.trim();
            let (f, desc) = o.strip_prefix('-').map_or((o, false), |f| (f, true));
            if l.sort.is_empty() {
                return Err(bad("ordem: não disponível neste endpoint"));
            }
            if !l.sort.contains(&f) {
                return Err(bad(format!(
                    "ordem: use um de {} (prefixo - para decrescente)",
                    l.sort.join(", ")
                )));
            }
            r.ordem = Some((f.to_string(), desc));
        }
    }
    if !op.bare {
        if let Some(c) = get("campos").filter(|v| !v.trim().is_empty()) {
            let fs: Vec<String> = c.split(',').map(|s| s.trim().to_string()).collect();
            let okf = |f: &String| {
                !f.is_empty()
                    && f.len() <= 40
                    && f.bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'.')
            };
            if fs.len() > 30 || !fs.iter().all(okf) {
                return Err(bad("campos: nomes separados por vírgula"));
            }
            r.campos = Some(fs);
        }
        match get("formato").map(|v| v.trim().to_lowercase()).as_deref() {
            None | Some("") | Some("json") => {}
            Some("csv") if op.csv() => r.csv = true,
            Some("csv") => return Err(bad("formato=csv: só em listas")),
            Some(_) => return Err(bad("formato: use um de json, csv")),
        }
    }
    Ok(r)
}

// ---------------------------------------------------------------------------
// Registry

const fn qp(name: &'static str, ty: Ty, desc: &'static str, example: &'static str) -> Param {
    Param {
        name,
        path: false,
        ty,
        required: false,
        desc,
        example,
    }
}
const fn rq(name: &'static str, ty: Ty, desc: &'static str, example: &'static str) -> Param {
    Param {
        name,
        path: false,
        ty,
        required: true,
        desc,
        example,
    }
}
const fn pp(name: &'static str, ty: Ty, desc: &'static str, example: &'static str) -> Param {
    Param {
        name,
        path: true,
        ty,
        required: true,
        desc,
        example,
    }
}
const fn list(default: usize, max: usize, sort: &'static [&'static str]) -> Option<List> {
    Some(List {
        default,
        max,
        sort,
        upstream: false,
    })
}
const fn paged(default: usize, max: usize, sort: &'static [&'static str]) -> Option<List> {
    Some(List {
        default,
        max,
        sort,
        upstream: true,
    })
}
const fn text(min: usize, max: usize) -> Ty {
    Ty::Str {
        min,
        max,
        chars: Chars::Text,
    }
}

const H: u32 = 3600;
pub const TIPOS: &[&str] = &[
    "individual",
    "bancada",
    "comissao",
    "relator",
    "pix",
    "outra",
];
const UF: Ty = Ty::Str {
    min: 2,
    max: 2,
    chars: Chars::Uf,
};
const IBGE: Ty = Ty::Str {
    min: 7,
    max: 7,
    chars: Chars::Digits,
};
const CODIGO: Ty = Ty::Str {
    min: 1,
    max: 20,
    chars: Chars::Code,
};
const SIGLA: Ty = Ty::Str {
    min: 1,
    max: 20,
    chars: Chars::Code,
};
const ID: Ty = Ty::Int {
    min: 1,
    max: 999_999_999_999,
};
const ANO: Ty = Ty::Int {
    min: 2000,
    max: 2100,
};
const SEN: Ty = Ty::Str {
    min: 1,
    max: 8,
    chars: Chars::Digits,
};
const LEG: Ty = Ty::Int { min: 1, max: 60 };
const CASA: Ty = Ty::Enum(&["camara", "senado"]);
const Q: Ty = text(1, MAX_Q);

const P_UF: Param = qp("uf", UF, "Sigla da UF", "SP");
const P_ANO: Param = qp("ano", ANO, "Ano", "2024");
const P_TIPO: Param = qp("tipo", Ty::Enum(TIPOS), "Tipo de emenda", "individual");
const P_PARTIDO: Param = qp(
    "partido",
    SIGLA,
    "Sigla do partido (sem distinção de caixa)",
    "PT",
);
const P_Q: Param = qp("q", Q, "Texto (sem distinção de acento/caixa)", "silva");
const P_DE: Param = qp("de", Ty::Date, "Data inicial (AAAA-MM-DD)", "2026-10-01");
const P_ATE: Param = qp("ate", Ty::Date, "Data final (AAAA-MM-DD)", "2026-10-28");
const P_IBGE: Param = pp(
    "ibge",
    IBGE,
    "Código IBGE do município (7 dígitos)",
    "3550308",
);
const P_COD: Param = pp(
    "codigo",
    CODIGO,
    "Código do autor no Portal da Transparência",
    "8100",
);
const P_DEP: Param = pp("id", ID, "Id do deputado na Câmara", "204379");
const P_SEN: Param = pp("codigo", SEN, "Código do senador no Senado", "5012");
const P_PROP: Param = pp("id", ID, "Id da proposição na Câmara", "2270800");
const P_LEG: Param = qp(
    "legislatura",
    LEG,
    "Número da legislatura (57 = 2023-2027)",
    "57",
);

const EMENDA_SORT: &[&str] = &["ano", "empenhado", "liquidado", "pago", "rapPago"];
const PORTAL: &[&str] =
    &["https://portaldatransparencia.gov.br/download-de-dados/emendas-parlamentares"];
const CAMARA: &[&str] = &["https://dadosabertos.camara.leg.br/api/v2/"];
const SENADO: &[&str] = &["https://legis.senado.leg.br/dadosabertos/"];
const CONGRESSO: &[&str] = &[
    "https://dadosabertos.camara.leg.br/api/v2/",
    "https://legis.senado.leg.br/dadosabertos/",
];
const GASTOS: &[&str] = &[
    "https://dadosabertos.camara.leg.br/swagger/api.html#staticfile",
    "https://www12.senado.leg.br/transparencia/dados-abertos-transparencia",
];

macro_rules! op {
    ($id:literal, $path:literal, $tag:literal, $sum:literal, $desc:literal, [$($p:expr),* $(,)?], $list:expr, $rows:expr, $ttl:expr, $fonte:expr, $ex:literal) => {
        Op { id: $id, path: $path, tag: $tag, summary: $sum, desc: $desc, params: &[$($p),*], list: $list,
             rows: $rows, ttl: $ttl, fonte: $fonte, example: $ex, bare: false }
    };
}

pub const TAGS: &[(&str, &str)] = &[
    ("Sobre", "Índice, especificação OpenAPI e metadados."),
    (
        "Emendas",
        "Emendas parlamentares (Portal da Transparência), consolidadas pelo ETL do emenda.online.",
    ),
    (
        "Municípios e UFs",
        "Para onde vai o dinheiro: UFs e municípios (código IBGE).",
    ),
    (
        "Autores",
        "Quem indicou: parlamentares, bancadas, comissões e relator.",
    ),
    (
        "Pix e pagamentos",
        "Emendas Pix, últimos pagamentos, saldos em aberto e rankings.",
    ),
    (
        "Gastos",
        "Cota parlamentar (CEAP) e gastos de gabinete de deputados e senadores.",
    ),
    (
        "Deputados",
        "Câmara dos Deputados (ao vivo) cruzada com emendas e gastos.",
    ),
    (
        "Senadores",
        "Senado Federal (ao vivo) cruzado com emendas e gastos.",
    ),
    (
        "Partidos e federações",
        "Partidos na Câmara e federações partidárias.",
    ),
    (
        "Frentes e comissões",
        "Frentes parlamentares (Câmara) e comissões (Câmara e Senado).",
    ),
    (
        "Proposições",
        "Projetos e propostas na Câmara: busca, tramitação, autores, votações e desfecho.",
    ),
    (
        "Votações",
        "Votações nominais do plenário da Câmara: placar, partidos, UFs e orientações.",
    ),
    ("Agenda", "Sessões e reuniões da Câmara e do Senado."),
    ("Busca", "Busca unificada."),
];

pub static OPS: &[Op] = &[
    op!("index", "/v1", "Sobre", "Índice da API", "Lista de endpoints, limites e links.", [], None, None, 24 * H, CONGRESSO, "/v1"),
    Op { id: "openapi", path: "/v1/openapi.json", tag: "Sobre", summary: "Especificação OpenAPI 3.1",
         desc: "Documento OpenAPI 3.1 gerado do mesmo registro que roteia a API (sem envelope).",
         params: &[], list: None, rows: None, ttl: H, fonte: &[], example: "/v1/openapi.json", bare: true },
    op!("meta", "/v1/meta", "Sobre", "Metadados do conjunto de dados", "Anos cobertos, totais e data de geração.", [], None, None, 6 * H, PORTAL, "/v1/meta"),
    // ---- Emendas
    op!("emendas", "/v1/emendas", "Emendas", "Buscar emendas",
        "Busca nos índices estáticos por autor e/ou município, ou Pix por ano. Exige `autor`, `municipio` ou `tipo=pix&ano=`: não há índice nacional linha a linha (use /v1/brasil e /v1/ufs/{UF} para agregados).",
        [qp("autor", CODIGO, "Código do autor", "8100"), qp("municipio", IBGE, "Código IBGE do município", "3550308"),
         P_UF, P_TIPO, P_ANO, P_Q], list(100, 1000, EMENDA_SORT), None, 12 * H, PORTAL, "/v1/emendas?autor=8100&ano=2024&limit=5"),
    op!("brasil", "/v1/brasil", "Emendas", "Totais nacionais", "Totais por ano, tipo, função e UF, e fluxo tipo → função.", [], None, None, 12 * H, PORTAL, "/v1/brasil"),
    // ---- Municípios e UFs
    op!("ufs", "/v1/ufs", "Municípios e UFs", "UFs com totais", "Totais de emendas por UF.", [], list(50, 50, &["uf", "n", "empenhado", "pago"]), None, 12 * H, PORTAL, "/v1/ufs?ordem=-pago"),
    op!("uf", "/v1/ufs/{uf}", "Municípios e UFs", "Emendas de uma UF", "Totais, por tipo e ano, municípios e autores.", [pp("uf", UF, "Sigla da UF", "SP")], None, None, 12 * H, PORTAL, "/v1/ufs/SP"),
    op!("municipios", "/v1/municipios", "Municípios e UFs", "Lista de municípios", "Os 5.571 municípios (IBGE), com filtro por UF e nome.",
        [P_UF, P_Q], list(100, 1000, &["nome", "ibge", "uf"]), None, 7 * 24 * H, &["https://servicodados.ibge.gov.br/api/v1/localidades/municipios"], "/v1/municipios?uf=AC"),
    op!("municipio", "/v1/municipios/{ibge}", "Municípios e UFs", "Emendas de um município", "Prefeito, totais, autores, emendas, favorecidos e convênios.", [P_IBGE], None, None, 12 * H, PORTAL, "/v1/municipios/3550308"),
    op!("municipio_emendas", "/v1/municipios/{ibge}/emendas", "Municípios e UFs", "Emendas destinadas a um município", "Lista filtrável de emendas.",
        [P_IBGE, P_ANO, P_TIPO, qp("autor", CODIGO, "Código do autor", "1568")], list(100, 1000, EMENDA_SORT), None, 12 * H, PORTAL, "/v1/municipios/3550308/emendas?ano=2024&limit=5"),
    op!("municipio_favorecidos", "/v1/municipios/{ibge}/favorecidos", "Municípios e UFs", "Favorecidos no município", "Quem recebeu (CNPJ/CPF mascarado na origem).",
        [P_IBGE], list(100, 1000, &["valor", "nome"]), None, 12 * H, PORTAL, "/v1/municipios/3550308/favorecidos?limit=5"),
    op!("municipio_convenios", "/v1/municipios/{ibge}/convenios", "Municípios e UFs", "Convênios do município", "Convênios ligados a emendas.",
        [P_IBGE], list(100, 1000, &["valor", "data"]), None, 12 * H, PORTAL, "/v1/municipios/3550308/convenios?limit=5"),
    op!("municipio_prefeito", "/v1/municipios/{ibge}/prefeito", "Municípios e UFs", "Prefeito eleito", "Prefeito e vice da última eleição (TSE).", [P_IBGE], None, None, 12 * H, &["https://dadosabertos.tse.jus.br/"], "/v1/municipios/3550308/prefeito"),
    // ---- Autores
    op!("autores", "/v1/autores", "Autores", "Autores de emendas", "Filtro `q` (nome sem acento/caixa, ou código exato). `data` = {total, limit, offset, itens}.",
        [P_Q], list(50, 500, &["n", "pago", "empenhado", "nome"]), Some("/itens"), 12 * H, PORTAL, "/v1/autores?q=silva&limit=10"),
    op!("autor", "/v1/autores/{codigo}", "Autores", "Emendas de um autor", "Totais, por ano/UF/tipo, emendas e favorecidos.", [P_COD], None, None, 12 * H, PORTAL, "/v1/autores/8100"),
    op!("autor_emendas", "/v1/autores/{codigo}/emendas", "Autores", "Lista de emendas de um autor", "Filtrável por ano, tipo, UF e município.",
        [P_COD, P_ANO, P_TIPO, P_UF, qp("municipio", IBGE, "Código IBGE", "3550308")], list(100, 1000, EMENDA_SORT), None, 12 * H, PORTAL, "/v1/autores/8100/emendas?ano=2024&limit=5"),
    op!("autor_favorecidos", "/v1/autores/{codigo}/favorecidos", "Autores", "Favorecidos de um autor", "Quem recebeu as emendas do autor.",
        [P_COD], list(100, 1000, &["valor", "nome"]), None, 12 * H, PORTAL, "/v1/autores/8100/favorecidos?limit=5"),
    // ---- Pix e pagamentos
    op!("pix", "/v1/pix", "Pix e pagamentos", "Emendas Pix", "Transferências especiais: totais, por ano/UF, municípios e autores.", [], None, None, 6 * H, PORTAL, "/v1/pix"),
    op!("pix_ano", "/v1/pix/{ano}", "Pix e pagamentos", "Emendas Pix de um ano", "Todas as emendas Pix do ano (`formato=csv` exporta `itens`).",
        [pp("ano", ANO, "Ano", "2024")], None, Some("/itens"), 6 * H, PORTAL, "/v1/pix/2024"),
    op!("feed", "/v1/feed", "Pix e pagamentos", "Últimos pagamentos", "Pagamentos mais recentes e resumo por mês (`formato=csv` exporta `itens`).", [], None, Some("/itens"), 6 * H, PORTAL, "/v1/feed"),
    op!("feed_mes", "/v1/feed/{mes}", "Pix e pagamentos", "Pagamentos de um mês", "Pagamentos do mês AAAAMM.",
        [pp("mes", Ty::Str { min: 6, max: 6, chars: Chars::Month }, "Mês AAAAMM", "202410")], None, Some("/itens"), 6 * H, PORTAL, "/v1/feed/202410"),
    op!("novidades", "/v1/novidades", "Pix e pagamentos", "Novidades", "O que mudou nos dados oficiais (pagamentos, votações, leis), em ordem cronológica.", [], None, Some("/itens"), 6 * H, PORTAL, "/v1/novidades"),
    op!("abertas", "/v1/abertas", "Pix e pagamentos", "Saldos em aberto", "Empenhado e ainda não pago: totais e os 300 maiores saldos (`top`).", [], None, Some("/top"), 6 * H, PORTAL, "/v1/abertas"),
    op!("rankings", "/v1/rankings", "Pix e pagamentos", "Rankings recentes", "Quem mais pagou/recebeu em 1, 3, 6 e 12 meses.",
        [qp("janela", Ty::Enum(&["1m", "3m", "6m", "12m"]), "Só esta janela", "3m")], None, None, 6 * H, PORTAL, "/v1/rankings?janela=3m"),
    // ---- Gastos
    op!("gastos_ranking", "/v1/gastos/ranking", "Gastos", "Ranking de gastos", "Gastos de cota parlamentar por parlamentar. `ano` adiciona `valorAno`.",
        [qp("casa", CASA, "camara ou senado", "camara"), P_UF, P_PARTIDO, P_ANO, qp("exercicio", Ty::Bool, "Só em exercício", "true")],
        list(100, 1000, &["mandato", "valorAno", "nome", "uf", "partido"]), None, 12 * H, GASTOS, "/v1/gastos/ranking?casa=camara&ordem=-mandato&limit=10"),
    op!("gastos_deputado", "/v1/gastos/deputados/{id}", "Gastos", "Gastos de um deputado", "CEAP por ano e categoria.", [P_DEP], None, None, 12 * H, GASTOS, "/v1/gastos/deputados/204379"),
    op!("gastos_senador", "/v1/gastos/senadores/{codigo}", "Gastos", "Gastos de um senador", "Cota (CEAPS) por ano e categoria.", [P_SEN], None, None, 12 * H, GASTOS, "/v1/gastos/senadores/5012"),
    // ---- Deputados
    op!("deputados", "/v1/deputados", "Deputados", "Deputados", "Deputados (em exercício ou de uma legislatura) com resumo de emendas.",
        [P_UF, P_PARTIDO, P_LEG, qp("q", Q, "Nome", "silva")], list(1000, 1000, &["nome", "uf", "partido"]), None, 12 * H, CAMARA, "/v1/deputados?uf=AP"),
    op!("deputado", "/v1/deputados/{id}", "Deputados", "Deputado", "Cadastro, gabinete, nascimento, redes, emendas e links.", [P_DEP], None, None, 12 * H, CAMARA, "/v1/deputados/204379"),
    op!("deputado_mandatos", "/v1/deputados/{id}/mandatos", "Deputados", "Histórico de mandato", "Mudanças de partido, situação e legislatura.", [P_DEP], list(200, 500, &["data"]), None, 12 * H, CAMARA, "/v1/deputados/204379/mandatos"),
    op!("deputado_proposicoes", "/v1/deputados/{id}/proposicoes", "Deputados", "Proposições do deputado", "Proposições de autoria. Sem `ano`: ano corrente e anterior.",
        [P_DEP, P_ANO, qp("tipo", Ty::Codes { max: 5 }, "Siglas de tipo (PL,PEC…)", "PL")], paged(50, 100, &[]), None, H, CAMARA, "/v1/deputados/204379/proposicoes?limit=10"),
    op!("deputado_votos", "/v1/deputados/{id}/votos", "Deputados", "Votos no plenário", "Votações nominais do plenário no período (máx. 92 dias; padrão: últimos 60) e o voto do deputado. `limit` = votações consultadas.",
        [P_DEP, P_DE, P_ATE], list(20, 30, &[]), None, H, CAMARA, "/v1/deputados/204379/votos?limit=5"),
    op!("deputado_despesas", "/v1/deputados/{id}/despesas", "Deputados", "Despesas (CEAP) detalhadas", "Notas da cota parlamentar. Sem `ano`: ano corrente.",
        [P_DEP, P_ANO, qp("mes", Ty::Int { min: 1, max: 12 }, "Mês", "3")], paged(100, 100, &[]), None, 6 * H, CAMARA, "/v1/deputados/204379/despesas?ano=2025&limit=10"),
    op!("deputado_frentes", "/v1/deputados/{id}/frentes", "Deputados", "Frentes do deputado", "Frentes parlamentares de que participa.", [P_DEP], list(500, 1000, &["titulo", "id"]), None, 12 * H, CAMARA, "/v1/deputados/204379/frentes"),
    op!("deputado_orgaos", "/v1/deputados/{id}/orgaos", "Deputados", "Comissões e órgãos", "Cargos em comissões e órgãos da Câmara.", [P_DEP], list(200, 500, &["inicio", "sigla"]), None, 12 * H, CAMARA, "/v1/deputados/204379/orgaos"),
    op!("deputado_emendas", "/v1/deputados/{id}/emendas", "Deputados", "Emendas do deputado", "Emendas do autor correspondente (cruzado pelo nome).",
        [P_DEP, P_ANO, P_TIPO, P_UF], list(100, 1000, EMENDA_SORT), None, 12 * H, PORTAL, "/v1/deputados/204379/emendas?limit=5"),
    op!("deputado_gastos", "/v1/deputados/{id}/gastos", "Deputados", "Gastos do deputado", "Mesmo que /v1/gastos/deputados/{id}.", [P_DEP], None, None, 12 * H, GASTOS, "/v1/deputados/204379/gastos"),
    // ---- Senadores
    op!("senadores", "/v1/senadores", "Senadores", "Senadores em exercício", "Com resumo de emendas.", [P_UF, P_PARTIDO, qp("q", Q, "Nome", "silva")], list(100, 100, &["nome", "uf", "partido"]), None, 12 * H, SENADO, "/v1/senadores?uf=AP"),
    op!("senador", "/v1/senadores/{codigo}", "Senadores", "Senador", "Dados, nascimento, emendas e links.", [P_SEN], None, None, 12 * H, SENADO, "/v1/senadores/5012"),
    op!("senador_mandatos", "/v1/senadores/{codigo}/mandatos", "Senadores", "Mandatos", "Mandatos, legislaturas e suplentes.", [P_SEN], list(50, 100, &["inicio"]), None, 12 * H, SENADO, "/v1/senadores/5012/mandatos"),
    op!("senador_comissoes", "/v1/senadores/{codigo}/comissoes", "Senadores", "Comissões", "Participação em comissões.",
        [P_SEN, qp("ativas", Ty::Bool, "Só as atuais", "true")], list(200, 1000, &["inicio", "sigla"]), None, 12 * H, SENADO, "/v1/senadores/5012/comissoes?ativas=true"),
    op!("senador_proposicoes", "/v1/senadores/{codigo}/proposicoes", "Senadores", "Proposições de autoria", "Processos de autoria do senador.",
        [P_SEN, P_ANO, qp("tipo", Ty::Codes { max: 5 }, "Siglas (PL,PEC…)", "PL")], list(100, 500, &["data"]), None, 6 * H, SENADO, "/v1/senadores/5012/proposicoes?tipo=PL&limit=10"),
    op!("senador_votos", "/v1/senadores/{codigo}/votos", "Senadores", "Votos", "Votações do período (máx. 366 dias; padrão: últimos 90).",
        [P_SEN, P_DE, P_ATE], list(100, 500, &["data"]), None, H, SENADO, "/v1/senadores/5012/votos?limit=10"),
    op!("senador_emendas", "/v1/senadores/{codigo}/emendas", "Senadores", "Emendas do senador", "Emendas do autor correspondente (cruzado pelo nome).",
        [P_SEN, P_ANO, P_TIPO, P_UF], list(100, 1000, EMENDA_SORT), None, 12 * H, PORTAL, "/v1/senadores/5012/emendas?limit=5"),
    op!("senador_gastos", "/v1/senadores/{codigo}/gastos", "Senadores", "Gastos do senador", "Mesmo que /v1/gastos/senadores/{codigo}.", [P_SEN], None, None, 12 * H, GASTOS, "/v1/senadores/5012/gastos"),
    // ---- Partidos e federações
    op!("partidos", "/v1/partidos", "Partidos e federações", "Partidos", "Partidos com deputados na legislatura (padrão: atual) e federação.",
        [P_LEG], list(100, 100, &["sigla", "nome"]), None, 24 * H, CAMARA, "/v1/partidos"),
    op!("partido", "/v1/partidos/{sigla}", "Partidos e federações", "Partido", "Status, líder, deputados, senadores e federação.",
        [pp("sigla", SIGLA, "Sigla", "PT")], None, None, 12 * H, CONGRESSO, "/v1/partidos/PT"),
    op!("federacoes", "/v1/federacoes", "Partidos e federações", "Federações partidárias", "Federações registradas no TSE (lista curada).", [], list(50, 50, &["nome"]), None, 7 * 24 * H, &["https://www.tse.jus.br/partidos/federacoes-partidarias"], "/v1/federacoes"),
    // ---- Frentes e comissões
    op!("frentes", "/v1/frentes", "Frentes e comissões", "Frentes parlamentares", "Frentes da legislatura (padrão: atual).",
        [P_LEG, qp("q", Q, "Título", "saúde")], list(100, 1000, &["titulo", "id"]), None, 24 * H, CAMARA, "/v1/frentes?q=saude"),
    op!("frente", "/v1/frentes/{id}", "Frentes e comissões", "Frente", "Coordenador, contato e situação.", [pp("id", ID, "Id da frente", "55703")], None, None, 24 * H, CAMARA, "/v1/frentes/55703"),
    op!("frente_membros", "/v1/frentes/{id}/membros", "Frentes e comissões", "Membros da frente", "Deputados signatários.",
        [pp("id", ID, "Id da frente", "55703"), P_UF, P_PARTIDO], list(1000, 1000, &["nome", "uf", "partido"]), None, 12 * H, CAMARA, "/v1/frentes/55703/membros?uf=SP"),
    op!("comissoes", "/v1/comissoes", "Frentes e comissões", "Comissões", "Comissões permanentes da Câmara ou colegiados do Senado/Congresso.",
        [qp("casa", CASA, "camara (padrão) ou senado", "senado"), qp("q", Q, "Nome ou sigla", "saude")], list(500, 1000, &["sigla", "nome"]), None, 24 * H, CONGRESSO, "/v1/comissoes?casa=senado"),
    op!("comissao_membros", "/v1/comissoes/{id}/membros", "Frentes e comissões", "Membros da comissão", "Composição atual. `casa` define a origem do id.",
        [pp("id", ID, "Id (Câmara) ou código (Senado)", "2003"), qp("casa", CASA, "camara (padrão) ou senado", "camara")], list(200, 500, &["nome", "partido", "uf"]), None, 12 * H, CONGRESSO, "/v1/comissoes/2003/membros"),
    // ---- Proposições
    op!("proposicoes", "/v1/proposicoes", "Proposições", "Buscar proposições",
        "Câmara. Sem `ano` e sem `numero`: ano corrente e anterior. `ordem` aceita id, ano, numero.",
        [qp("tipo", Ty::Codes { max: 5 }, "Siglas (PL,PEC,MPV…)", "PL"), qp("numero", Ty::Int { min: 1, max: 99999 }, "Número", "2630"), P_ANO,
         qp("autor", text(2, 64), "Nome do autor", "Tabata"), qp("tema", Ty::Int { min: 1, max: 999 }, "Código de tema da Câmara", "46"),
         qp("q", Q, "Palavras-chave", "saúde")], paged(20, 100, &["id", "ano", "numero"]), None, 1800, CAMARA, "/v1/proposicoes?tipo=PL&numero=2630&ano=2020"),
    op!("proposicao", "/v1/proposicoes/{id}", "Proposições", "Proposição", "Sigla, ementa, situação, palavras-chave e autores.", [P_PROP], None, None, H, CAMARA, "/v1/proposicoes/2270800"),
    op!("proposicao_tramitacoes", "/v1/proposicoes/{id}/tramitacoes", "Proposições", "Tramitação", "Histórico de tramitação.", [P_PROP], list(500, 1000, &["data", "sequencia"]), None, H, CAMARA, "/v1/proposicoes/2270800/tramitacoes?ordem=-data&limit=10"),
    op!("proposicao_autores", "/v1/proposicoes/{id}/autores", "Proposições", "Autores", "Autores e coautores.", [P_PROP], list(500, 1000, &["nome", "ordem"]), None, H, CAMARA, "/v1/proposicoes/2270800/autores"),
    op!("proposicao_votacoes", "/v1/proposicoes/{id}/votacoes", "Proposições", "Votações da proposição", "Votações em plenário e comissões.", [P_PROP], list(200, 500, &["data"]), None, H, CAMARA, "/v1/proposicoes/2270800/votacoes"),
    op!("proposicao_resultado", "/v1/proposicoes/{id}/resultado", "Proposições", "Desfecho", "Virou lei? Norma gerada, veto, presidente que sancionou e links (LexML, Planalto).", [P_PROP], None, None, H, CAMARA, "/v1/proposicoes/2270800/resultado"),
    // ---- Votações
    op!("votacoes", "/v1/votacoes", "Votações", "Votações do plenário", "Votações do plenário da Câmara no período (máx. 92 dias; padrão: últimos 30).",
        [P_DE, P_ATE, qp("nominais", Ty::Bool, "Só nominais (com placar)", "true")], list(50, 200, &["data"]), None, 900, CAMARA, "/v1/votacoes?nominais=true&limit=5"),
    op!("votacao", "/v1/votacoes/{id}", "Votações", "Votação", "Placar, por partido, por UF, orientações e votos (partido na data da votação).",
        [pp("id", Ty::Str { min: 3, max: 24, chars: Chars::VotId }, "Id da votação", "2236186-60")], None, None, H, CAMARA, "/v1/votacoes/2236186-60"),
    // ---- Agenda
    op!("agenda", "/v1/agenda", "Agenda", "Agenda do Congresso", "Sessões e reuniões (máx. 31 dias; padrão: hoje + 6 dias, horário de Brasília).",
        [P_DE, P_ATE, qp("casa", CASA, "Só uma Casa", "camara")], list(500, 1000, &["inicio"]), None, 900, CONGRESSO, "/v1/agenda?casa=camara"),
    // ---- Busca
    op!("busca", "/v1/busca", "Busca", "Busca unificada", "Autores, deputados, senadores, municípios, UFs, partidos e proposições (\"PL 2630/2020\").",
        [rq("q", text(2, MAX_Q), "Texto", "recife"), qp("limit", Ty::Int { min: 1, max: 50 }, "Máximo por grupo (padrão 10)", "5")], None, None, H, CONGRESSO, "/v1/busca?q=recife"),
];

pub fn by_id(id: &str) -> Option<&'static Op> {
    OPS.iter().find(|o| o.id == id)
}
