//! Viral OG content for every page: faces, one big number, a plain-language hook. Pure.
//!
//! Data flow: OG `Target` -> `page_of` -> `seo::pages::sources` (+ `extra_sources`) fetched by
//! glue -> `seo::pages::build` (Doc) -> `spec` -> glue resolves `Foto`s -> `og::viral_png`.
//!
//! Plain words: emenda = "dinheiro mandado por políticos"; Pix = "sem dizer para quê";
//! RP9 = "orçamento secreto". "emenda parlamentar" only as small secondary text.
use crate::cards::{chave_nome, i, s, truncate, Kind};
use crate::foto::Foto;
use crate::money::compact_brl;
use crate::route::Target;
use crate::seo::pages::title_case;
use crate::seo::{self, Doc, Fetched, Page, PageKind, SeoRoute, Source};
use serde_json::Value;

pub const ROTULO_DINHEIRO: &str = "Dinheiro mandado por políticos";
const SECUNDARIO: &str = "emendas parlamentares";

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct FaceSpec {
    pub nome: String,
    pub detalhe: String,
    pub foto: Option<Foto>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ViralSpec {
    pub rotulo: String,
    pub secundario: String,
    pub numero: String,
    pub frase: String,
    pub gancho: String,
    pub faces: Vec<FaceSpec>,
    /// Heading above the faces; empty -> "Quem mandou".
    pub faces_titulo: String,
    pub retrato: Option<Foto>,
    /// Party sigla.
    pub selo: Option<String>,
    /// Party sigla whose logo is shown.
    pub partido: Option<String>,
    /// UF sigla whose flag is shown.
    pub uf: Option<String>,
    pub placar: Option<(u32, u32, u32)>,
}

// ---------- routing ----------

/// Pages with an OG card but outside the SEO router: (slug, rótulo, frase, gancho).
const EXTRA_PAGES: [(&str, &str, &str, &str); 3] = [
    (
        "novidades",
        "O que mudou no dinheiro público",
        "Novidades do emenda.online",
        "Dinheiro novo, votações e mudanças, em português claro.",
    ),
    (
        "congresso",
        "Congresso em números",
        "Quem manda no Congresso",
        "Deputados, senadores, partidos e quanto cada um mandou.",
    ),
    (
        "stf",
        "Supremo Tribunal Federal",
        "O que o STF decidiu",
        "Ministros, processos e decisões que mexem com o seu dinheiro.",
    ),
];

/// Card for a page outside the SEO router.
pub fn extra_page(slug: &str) -> Option<ViralSpec> {
    let (_, rotulo, frase, gancho) = EXTRA_PAGES.iter().find(|(s, _, _, _)| *s == slug)?;
    Some(ViralSpec {
        rotulo: (*rotulo).into(),
        frase: (*frase).into(),
        gancho: (*gancho).into(),
        ..ViralSpec::default()
    })
}

pub fn is_extra_page(slug: &str) -> bool {
    EXTRA_PAGES.iter().any(|(s, _, _, _)| *s == slug)
}

const LEGACY: [(PageKind, Kind); 8] = [
    (PageKind::Uf, Kind::Uf),
    (PageKind::Municipio, Kind::Municipio),
    (PageKind::Autor, Kind::Autor),
    (PageKind::Deputado, Kind::Deputado),
    (PageKind::Senador, Kind::Senador),
    (PageKind::Proposicao, Kind::Proposicao),
    (PageKind::Votacao, Kind::Votacao),
    (PageKind::Partido, Kind::Partido),
];

/// OG image path for a page. Entity pages keep their historical `/og/{kind}/{id}.png`.
pub fn og_path(p: &Page) -> String {
    if let Some((_, k)) = LEGACY.iter().find(|(pk, _)| *pk == p.kind) {
        return format!("/og/{}/{}.png", k.slug(), p.id);
    }
    match p.kind {
        PageKind::Home => "/og/pagina/home.png".into(),
        PageKind::Agenda if p.id.is_empty() => "/og/agenda/hoje.png".into(),
        PageKind::Agenda => format!("/og/agenda/{}.png", p.id),
        _ => format!("/og/pagina{}.png", p.path()),
    }
}

/// OG URL path for a page, with `?v=` when the version is known.
pub fn og_url(p: &Page, v: Option<&str>) -> String {
    match v {
        Some(v) => crate::ogcache::with_version(&og_path(p), v),
        None => og_path(p),
    }
}

/// Page behind an OG target (`None` for voto/agenda/extra pages).
pub fn page_of(t: &Target) -> Option<Page> {
    match t.kind {
        Kind::Default => Some(Page::new(PageKind::Home, "")),
        Kind::Pagina if t.id == "home" => Some(Page::new(PageKind::Home, "")),
        Kind::Pagina => match seo::route("GET", &format!("/{}", t.id), None)? {
            SeoRoute::Page { page, md: false } if page.path() == format!("/{}", t.id) => Some(page),
            _ => None,
        },
        k => LEGACY
            .iter()
            .find(|(_, x)| *x == k)
            .map(|(pk, _)| Page::new(*pk, &t.id)),
    }
}

/// Valid `Kind::Pagina` id.
pub fn valid_pagina(id: &str) -> bool {
    id.len() <= 64
        && (id == "home"
            || is_extra_page(id)
            || page_of(&Target {
                kind: Kind::Pagina,
                id: id.into(),
            })
            .is_some_and(|p| {
                !LEGACY.iter().any(|(k, _)| *k == p.kind) && p.kind != PageKind::Agenda
            }))
}

/// Fetched after `seo::pages::sources`, passed to `spec` as `extra`.
pub fn extra_sources(p: &Page) -> Vec<Source> {
    match p.kind {
        PageKind::Home | PageKind::Emendas | PageKind::Dinheiro => {
            vec![Source::Data("v1/autores.json".into())]
        }
        _ => vec![],
    }
}

// ---------- plain-language helpers ----------

const UF_PREP: [(&str, &str); 27] = [
    ("AC", "no"),
    ("AL", "em"),
    ("AP", "no"),
    ("AM", "no"),
    ("BA", "na"),
    ("CE", "no"),
    ("DF", "no"),
    ("ES", "no"),
    ("GO", "em"),
    ("MA", "no"),
    ("MT", "em"),
    ("MS", "em"),
    ("MG", "em"),
    ("PA", "no"),
    ("PB", "na"),
    ("PR", "no"),
    ("PE", "em"),
    ("PI", "no"),
    ("RJ", "no"),
    ("RN", "no"),
    ("RS", "no"),
    ("RO", "em"),
    ("RR", "em"),
    ("SC", "em"),
    ("SP", "em"),
    ("SE", "em"),
    ("TO", "no"),
];

/// "na Bahia", "em São Paulo", "no Rio de Janeiro".
pub fn na_uf(uf: &str) -> String {
    let nome = seo::catalog::uf_nome(uf).unwrap_or(uf);
    let prep = UF_PREP
        .iter()
        .find(|(u, _)| *u == uf)
        .map_or("em", |(_, p)| p);
    format!("{prep} {nome}")
}

/// Emenda authors that are people (not bancadas, comissões, relator).
pub fn pessoa(chave: &str) -> bool {
    const NAO: [&str; 8] = [
        "BANCADA",
        "COM ",
        "COMISSAO",
        "RELATOR",
        "LIDERANCA",
        "MESA ",
        "SEM AUTOR",
        "PRESIDENCIA",
    ];
    let c = chave_nome(chave);
    !c.is_empty() && !NAO.iter().any(|p| c.starts_with(p))
}

fn arr<'a>(v: &'a Value, ptr: &str) -> &'a [Value] {
    v.pointer(ptr)
        .and_then(Value::as_array)
        .map_or(&[], Vec::as_slice)
}

