//! RSS 2.0 and Atom 1.0 feeds built from `/v1` responses. Pure: `parse` -> `sources`
//! (internal `/v1` URLs) -> `channel` (from their `data`) -> `rss`/`atom`.
use crate::api::datas;
use crate::money::compact_brl;
use serde_json::Value;

pub const SITE: &str = "https://emenda.online";

pub struct Feed {
    pub id: &'static str,
    pub path: &'static str,
    pub titulo: &'static str,
    pub descricao: &'static str,
    pub ttl: u32,
    pub exemplo: &'static str,
    /// Path parameter (name, description), if any.
    pub param: Option<(&'static str, &'static str)>,
}

pub static FEEDS: &[Feed] = &[
    Feed {
        id: "agenda",
        path: "/rss/agenda.xml",
        titulo: "Agenda do Congresso",
        descricao: "Próximas sessões e reuniões da Câmara e do Senado (7 dias), com pautas.",
        ttl: 900,
        exemplo: "/rss/agenda.xml",
        param: None,
    },
    Feed {
        id: "votacoes",
        path: "/rss/votacoes.xml",
        titulo: "Votações nominais da Câmara",
        descricao: "Últimas votações nominais do plenário, com resultado e placar.",
        ttl: 1800,
        exemplo: "/rss/votacoes.xml",
        param: None,
    },
    Feed {
        id: "emendas",
        path: "/rss/emendas.xml",
        titulo: "Últimos pagamentos de emendas",
        descricao: "Pagamentos mais recentes de emendas parlamentares.",
        ttl: 3600,
        exemplo: "/rss/emendas.xml",
        param: None,
    },
    Feed {
        id: "pix",
        path: "/rss/pix.xml",
        titulo: "Últimos pagamentos de emendas Pix",
        descricao: "Pagamentos recentes de transferências especiais (emendas Pix).",
        ttl: 3600,
        exemplo: "/rss/pix.xml",
        param: None,
    },
    Feed {
        id: "novidades",
        path: "/rss/novidades.xml",
        titulo: "Novidades do emenda.online",
        descricao: "O que mudou nos dados oficiais: pagamentos, votações e leis.",
        ttl: 3600,
        exemplo: "/rss/novidades.xml",
        param: None,
    },
    Feed {
        id: "deputado",
        path: "/rss/deputado/{id}.xml",
        titulo: "Deputado: proposições, votos e emendas",
        descricao: "Novas proposições, votos no plenário e emendas de um deputado.",
        ttl: 3600,
        exemplo: "/rss/deputado/204379.xml",
        param: Some(("id", "Id do deputado na Câmara")),
    },
    Feed {
        id: "municipio",
        path: "/rss/municipio/{ibge}.xml",
        titulo: "Emendas para um município",
        descricao: "Emendas destinadas a um município (código IBGE).",
        ttl: 3600,
        exemplo: "/rss/municipio/3550308.xml",
        param: Some(("ibge", "Código IBGE (7 dígitos)")),
    },
    Feed {
        id: "proposicao",
        path: "/rss/proposicao/{id}.xml",
        titulo: "Tramitação de uma proposição",
        descricao: "Cada novo passo da tramitação de uma proposição da Câmara.",
        ttl: 1800,
        exemplo: "/rss/proposicao/2270800.xml",
        param: Some(("id", "Id da proposição na Câmara")),
    },
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Fmt {
    Rss,
    Atom,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FeedReq {
    pub id: &'static str,
    pub arg: Option<String>,
    pub fmt: Fmt,
}

impl FeedReq {
    pub fn feed(&self) -> &'static Feed {
        FEEDS.iter().find(|f| f.id == self.id).expect("known feed")
    }
    pub fn ttl(&self) -> u32 {
        self.feed().ttl
    }
    pub fn ctype(&self) -> &'static str {
        match self.fmt {
            Fmt::Rss => "application/rss+xml; charset=utf-8",
            Fmt::Atom => "application/atom+xml; charset=utf-8",
        }
    }
}

