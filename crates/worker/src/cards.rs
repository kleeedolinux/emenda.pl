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
    /// "Como votou": id `votacaoId/depId`.
    Voto,
    /// Pauta do dia: id `YYYY-MM-DD` or `hoje`.
    Agenda,
}

const SLUGS: [(Kind, &str); 10] = [
    (Kind::Deputado, "deputado"),
    (Kind::Senador, "senador"),
    (Kind::Municipio, "municipio"),
    (Kind::Uf, "uf"),
    (Kind::Autor, "autor"),
    (Kind::Proposicao, "proposicao"),
    (Kind::Votacao, "votacao"),
    (Kind::Partido, "partido"),
    (Kind::Voto, "voto"),
    (Kind::Agenda, "agenda"),
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

// ---------- share: voto / agenda ----------

/// Valid ISO calendar date (`YYYY-MM-DD`).
pub fn valid_day(d: &str) -> bool {
    d.len() == 10
        && d.bytes().enumerate().all(|(i, b)| {
            if i == 4 || i == 7 {
                b == b'-'
            } else {
                b.is_ascii_digit()
            }
        })
        && crate::analytics::parse_day(d)
            .map(crate::analytics::fmt_day)
            .as_deref()
            == Some(d)
}

/// Civil date in Brasília (UTC-3, no DST since 2019) for a JS timestamp in ms.
pub fn dia_brasilia(now_ms: f64) -> String {
    crate::analytics::day_string(now_ms - 3.0 * 3_600_000.0)
}

const SEMANA: [&str; 7] = [
    "quinta-feira",
    "sexta-feira",
    "sábado",
    "domingo",
    "segunda-feira",
    "terça-feira",
    "quarta-feira",
];
const MESES: [&str; 12] = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
];