/// Paid in the year plus paid from previous years (`pago + rapPago`), centavos.
fn chegou(t: &Value) -> i64 {
    i(t, "/pago").unwrap_or(0) + i(t, "/rapPago").unwrap_or(0)
}

fn pct(part: i64, total: i64) -> i64 {
    if total <= 0 {
        0
    } else {
        ((part as f64 / total as f64) * 100.0).round() as i64
    }
}

fn tipo(v: &Value, t: &str) -> i64 {
    arr(v, "/porTipo")
        .iter()
        .filter(|x| x.get("tipo").and_then(Value::as_str) == Some(t))
        .map(chegou)
        .sum()
}

/// "40% sem dizer para quê" (Pix) or "12% pelo orçamento secreto" (RP9).
fn alerta(v: &Value, total: i64) -> Option<String> {
    let p = pct(tipo(v, "pix"), total);
    if p >= 1 {
        return Some(format!("{p}% sem dizer para quê"));
    }
    let r = pct(tipo(v, "relator"), total);
    (r >= 1).then(|| format!("{r}% pelo orçamento secreto"))
}

fn com_pergunta(alerta: Option<String>, pergunta: &str) -> String {
    match alerta {
        Some(a) => format!("{a}. {pergunta}"),
        None => pergunta.into(),
    }
}