/// `rest`: path after `/rss/` ("agenda.xml", "deputado/204379.atom").
pub fn parse(rest: &str) -> Option<FeedReq> {
    let (stem, fmt) = if let Some(s) = rest.strip_suffix(".xml") {
        (s, Fmt::Rss)
    } else {
        (rest.strip_suffix(".atom")?, Fmt::Atom)
    };
    let (name, arg) = match stem.split_once('/') {
        Some((n, a)) => (n, Some(a)),
        None => (stem, None),
    };
    let f = FEEDS.iter().find(|f| f.id == name)?;
    let ok = match (f.param, arg) {
        (None, None) => true,
        (Some(("ibge", _)), Some(a)) => a.len() == 7 && a.bytes().all(|b| b.is_ascii_digit()),
        (Some(_), Some(a)) => (1..=12).contains(&a.len()) && a.bytes().all(|b| b.is_ascii_digit()),
        _ => false,
    };
    ok.then(|| FeedReq {
        id: f.id,
        arg: arg.map(String::from),
        fmt,
    })
}

/// Internal `/v1` URLs whose `data` feed `channel`, in order.
pub fn sources(r: &FeedReq, today: &str) -> Vec<String> {
    let a = r.arg.as_deref().unwrap_or_default();
    match r.id {
        "agenda" => vec![format!(
            "/v1/agenda?de={today}&ate={}",
            datas::add(today, 7).unwrap_or_default()
        )],
        "votacoes" => vec!["/v1/votacoes?nominais=true&limit=50".into()],
        "emendas" | "pix" => vec!["/v1/feed".into()],
        "novidades" => vec!["/v1/novidades".into()],
        "deputado" => vec![
            format!("/v1/deputados/{a}"),
            format!("/v1/deputados/{a}/proposicoes?limit=20"),
            format!("/v1/deputados/{a}/votos?limit=10"),
            format!("/v1/deputados/{a}/emendas?ordem=-ano&limit=20"),
        ],
        "municipio" => vec![
            format!("/v1/municipios/{a}/emendas?ordem=-ano&limit=50"),
            format!("/v1/municipios/{a}/prefeito"),
        ],
        _ => vec![
            format!("/v1/proposicoes/{a}"),
            format!("/v1/proposicoes/{a}/tramitacoes?ordem=-sequencia&limit=50"),
        ],
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Item {
    pub title: String,
    pub link: String,
    pub guid: String,
    /// `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM[:SS]` (Brasília).
    pub date: String,
    pub desc: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Channel {
    pub title: String,
    pub link: String,
    pub desc: String,
    pub items: Vec<Item>,
}

fn s<'a>(v: &'a Value, p: &str) -> &'a str {
    v.pointer(p).and_then(Value::as_str).unwrap_or_default()
}
fn rows(v: Option<&Value>) -> Vec<Value> {
    v.and_then(Value::as_array).cloned().unwrap_or_default()
}
fn mes_data(m: i64) -> String {
    format!("{:04}-{:02}-01", m / 100, m % 100)
}
fn brl(v: &Value) -> String {
    compact_brl(v.as_i64().unwrap_or(0))
}

fn pagamento(e: &Value) -> Item {
    let cod = s(e, "/codigoEmenda");
    let mes = e["mes"].as_i64().unwrap_or(0);
    let mun = s(e, "/municipio/nome");
    let lugar = if mun.is_empty() {
        String::new()
    } else {
        format!(" — {mun}/{}", s(e, "/municipio/uf"))
    };
    Item {
        title: format!(
            "{} para {}{lugar}",
            brl(&e["valor"]),
            s(e, "/favorecido/nome")
        ),
        link: format!("{SITE}/autor/{}", s(e, "/autor/codigo")),
        guid: format!(
            "{SITE}/emenda/{cod}/{mes}/{}/{}",
            s(e, "/favorecido/documento"),
            e["valor"]
        ),
        date: mes_data(mes),
        desc: format!(
            "Emenda {cod} ({}) de {}. Pagamento de {} a {}{lugar}. Fonte: Portal da Transparência.",
            s(e, "/tipo"),
            s(e, "/autor/nome"),
            brl(&e["valor"]),
            s(e, "/favorecido/nome")
        ),
    }
}

fn emenda(e: &Value) -> Item {
    let cod = s(e, "/codigo");
    Item {
        title: format!(
            "Emenda {cod}: {} — {}",
            s(e, "/autor/nome"),
            s(e, "/funcao")
        ),
        link: format!("{SITE}/autor/{}", s(e, "/autor/codigo")),
        guid: format!("{SITE}/emenda/{cod}"),
        date: format!("{}-01-01", e["ano"].as_i64().unwrap_or(2000)),
        desc: format!(
            "{} · {} · empenhado {} · pago {} · {}",
            s(e, "/tipo"),
            s(e, "/localidade"),
            brl(&e["empenhado"]),
            brl(&e["pago"]),
            [s(e, "/programa"), s(e, "/acao")]
                .iter()
                .filter(|x| !x.is_empty())
                .cloned()
                .collect::<Vec<_>>()
                .join(" — ")
        ),
    }
}

fn prop(p: &Value) -> Item {
    let id = p["id"].as_i64().unwrap_or(0);
    let ano = p["ano"].as_i64().unwrap_or(2000);
    Item {
        title: format!("{}: {}", s(p, "/sigla"), s(p, "/ementa")),
        link: format!("{SITE}/proposicao/{id}"),
        guid: format!("{SITE}/proposicao/{id}"),
        date: format!("{ano}-01-01"),
        desc: s(p, "/ementa").into(),
    }
}

/// `data` of each source (None when it failed). `None` = feed subject not found.
pub fn channel(r: &FeedReq, data: &[Option<Value>]) -> Option<Channel> {
    let a = r.arg.as_deref().unwrap_or_default();
    let d = |i: usize| data.get(i).and_then(Option::as_ref);
    let f = r.feed();
    let mut ch = Channel {
        title: format!("{} — emenda.online", f.titulo),
        link: SITE.into(),
        desc: f.descricao.into(),
        items: vec![],
    };
    match r.id {
        "agenda" => {
            ch.link = format!("{SITE}/agenda");
            ch.items = rows(d(0))
                .iter()
                .map(|e| {
                    let mats: Vec<String> = rows(e.get("materias"))
                        .iter()
                        .map(|m| {
                            format!("{} {}", s(m, "/sigla"), s(m, "/ementa"))
                                .trim()
                                .to_string()
                        })
                        .collect();
                    let casa = if e["casa"] == "senado" {
                        "Senado"
                    } else {
                        "Câmara"
                    };
                    Item {
                        title: format!(
                            "[{casa}] {} {} — {} ({})",
                            s(e, "/dia"),
                            s(e, "/hora"),
                            s(e, "/titulo"),
                            s(e, "/orgaoSigla")
                        ),
                        link: s(e, "/fonte").into(),
                        guid: format!("{SITE}/agenda#{}", s(e, "/id")),
                        date: s(e, "/inicio").into(),
                        desc: [
                            s(e, "/orgao").to_string(),
                            s(e, "/descricao").to_string(),
                            format!("Situação: {}", s(e, "/status")),
                            mats.join("\n"),
                        ]
                        .into_iter()
                        .filter(|x| !x.is_empty())
                        .collect::<Vec<_>>()
                        .join("\n"),
                    }
                })
                .collect();
        }
        "votacoes" => {
            ch.link = format!("{SITE}/agenda");
            ch.items = rows(d(0))
                .iter()
                .map(|v| {
                    let id = s(v, "/id");
                    let res = match v["aprovada"].as_bool() {
                        Some(true) => "Aprovada",
                        Some(false) => "Rejeitada",
                        None => "Votação",
                    };
                    let pl = &v["placar"];
                    let placar = if pl.is_object() {
                        format!(" (Sim {} × Não {})", pl["sim"], pl["nao"])
                    } else {
                        String::new()
                    };
                    Item {
                        title: format!("{res}{placar}: {}", s(v, "/descricao")),
                        link: format!("{SITE}/votacao/{id}"),
                        guid: format!("{SITE}/votacao/{id}"),
                        date: {
                            let r = s(v, "/registro");
                            if r.is_empty() {
                                s(v, "/data").into()
                            } else {
                                r.into()
                            }
                        },
                        desc: s(v, "/descricao").into(),
                    }
                })
                .collect();
        }
        "emendas" | "pix" => {
            ch.link = format!("{SITE}/ultimas");
            let pix = r.id == "pix";
            if pix {
                ch.link = format!("{SITE}/pix");
            }
            ch.items = rows(d(0).and_then(|x| x.get("itens")))
                .iter()
                .filter(|e| !pix || e["tipo"] == "pix")
                .take(100)
                .map(pagamento)
                .collect();
        }
        "novidades" => {
            ch.link = format!("{SITE}/novidades");
            ch.items = rows(d(0).and_then(|x| x.get("itens")))
                .iter()
                .take(100)
                .map(|n| Item {
                    title: s(n, "/titulo").into(),
                    link: format!(
                        "{SITE}{}",
                        n.pointer("/entidades/0/url")
                            .and_then(Value::as_str)
                            .unwrap_or("/novidades")
                    ),
                    guid: s(n, "/id").into(),
                    date: s(n, "/data").trim_end_matches('Z').into(),
                    desc: s(n, "/texto").into(),
                })
                .collect();
        }
        "deputado" => {
            let dep = d(0)?;
            let nome = format!(
                "{} ({}-{})",
                s(dep, "/nome"),
                s(dep, "/partido"),
                s(dep, "/uf")
            );
            ch.title = format!("{nome} — emenda.online");
            ch.link = format!("{SITE}/deputado/{a}");
            ch.desc = format!("Proposições, votos no plenário e emendas de {nome}.");
            ch.items.extend(rows(d(1)).iter().map(prop));
            ch.items
                .extend(rows(d(2)).iter().filter(|v| !v["voto"].is_null()).map(|v| {
                    let vid = s(v, "/votacao");
                    Item {
                        title: format!("Votou {}: {}", s(v, "/voto"), s(v, "/descricao")),
                        link: format!("{SITE}/votacao/{vid}"),
                        guid: format!("{SITE}/votacao/{vid}#{a}"),
                        date: s(v, "/data").into(),
                        desc: s(v, "/descricao").into(),
                    }
                }));
            ch.items.extend(rows(d(3)).iter().map(emenda));
        }
        "municipio" => {
            let em = rows(d(0));
            let nome = em
                .first()
                .map(|e| s(e, "/localidade").to_string())
                .unwrap_or_else(|| a.to_string());
            ch.title = format!("Emendas para {nome} — emenda.online");
            ch.link = format!("{SITE}/municipio/{a}");
            ch.desc = format!("Emendas parlamentares destinadas a {nome} (IBGE {a}).");
            d(0)?;
            ch.items = em.iter().map(emenda).collect();
        }
        _ => {
            let p = d(0)?;
            ch.title = format!("{} — tramitação — emenda.online", s(p, "/sigla"));
            ch.link = format!("{SITE}/proposicao/{a}");
            ch.desc = s(p, "/ementa").into();
            ch.items = rows(d(1))
                .iter()
                .map(|t| Item {
                    title: format!(
                        "{} — {}",
                        s(t, "/orgao"),
                        if s(t, "/tramitacao").is_empty() {
                            s(t, "/situacao")
                        } else {
                            s(t, "/tramitacao")
                        }
                    ),
                    link: format!("{SITE}/proposicao/{a}"),
                    guid: format!("{SITE}/proposicao/{a}#t{}", t["sequencia"]),
                    date: s(t, "/data").into(),
                    desc: s(t, "/despacho").into(),
                })
                .collect();
        }
    }
    ch.items.sort_by(|x, y| y.date.cmp(&x.date));
    Some(ch)
}

/// XML text escaping; drops characters XML 1.0 forbids.
pub fn esc(s: &str) -> String {
    let mut o = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => o.push_str("&amp;"),
            '<' => o.push_str("&lt;"),
            '>' => o.push_str("&gt;"),
            '"' => o.push_str("&quot;"),
            '\'' => o.push_str("&apos;"),
            '\t' | '\n' | '\r' => o.push(c),
            c if (c as u32) < 0x20 || c == '\u{FFFE}' || c == '\u{FFFF}' => {}
            c => o.push(c),
        }
    }
    o
}