/// "quarta-feira, 28 de outubro" (dia 1 -> "1º").
pub fn dia_extenso(d: &str) -> Option<String> {
    if !valid_day(d) {
        return None;
    }
    let days = crate::analytics::parse_day(d)?;
    let wd = SEMANA[days.rem_euclid(7) as usize]; // 1970-01-01 was a Thursday
    let m: usize = d[5..7].parse().ok()?;
    let dd: u32 = d[8..10].parse().ok()?;
    let dia = if dd == 1 {
        "1º".to_string()
    } else {
        dd.to_string()
    };
    Some(format!("{wd}, {dia} de {}", MESES[m - 1]))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VotoSpec {
    pub deputado: String,
    pub partido_uf: String,
    pub voto: String,
    pub titulo: String,
    pub data: String,
    /// (sim, não, outros)
    pub placar: (u32, u32, u32),
    pub photo_url: Option<String>,
}

fn br_date(iso: &str) -> String {
    match (iso.get(0..4), iso.get(5..7), iso.get(8..10)) {
        (Some(y), Some(m), Some(d)) => format!("{d}/{m}/{y}"),
        _ => iso.to_string(),
    }
}

/// `votacao`: Câmara /votacoes/{id}; `votos`: /votacoes/{id}/votos.
pub fn voto(votacao: &Value, votos: &Value, dep_id: u64) -> Option<VotoSpec> {
    let list = votos.get("dados")?.as_array()?;
    let mine = list
        .iter()
        .find(|v| v.pointer("/deputado_/id").and_then(Value::as_u64) == Some(dep_id))?;
    let (mut sim, mut nao, mut outros) = (0, 0, 0);
    for v in list {
        match v.get("tipoVoto").and_then(Value::as_str).unwrap_or("") {
            "Sim" => sim += 1,
            "Não" => nao += 1,
            _ => outros += 1,
        }
    }
    let d = "/dados";
    let prop = votacao.pointer(&format!("{d}/proposicoesAfetadas/0"));
    let titulo =
        match prop.and_then(|p| Some((s(p, "/siglaTipo")?, s(p, "/numero")?, s(p, "/ano")?))) {
            Some((t, n, a)) => {
                let ementa = prop.and_then(|p| s(p, "/ementa")).unwrap_or_default();
                let head = format!("{t} {n}/{a}");
                if ementa.is_empty() {
                    head
                } else {
                    format!("{head} · {}", truncate(&ementa, 160))
                }
            }
            None => truncate(
                &s(votacao, &format!("{d}/descricao")).unwrap_or_default(),
                180,
            ),
        };
    let tag = format!(
        "{}-{}",
        s(mine, "/deputado_/siglaPartido").unwrap_or_default(),
        s(mine, "/deputado_/siglaUf").unwrap_or_default()
    );
    Some(VotoSpec {
        deputado: s(mine, "/deputado_/nome")?,
        partido_uf: tag.trim_matches('-').into(),
        voto: s(mine, "/tipoVoto").unwrap_or_else(|| "—".into()),
        titulo,
        data: br_date(&s(votacao, &format!("{d}/data")).unwrap_or_default()),
        placar: (sim, nao, outros),
        photo_url: s(mine, "/deputado_/urlFoto"),
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgendaItemSpec {
    pub hora: String,
    pub sigla: String,
    pub titulo: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgendaSpec {
    pub dia: String,
    pub casa: String,
    pub items: Vec<AgendaItemSpec>,
    pub total: usize,
}

fn eventos_ativos(eventos: &Value) -> Vec<&Value> {
    eventos
        .get("dados")
        .and_then(Value::as_array)
        .map(|l| {
            l.iter()
                .filter(|e| {
                    !s(e, "/situacao")
                        .unwrap_or_default()
                        .to_lowercase()
                        .contains("cancel")
                })
                .collect()
        })
        .unwrap_or_default()
}

fn plenario(e: &Value) -> bool {
    s(e, "/orgaos/0/sigla").as_deref() == Some("PLEN")
}

fn hora(e: &Value) -> String {
    s(e, "/dataHoraInicio")
        .and_then(|h| h.get(11..16).map(str::to_string))
        .unwrap_or_default()
}

/// Plenary deliberative session whose pauta feeds the card (Câmara /eventos?dataInicio=D&dataFim=D).
pub fn agenda_evento_principal(eventos: &Value) -> Option<u64> {
    let ativos = eventos_ativos(eventos);
    let deliberativa = |e: &&&Value| {
        s(e, "/descricaoTipo")
            .unwrap_or_default()
            .to_lowercase()
            .contains("deliberativ")
    };
    ativos
        .iter()
        .filter(|e| plenario(e))
        .find(deliberativa)
        .or_else(|| ativos.iter().find(|e| plenario(e)))
        .and_then(|e| e.get("id")?.as_u64())
}

/// Card for `dia`: pauta of the main plenary session if given, else the day's events.
pub fn agenda(dia: &str, eventos: &Value, pauta: Option<&Value>) -> Option<AgendaSpec> {
    let dia_ext = dia_extenso(dia)?;
    let ativos = eventos_ativos(eventos);
    let pauta_items: Vec<&Value> = pauta
        .and_then(|p| p.get("dados"))
        .and_then(Value::as_array)
        .map(|l| l.iter().collect())
        .unwrap_or_default();
    if !pauta_items.is_empty() {
        let id = agenda_evento_principal(eventos);
        let h = ativos
            .iter()
            .find(|e| e.get("id").and_then(Value::as_u64) == id)
            .map(|e| hora(e))
            .unwrap_or_default();
        let items = pauta_items
            .iter()
            .map(|p| {
                let prop = p.get("proposicao_").filter(|x| !x.is_null());
                let sigla = prop
                    .and_then(|x| {
                        Some(format!(
                            "{} {}/{}",
                            s(x, "/siglaTipo")?,
                            s(x, "/numero")?,
                            s(x, "/ano")?
                        ))
                    })
                    .or_else(|| s(p, "/titulo"))
                    .unwrap_or_else(|| "Item".into());
                let titulo = prop.and_then(|x| s(x, "/ementa")).unwrap_or_default();
                AgendaItemSpec {
                    hora: h.clone(),
                    sigla,
                    titulo: truncate(&titulo, 140),
                }
            })
            .collect::<Vec<_>>();
        return Some(AgendaSpec {
            dia: dia_ext,
            casa: "Plenário da Câmara".into(),
            total: items.len(),
            items,
        });
    }
    let mut items: Vec<_> = ativos
        .iter()
        .map(|e| AgendaItemSpec {
            hora: hora(e),
            sigla: if plenario(e) {
                "Plenário".into()
            } else {
                s(e, "/orgaos/0/sigla").unwrap_or_else(|| "Câmara".into())
            },
            titulo: s(e, "/descricaoTipo").unwrap_or_default(),
        })
        .collect();
    items.sort_by(|a, b| a.hora.cmp(&b.hora));
    Some(AgendaSpec {
        dia: dia_ext,
        casa: "Câmara dos Deputados".into(),
        total: items.len(),
        items,
    })
}