/// Top people by money (`pago`, else `valor`).
fn top_faces(autores: &[Value], n: usize) -> Vec<FaceSpec> {
    let mut v: Vec<&Value> = autores
        .iter()
        .filter(|a| pessoa(&s(a, "/chave").or_else(|| s(a, "/nome")).unwrap_or_default()))
        .collect();
    v.sort_by_key(|a| std::cmp::Reverse(i(a, "/pago").or_else(|| i(a, "/valor")).unwrap_or(0)));
    v.into_iter()
        .take(n)
        .filter_map(|a| {
            let nome = s(a, "/nome")?;
            let chave = s(a, "/chave").unwrap_or_else(|| chave_nome(&nome));
            let v = i(a, "/pago").or_else(|| i(a, "/valor")).unwrap_or(0);
            Some(FaceSpec {
                nome: title_case(&nome),
                detalhe: if v > 0 { compact_brl(v) } else { String::new() },
                foto: Some(Foto::Nome(chave)),
            })
        })
        .collect()
}

fn n_pessoas(autores: &[Value]) -> usize {
    autores
        .iter()
        .filter(|a| pessoa(&s(a, "/chave").unwrap_or_default()))
        .count()
}

fn por(n: usize) -> String {
    match n {
        0 => String::new(),
        1 => ", mandados por 1 político".into(),
        n => format!(", mandados por {n} políticos"),
    }
}

fn periodo(meta: Option<&Value>) -> String {
    let anos = meta
        .and_then(|m| m.get("anos"))
        .and_then(Value::as_array)
        .map(|a| a.iter().filter_map(Value::as_i64).collect::<Vec<_>>())
        .unwrap_or_default();
    match (anos.iter().min(), anos.iter().max()) {
        (Some(a), Some(b)) if a != b => format!("{SECUNDARIO} · {a}–{b}"),
        _ => SECUNDARIO.into(),
    }
}

fn dinheiro(meta: Option<&Value>) -> ViralSpec {
    ViralSpec {
        rotulo: ROTULO_DINHEIRO.into(),
        secundario: periodo(meta),
        ..ViralSpec::default()
    }
}

/// 2444 -> "2.444".
fn milhar(n: i64) -> String {
    let d = n.unsigned_abs().to_string();
    let mut out = String::new();
    for (k, c) in d.chars().enumerate() {
        if k > 0 && (d.len() - k).is_multiple_of(3) {
            out.push('.');
        }
        out.push(c);
    }
    if n < 0 {
        format!("-{out}")
    } else {
        out
    }
}

fn digits(x: &str) -> Option<u64> {
    x.parse().ok()
}

// ---------- specs ----------