/// (date, HH:MM:SS) from a Brasília timestamp.
fn split(d: &str) -> (String, String) {
    let day = d
        .get(..10)
        .filter(|x| datas::parse(x).is_some())
        .unwrap_or("2000-01-01")
        .to_string();
    let mut t = d
        .get(11..)
        .unwrap_or("")
        .chars()
        .take(8)
        .collect::<String>();
    if t.len() == 5 {
        t.push_str(":00");
    }
    if t.len() != 8 {
        t = "00:00:00".into();
    }
    (day, t)
}

/// RFC 822 date, Brasília offset.
pub fn rfc822(d: &str) -> String {
    const DIA: [&str; 7] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const MES: [&str; 12] = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    let (day, t) = split(d);
    let w = datas::weekday(&day).unwrap_or(0) as usize;
    let m: usize = day[5..7].parse().unwrap_or(1);
    format!(
        "{}, {} {} {} {t} -0300",
        DIA[w],
        &day[8..10],
        MES[m - 1],
        &day[..4]
    )
}

/// RFC 3339, Brasília offset.
pub fn rfc3339(d: &str) -> String {
    let (day, t) = split(d);
    format!("{day}T{t}-03:00")
}

pub fn rss(ch: &Channel, self_url: &str, now: &str) -> String {
    let mut o = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<rss version=\"2.0\" xmlns:atom=\"http://www.w3.org/2005/Atom\">\n<channel>\n");
    o.push_str(&format!("<title>{}</title>\n<link>{}</link>\n<description>{}</description>\n<language>pt-BR</language>\n",
        esc(&ch.title), esc(&ch.link), esc(&ch.desc)));
    o.push_str(&format!(
        "<atom:link href=\"{}\" rel=\"self\" type=\"application/rss+xml\"/>\n",
        esc(self_url)
    ));
    o.push_str(&format!(
        "<lastBuildDate>{}</lastBuildDate>\n<generator>emenda.online</generator>\n<ttl>{}</ttl>\n",
        rfc822(now),
        60
    ));
    for i in &ch.items {
        o.push_str(&format!(
            "<item>\n<title>{}</title>\n<link>{}</link>\n<guid isPermaLink=\"false\">{}</guid>\n<pubDate>{}</pubDate>\n<description>{}</description>\n</item>\n",
            esc(&i.title), esc(&i.link), esc(&i.guid), rfc822(&i.date), esc(&i.desc)));
    }
    o.push_str("</channel>\n</rss>\n");
    o
}