/// Card for `p`. `d` = fetched `seo::pages::sources`, `extra` = fetched `extra_sources`.
pub fn spec(p: &Page, d: &[Fetched], extra: &[Fetched], doc: &Doc) -> ViralSpec {
    use PageKind::*;
    let at = |n: usize| d.get(n).and_then(Fetched::ok);
    let meta = at(0);
    let built = match p.kind {
        Municipio => at(1).and_then(|v| municipio(v, meta)),
        Uf => at(1).and_then(|v| uf(v, meta)),
        Pix => at(1).map(|v| pix(v, meta)),
        OrcamentoSecreto => at(1).map(|v| orcamento_secreto(v, meta)),
        Home | Emendas | Dinheiro => {
            at(1).map(|v| brasil(v, extra.first().and_then(Fetched::ok), meta))
        }
        Ultimas => at(1).and_then(ultimas),
        Autor => at(1).and_then(|v| autor(v, meta)),
        Deputado => at(1).and_then(|v| deputado(v, at(3), meta)),
        Senador => at(1).and_then(|v| senador(v, at(3), meta)),
        Votacao => at(1).map(|v| votacao(v, at(2), doc)),
        Proposicao => at(1).and_then(|v| proposicao(v, at(2))),
        Partido => partido(p, at(1), at(2)),
        _ => None,
    };
    let mut out = built.unwrap_or_else(|| from_doc(p, doc));
    if p.kind == Auditar {
        auditar(p, at(1), &mut out);
    }
    out
}

/// Generic card from the page Doc: h1, description, first short fact.
fn from_doc(p: &Page, doc: &Doc) -> ViralSpec {
    use PageKind::*;
    let rotulo = match p.kind {
        Comissao | Comissoes => "Comissões do Congresso",
        Bancada | Bancadas => "Frentes parlamentares",
        Federacao | Federacoes => "Federações de partidos",
        Entenda | EntendaTema => "Entenda em 1 minuto",
        Auditar => "Audite seu candidato",
        Agenda => "O que o Congresso vota",
        Deputados | Senadores | Estaduais | Partidos => "Quem manda no Congresso",
        Proposicoes => "Leis em votação",
        Votacao => "Como a Câmara votou",
        Deputado | Senador | Autor | Municipio | Uf | Pix | Home | Emendas | Dinheiro | Ultimas => {
            ROTULO_DINHEIRO
        }
        _ => "emenda.online",
    };
    let fato = doc.facts.iter().find(|(k, v)| {
        v.chars().count() <= 12
            && v.chars().any(|c| c.is_ascii_digit())
            && !k.to_lowercase().contains("código")
            && !k.to_lowercase().contains("data")
    });
    let frase = if doc.h1.trim().is_empty() {
        doc.title.clone()
    } else {
        doc.h1.clone()
    };
    ViralSpec {
        rotulo: rotulo.into(),
        secundario: fato.map(|(k, _)| k.to_lowercase()).unwrap_or_default(),
        numero: fato.map(|(_, v)| v.clone()).unwrap_or_default(),
        frase: if frase.trim().is_empty() {
            "Siga o dinheiro público".into()
        } else {
            truncate(frase.trim(), 120)
        },
        gancho: truncate(doc.description.trim(), 110),
        retrato: doc
            .image
            .as_deref()
            .filter(|u| u.starts_with("https://"))
            .map(|u| Foto::Url(u.into())),
        ..ViralSpec::default()
    }
}

fn municipio(m: &Value, meta: Option<&Value>) -> Option<ViralSpec> {
    let nome = s(m, "/nome")?;
    let uf = s(m, "/uf").unwrap_or_default();
    let total = chegou(m.get("totais")?);
    let autores = arr(m, "/autores");
    let lugar = if uf.is_empty() {
        nome
    } else {
        format!("{nome} ({uf})")
    };
    Some(ViralSpec {
        numero: compact_brl(total),
        frase: format!("chegaram em {lugar}{}", por(n_pessoas(autores))),
        gancho: com_pergunta(alerta(m, total), "Quem mandou?"),
        faces: top_faces(autores, 3),
        uf: Some(uf).filter(|u| !u.is_empty()),
        ..dinheiro(meta)
    })
}

fn uf(u: &Value, meta: Option<&Value>) -> Option<ViralSpec> {
    let sigla = s(u, "/uf")?;
    let total = chegou(u.get("totais")?);
    let autores = arr(u, "/autores");
    Some(ViralSpec {
        numero: compact_brl(total),
        frase: format!("chegaram {}{}", na_uf(&sigla), por(n_pessoas(autores))),
        gancho: com_pergunta(alerta(u, total), "Quem mandou?"),
        faces: top_faces(autores, 3),
        uf: Some(sigla),
        ..dinheiro(meta)
    })
}

fn pix(v: &Value, meta: Option<&Value>) -> ViralSpec {
    let total = v.get("totais").map_or(0, chegou);
    ViralSpec {
        rotulo: "Dinheiro mandado sem dizer para quê".into(),
        secundario: "emendas Pix (transferências especiais)".into(),
        numero: compact_brl(total),
        frase: "caíram direto no caixa das prefeituras".into(),
        gancho: "Tudo sem dizer para quê. Quem mais mandou?".into(),
        faces: top_faces(arr(v, "/autores"), 3),
        ..dinheiro(meta)
    }
}

fn orcamento_secreto(b: &Value, meta: Option<&Value>) -> ViralSpec {
    ViralSpec {
        rotulo: "Orçamento secreto".into(),
        secundario: "emendas de relator-geral (RP9), 2020–2022".into(),
        numero: compact_brl(tipo(b, "relator")),
        frase: "foram distribuídos sem mostrar quem pediu".into(),
        gancho: "Veja para onde foi 👇".into(),
        faces_titulo: "Quem pediu? Os nomes foram escondidos".into(),
        ..dinheiro(meta)
    }
}

fn brasil(b: &Value, autores: Option<&Value>, meta: Option<&Value>) -> ViralSpec {
    let total = b.get("totais").map_or(0, chegou);
    let anos: Vec<i64> = arr(b, "/porAno")
        .iter()
        .filter_map(|x| i(x, "/ano"))
        .collect();
    let desde = anos
        .iter()
        .min()
        .map(|a| format!(" desde {a}"))
        .unwrap_or_default();
    ViralSpec {
        numero: compact_brl(total),
        frase: format!("mandados por políticos para cidades e estados{desde}"),
        gancho: com_pergunta(alerta(b, total), "Quem mandou?"),
        faces: autores
            .and_then(Value::as_array)
            .map(|a| top_faces(a, 3))
            .unwrap_or_default(),
        ..dinheiro(meta)
    }
}

fn ultimas(r: &Value) -> Option<ViralSpec> {
    let j = arr(r, "/janelas").first()?;
    Some(ViralSpec {
        rotulo: ROTULO_DINHEIRO.into(),
        secundario: format!("{SECUNDARIO} · último mês"),
        numero: compact_brl(i(j, "/valor").unwrap_or(0)),
        frase: format!(
            "pagos no último mês, em {} pagamentos",
            milhar(i(j, "/pagamentos").unwrap_or(0))
        ),
        gancho: "Quem mandou agora? Veja a lista".into(),
        faces: top_faces(arr(j, "/autores"), 3),
        ..ViralSpec::default()
    })
}

fn autor(a: &Value, meta: Option<&Value>) -> Option<ViralSpec> {
    let nome = s(a, "/nome")?;
    let chave = s(a, "/chave").unwrap_or_else(|| chave_nome(&nome));
    let total = chegou(a.get("totais")?);
    let n_uf = arr(a, "/porUf").len();
    let onde = match n_uf {
        0 => String::new(),
        1 => String::new(),
        n => format!(" para {n} estados"),
    };
    Some(ViralSpec {
        numero: compact_brl(total),
        frase: format!("mandados por {}{onde}", title_case(&nome)),
        gancho: com_pergunta(alerta(a, total), "Para onde foi?"),
        retrato: pessoa(&chave).then_some(Foto::Nome(chave)),
        ..dinheiro(meta)
    })
}

fn find_autor<'a>(autores: Option<&'a Value>, nome: &str) -> Option<&'a Value> {
    let key = chave_nome(nome);
    autores?
        .as_array()?
        .iter()
        .find(|a| a.get("chave").and_then(Value::as_str) == Some(key.as_str()))
}