pub fn atom(ch: &Channel, self_url: &str, now: &str) -> String {
    let updated = ch
        .items
        .first()
        .map_or_else(|| rfc3339(now), |i| rfc3339(&i.date));
    let mut o = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<feed xmlns=\"http://www.w3.org/2005/Atom\" xml:lang=\"pt-BR\">\n");
    o.push_str(&format!("<title>{}</title>\n<subtitle>{}</subtitle>\n<link href=\"{}\"/>\n<link rel=\"self\" type=\"application/atom+xml\" href=\"{}\"/>\n<id>{}</id>\n<updated>{updated}</updated>\n<author><name>emenda.online</name><uri>{SITE}</uri></author>\n",
        esc(&ch.title), esc(&ch.desc), esc(&ch.link), esc(self_url), esc(self_url)));
    for i in &ch.items {
        o.push_str(&format!(
            "<entry>\n<title>{}</title>\n<link href=\"{}\"/>\n<id>{}</id>\n<updated>{}</updated>\n<summary>{}</summary>\n</entry>\n",
            esc(&i.title), esc(&i.link), esc(&format!("tag:emenda.online,2026:{}", i.guid)), rfc3339(&i.date), esc(&i.desc)));
    }
    o.push_str("</feed>\n");
    o
}

pub fn render(r: &FeedReq, ch: &Channel, self_url: &str, now: &str) -> String {
    match r.fmt {
        Fmt::Rss => rss(ch, self_url, now),
        Fmt::Atom => atom(ch, self_url, now),
    }
}