fn parlamentar(
    nome: String,
    partido: Option<String>,
    uf: Option<String>,
    foto: Foto,
    autores: Option<&Value>,
    meta: Option<&Value>,
    cargo: &str,
) -> ViralSpec {
    let tag = format!(
        "{}-{}",
        partido.clone().unwrap_or_default(),
        uf.clone().unwrap_or_default()
    );
    let tag = tag.trim_matches('-');
    let quem = if tag.is_empty() {
        nome.clone()
    } else {
        format!("{nome} ({tag})")
    };
    let a = find_autor(autores, &nome);
    let base = ViralSpec {
        secundario: format!("{cargo} · {SECUNDARIO}"),
        retrato: Some(foto),
        selo: partido.clone(),
        partido,
        uf,
        ..dinheiro(meta)
    };
    match a.map(|a| i(a, "/pago").unwrap_or(0)).filter(|v| *v > 0) {
        Some(pago) => ViralSpec {
            numero: compact_brl(pago),
            frase: format!("mandados por {quem}"),
            gancho: "Para onde foi esse dinheiro? Veja a lista".into(),
            ..base
        },
        None => ViralSpec {
            rotulo: "Siga o seu político".into(),
            frase: quem,
            gancho: "Veja gastos, votos e o dinheiro que mandou".into(),
            ..base
        },
    }
}

fn deputado(dep: &Value, autores: Option<&Value>, meta: Option<&Value>) -> Option<ViralSpec> {
    let st = "/dados/ultimoStatus";
    let nome = s(dep, &format!("{st}/nomeEleitoral")).or_else(|| s(dep, "/dados/nomeCivil"))?;
    let id = dep.pointer("/dados/id").and_then(Value::as_u64)?;
    Some(parlamentar(
        nome,
        s(dep, &format!("{st}/siglaPartido")),
        s(dep, &format!("{st}/siglaUf")),
        Foto::Deputado(id),
        autores,
        meta,
        "deputado(a) federal",
    ))
}

fn senador(sen: &Value, autores: Option<&Value>, meta: Option<&Value>) -> Option<ViralSpec> {
    let p = "/DetalheParlamentar/Parlamentar/IdentificacaoParlamentar";
    let nome = s(sen, &format!("{p}/NomeParlamentar"))?;
    let id = s(sen, &format!("{p}/CodigoParlamentar")).and_then(|x| digits(&x))?;
    Some(parlamentar(
        nome,
        s(sen, &format!("{p}/SiglaPartidoParlamentar")),
        s(sen, &format!("{p}/UfParlamentar")),
        Foto::Senador(id),
        autores,
        meta,
        "senador(a)",
    ))
}

fn votacao(v: &Value, votos: Option<&Value>, doc: &Doc) -> ViralSpec {
    let list = votos.map(|x| arr(x, "/dados")).unwrap_or(&[]);
    let (mut sim, mut nao, mut outros) = (0u32, 0u32, 0u32);
    for x in list {
        match x.get("tipoVoto").and_then(Value::as_str).unwrap_or("") {
            "Sim" => sim += 1,
            "Não" => nao += 1,
            _ => outros += 1,
        }
    }
    let resultado = match i(v, "/dados/aprovacao") {
        Some(1) => "Aprovada. ",
        Some(0) => "Rejeitada. ",
        _ => "",
    };
    let data = s(v, "/dados/data").unwrap_or_default();
    let data = match (data.get(0..4), data.get(5..7), data.get(8..10)) {
        (Some(y), Some(m), Some(d)) => format!("{d}/{m}/{y}"),
        _ => String::new(),
    };
    let frase = if doc.h1.trim().is_empty() {
        s(v, "/dados/descricao").unwrap_or_default()
    } else {
        doc.h1.clone()
    };
    ViralSpec {
        rotulo: "Como a Câmara votou".into(),
        secundario: [s(v, "/dados/siglaOrgao").unwrap_or_default(), data]
            .into_iter()
            .filter(|x| !x.is_empty())
            .collect::<Vec<_>>()
            .join(" · "),
        numero: if list.is_empty() {
            String::new()
        } else {
            format!("{sim} x {nao}")
        },
        frase: truncate(&frase, 120),
        gancho: format!("{resultado}Veja como votou cada deputado"),
        placar: (!list.is_empty()).then_some((sim, nao, outros)),
        ..ViralSpec::default()
    }
}

fn proposicao(p: &Value, autores: Option<&Value>) -> Option<ViralSpec> {
    let d = "/dados";
    let sigla = format!(
        "{} {}/{}",
        s(p, &format!("{d}/siglaTipo"))?,
        s(p, &format!("{d}/numero"))?,
        s(p, &format!("{d}/ano"))?
    );
    let primeiro = autores.map(|a| arr(a, "/dados")).and_then(|l| l.first());
    let dep_id = primeiro
        .and_then(|a| s(a, "/uri"))
        .and_then(|u| u.rsplit_once("/deputados/").map(|(_, id)| id.to_string()))
        .and_then(|id| digits(&id));
    let autor = primeiro.and_then(|a| s(a, "/nome"));
    let situacao = s(p, &format!("{d}/statusProposicao/descricaoSituacao"));
    Some(ViralSpec {
        rotulo: "Lei em jogo no Congresso".into(),
        secundario: autor.map(|a| format!("de {a}")).unwrap_or_default(),
        numero: sigla,
        frase: truncate(&s(p, &format!("{d}/ementa")).unwrap_or_default(), 140),
        gancho: match situacao {
            Some(x) => format!("{}. Quem votou a favor?", truncate(&x, 60)),
            None => "Quem votou a favor?".into(),
        },
        retrato: dep_id.map(Foto::Deputado),
        ..ViralSpec::default()
    })
}

fn partido(p: &Page, lista: Option<&Value>, membros: Option<&Value>) -> Option<ViralSpec> {
    let info = lista.and_then(|l| arr(l, "/dados").first());
    let nome = info
        .and_then(|x| s(x, "/nome"))
        .unwrap_or_else(|| p.id.clone());
    let deps = membros.map(|m| arr(m, "/dados")).unwrap_or(&[]);
    let faces = deps
        .iter()
        .take(3)
        .filter_map(|x| {
            Some(FaceSpec {
                nome: s(x, "/nome")?,
                detalhe: format!(
                    "{}-{}",
                    s(x, "/siglaPartido").unwrap_or_default(),
                    s(x, "/siglaUf").unwrap_or_default()
                ),
                foto: x.get("id").and_then(Value::as_u64).map(Foto::Deputado),
            })
        })
        .collect();
    Some(ViralSpec {
        rotulo: "Quem manda no Congresso".into(),
        secundario: format!("partido · {}", p.id),
        numero: if deps.is_empty() {
            p.id.clone()
        } else {
            format!("{} deputados", deps.len())
        },
        frase: nome,
        gancho: "Quanto cada um mandou? Veja a lista".into(),
        faces,
        faces_titulo: "Deputados do partido".into(),
        selo: Some(p.id.clone()),
        partido: Some(p.id.clone()),
        ..ViralSpec::default()
    })
}

/// Boletim card: portrait + plain question.
fn auditar(p: &Page, v: Option<&Value>, out: &mut ViralSpec) {
    let Some((casa, id)) = p.id.split_once('/') else {
        return;
    };
    let id = digits(id);
    let (nome, partido, uf) = match (casa, v) {
        ("senado", Some(v)) => {
            let b = "/DetalheParlamentar/Parlamentar/IdentificacaoParlamentar";
            (
                s(v, &format!("{b}/NomeParlamentar")),
                s(v, &format!("{b}/SiglaPartidoParlamentar")),
                s(v, &format!("{b}/UfParlamentar")),
            )
        }
        (_, Some(v)) => {
            let b = "/dados/ultimoStatus";
            (
                s(v, &format!("{b}/nomeEleitoral")),
                s(v, &format!("{b}/siglaPartido")),
                s(v, &format!("{b}/siglaUf")),
            )
        }
        _ => (None, None, None),
    };
    out.rotulo = "Audite seu candidato".into();
    out.secundario = "boletim · dinheiro, gastos e votos".into();
    out.numero = String::new();
    if let Some(n) = nome {
        out.frase = format!("{n} passa no teste?");
    }
    out.gancho = "Veja o boletim antes de votar".into();
    out.retrato = id.map(if casa == "senado" {
        Foto::Senador
    } else {
        Foto::Deputado
    });
    out.selo = partido.clone();
    out.partido = partido;
    out.uf = uf;
}
