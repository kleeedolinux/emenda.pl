//! Page documents from fetched JSON. Pure.
//!
//! `sources(page)` lists what to fetch (index 0 is always data `meta.json`); `build(page, fetched, now)`
//! turns the results into a `Doc`. Any missing source degrades to generic content, never an error.
use super::catalog::{self, PAUTAS, TEMAS};
use super::jsonld::{self, DatasetIn, EventIn, LegislationIn, PersonIn};
use super::{clip, fmt_int, Doc, Fetched, Item, Page, PageKind, Section, Source, ORIGIN, PORTAL};
use crate::cards::chave_nome;
use crate::money::compact_brl as brl;
use serde_json::{json, Value};

const SUFFIX: &str = " | emenda.online";
const CAMARA_API: &str = "https://dadosabertos.camara.leg.br/api/v2/";
const SENADO_API: &str = "https://legis.senado.leg.br/dadosabertos/";
const META: &str = "v1/meta.json";

// ---------- sources ----------

pub fn sources(p: &Page, today: &str) -> Vec<Source> {
    use PageKind::*;
    let data = |s: String| Source::Data(s);
    let cam = |s: String| Source::Camara(s);
    let id = &p.id;
    let mut v = vec![data(META.into())];
    match p.kind {
        Home | Emendas | Dinheiro | OrcamentoSecreto => v.push(data("v1/brasil.json".into())),
        QuemRecebe => v.push(data("v1/beneficiados.json".into())),
        Uf => v.push(data(format!("v1/uf/{id}.json"))),
        Municipio => v.push(data(format!("v1/municipio/{id}.json"))),
        Autor => v.push(data(format!("v1/autor/{id}.json"))),
        Deputado => v.extend([
            cam(format!("deputados/{id}")),
            data(format!("v1/gastos/deputado/{id}.json")),
            data("v1/autores.json".into()),
        ]),
        Senador => v.extend([
            Source::Senado(format!("senador/{id}")),
            data(format!("v1/gastos/senador/{id}.json")),
            data("v1/autores.json".into()),
        ]),
        Proposicao => v.extend([
            cam(format!("proposicoes/{id}")),
            cam(format!("proposicoes/{id}/autores")),
            cam(format!(
                "proposicoes/{id}/votacoes?ordem=DESC&ordenarPor=dataHoraRegistro"
            )),
        ]),
        Votacao => v.extend([
            cam(format!("votacoes/{id}")),
            cam(format!("votacoes/{id}/votos")),
        ]),
        Partido => v.extend([
            cam(format!("partidos?sigla={id}")),
            cam(format!(
                "deputados?siglaPartido={id}&ordem=ASC&ordenarPor=nome"
            )),
        ]),
        Comissao => v.push(cam(format!("orgaos/{id}"))),
        Bancada => v.extend([
            cam(format!("frentes/{id}")),
            cam(format!("frentes/{id}/membros")),
        ]),
        Auditar => match id.split_once('/') {
            Some(("senado", c)) => v.push(Source::Senado(format!("senador/{c}"))),
            Some((_, c)) => v.push(cam(format!("deputados/{c}"))),
            None => {}
        },
        Agenda => {
            let dia = if id.is_empty() { today } else { id.as_str() };
            v.push(cam(format!(
                "eventos?dataInicio={dia}&dataFim={dia}&ordem=ASC&ordenarPor=dataHoraInicio&itens=100"
            )));
        }
        Pix => v.push(data("v1/pix.json".into())),
        Ultimas => v.push(data("v1/rankings.json".into())),
        Deputados => v.push(cam("deputados?ordem=ASC&ordenarPor=nome".into())),
        Senadores => v.push(Source::Senado("senador/lista/atual".into())),
        Partidos => v.push(cam("partidos?itens=100&ordem=ASC&ordenarPor=sigla".into())),
        Comissoes => v.push(cam(
            "orgaos?codTipoOrgao=2&itens=100&ordem=ASC&ordenarPor=sigla".into(),
        )),
        EntendaTema | Entenda | Federacao | Proposicoes | Bancadas | Federacoes | Estaduais
        | Sobre | Api => {}
    }
    v
}

// ---------- helpers ----------

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

fn arr<'a>(v: &'a Value, ptr: &str) -> &'a [Value] {
    v.pointer(ptr)
        .and_then(Value::as_array)
        .map_or(&[], |a| a.as_slice())
}

/// "NINO COUTINHO" -> "Nino Coutinho"; keeps short connectives lowercase.
pub fn title_case(s: &str) -> String {
    if s.chars().any(|c| c.is_lowercase()) {
        return s.to_string();
    }
    s.split_whitespace()
        .enumerate()
        .map(|(n, w)| {
            let lw = w.to_lowercase();
            if n > 0 && ["de", "da", "do", "das", "dos", "e"].contains(&lw.as_str()) {
                return lw;
            }
            let mut c = lw.chars();
            match c.next() {
                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// "DIVULGAÇÃO DA ATIVIDADE PARLAMENTAR." -> "Divulgação da atividade parlamentar"
fn sentence_case(s: &str) -> String {
    let t = s.trim().trim_end_matches('.');
    if t.chars().any(|c| c.is_lowercase()) {
        return t.into();
    }
    let lw = t.to_lowercase();
    let mut c = lw.chars();
    match c.next() {
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
        None => String::new(),
    }
}

/// "2023-04-25..." -> "25/04/2023"
fn br_date(d: &str) -> String {
    match (d.get(0..4), d.get(5..7), d.get(8..10)) {
        (Some(y), Some(m), Some(dd)) => format!("{dd}/{m}/{y}"),
        _ => d.into(),
    }
}

/// 202610 -> "out/2026"
fn mes_label(m: i64) -> String {
    const M: [&str; 12] = [
        "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez",
    ];
    let (y, mm) = (m / 100, (m % 100) as usize);
    match M.get(mm.wrapping_sub(1)) {
        Some(n) => format!("{n}/{y}"),
        None => m.to_string(),
    }
}

fn tipo_label(t: &str) -> &str {
    match t {
        "individual" => "Individual",
        "pix" => "Emenda Pix (transferência especial)",
        "bancada" => "Bancada",
        "comissao" => "Comissão",
        "relator" => "Relator (RP9)",
        x => x,
    }
}

fn data_date(meta: Option<&Value>) -> Option<String> {
    super::sitemap::lastmod(meta)
}

fn anos(meta: Option<&Value>) -> Option<(i64, i64)> {
    let a = meta?.get("anos")?.as_array()?;
    Some((a.first()?.as_i64()?, a.last()?.as_i64()?))
}

fn doc(p: &Page, title: &str, h1: &str, desc: &str) -> Doc {
    Doc {
        path: p.path(),
        md_path: p.md_path(),
        title: format!("{title}{SUFFIX}"),
        h1: h1.into(),
        description: clip(desc, 160),
        breadcrumbs: vec![("Início".into(), "/".into())],
        status: 200,
        complete: true,
        ..Default::default()
    }
}

fn crumb(d: &mut Doc, name: &str, path: &str) {
    d.breadcrumbs.push((name.into(), path.into()));
}

fn here(d: &mut Doc, name: &str) {
    let p = d.path.clone();
    crumb(d, name, &p);
}

fn src(d: &mut Doc, label: &str, url: &str) {
    d.sources.push((label.into(), url.into()));
}

fn section(heading: &str, items: Vec<Item>) -> Section {
    Section {
        heading: heading.into(),
        text: None,
        items,
    }
}

fn text_section(heading: &str, text: &str) -> Section {
    Section {
        heading: heading.into(),
        text: Some(text.into()),
        items: vec![],
    }
}

fn fact(d: &mut Doc, k: &str, v: impl Into<String>) {
    d.facts.push((k.into(), v.into()));
}

fn money_facts(d: &mut Doc, t: &Value) {
    fact(d, "Emendas", fmt_int(i(t, "/n").unwrap_or(0)));
    for (k, label) in [
        ("empenhado", "Empenhado"),
        ("pago", "Pago"),
        ("rapPago", "Restos a pagar pagos"),
    ] {
        if let Some(x) = i(t, &format!("/{k}")) {
            fact(d, label, brl(x));
        }
    }
}

fn by_pago(list: &[Value]) -> Vec<&Value> {
    let mut v: Vec<&Value> = list.iter().collect();
    v.sort_by_key(|x| std::cmp::Reverse(i(x, "/pago").or_else(|| i(x, "/valor")).unwrap_or(0)));
    v
}

fn autor_items(list: &[Value], max: usize) -> Vec<Item> {
    by_pago(list)
        .into_iter()
        .take(max)
        .filter_map(|a| {
            let c = s(a, "/codigo")?;
            let n = title_case(&s(a, "/nome")?);
            let note = format!(
                "{} pagos em {} emendas",
                brl(i(a, "/pago").or_else(|| i(a, "/valor")).unwrap_or(0)),
                fmt_int(i(a, "/n").or_else(|| i(a, "/pagamentos")).unwrap_or(0))
            );
            Some(Item::link(n, format!("/autor/{c}"), Some(note)))
        })
        .collect()
}

fn municipio_items(list: &[Value], max: usize, with_uf: bool) -> Vec<Item> {
    by_pago(list)
        .into_iter()
        .take(max)
        .filter_map(|m| {
            let id = s(m, "/ibge")?;
            let nome = s(m, "/nome")?;
            let label = match (with_uf, s(m, "/uf")) {
                (true, Some(uf)) => format!("{nome} ({uf})"),
                _ => nome,
            };
            let v = i(m, "/pago").or_else(|| i(m, "/valor")).unwrap_or(0);
            Some(Item::link(label, format!("/municipio/{id}"), Some(brl(v))))
        })
        .collect()
}

fn uf_items(list: &[Value]) -> Vec<Item> {
    by_pago(list)
        .into_iter()
        .filter_map(|u| {
            let uf = s(u, "/uf")?;
            let nome = s(u, "/nome").unwrap_or_else(|| uf.clone());
            let v = i(u, "/pago")
                .or_else(|| i(u, "/valor"))
                .or_else(|| i(u, "/aberto"))
                .unwrap_or(0);
            Some(Item::link(
                format!("{nome} ({uf})"),
                format!("/uf/{uf}"),
                Some(brl(v)),
            ))
        })
        .collect()
}

fn breakdown(list: &[Value], key: &str, label: fn(&str) -> &str) -> Vec<Item> {
    by_pago(list)
        .into_iter()
        .filter_map(|x| {
            let k = s(x, &format!("/{key}"))?;
            Some(Item::text(
                label(&k).to_string(),
                Some(format!(
                    "{} pagos, {} emendas",
                    brl(i(x, "/pago").unwrap_or(0)),
                    fmt_int(i(x, "/n").unwrap_or(0))
                )),
            ))
        })
        .collect()
}

fn same(x: &str) -> &str {
    x
}

fn dataset(
    d: &mut Doc,
    name: &str,
    api: &str,
    file: &str,
    meta: Option<&Value>,
    spatial: Option<String>,
) {
    let url = super::abs(ORIGIN, &d.path);
    let temporal = anos(meta).map(|(a, b)| format!("{a}/{b}"));
    let modified = data_date(meta);
    let desc = d.description.clone();
    let mut distribution = vec![];
    if !api.is_empty() {
        distribution.push((
            "API JSON (/v1)".to_string(),
            format!("{ORIGIN}{api}"),
            "application/json",
        ));
    }
    if !file.is_empty() {
        distribution.push((
            "Arquivo JSON".to_string(),
            format!("{ORIGIN}/data/{file}"),
            "application/json",
        ));
    }
    distribution.push((
        "Markdown".to_string(),
        super::abs(ORIGIN, &d.md_path),
        "text/markdown",
    ));
    d.entities.push(jsonld::dataset(&DatasetIn {
        url: &url,
        name,
        description: &desc,
        distribution,
        temporal,
        keywords: vec![
            "emendas parlamentares",
            "orçamento",
            "transparência",
            "Congresso Nacional",
        ],
        modified: modified.as_deref(),
        spatial,
    }));
}

fn portal(d: &mut Doc) {
    src(d, "Portal da Transparência (CGU)", PORTAL);
}

fn explore_items() -> Vec<Item> {
    [
        ("Explorador de emendas", "/emendas"),
        ("Emenda Pix", "/pix"),
        ("Últimos pagamentos", "/ultimas"),
        ("Para onde vai o dinheiro", "/dinheiro"),
        ("Deputados", "/deputados"),
        ("Senadores", "/senadores"),
        ("Proposições polêmicas", "/proposicoes"),
        ("Agenda do Congresso", "/agenda"),
        ("Partidos", "/partidos"),
        ("Entenda", "/entenda"),
        ("API aberta", "/api"),
    ]
    .iter()
    .map(|(l, h)| Item::link(*l, *h, None))
    .collect()
}

fn pauta_items() -> Vec<Item> {
    PAUTAS
        .iter()
        .map(|p| {
            Item::link(
                format!("{} — {}", p.rotulo(), p.apelido),
                format!("/proposicao/{}", p.camara_id),
                Some(p.resumo.into()),
            )
        })
        .collect()
}

fn tema_items() -> Vec<Item> {
    TEMAS
        .iter()
        .map(|t| {
            Item::link(
                t.titulo,
                format!("/entenda/{}", t.slug),
                Some(t.resumo.into()),
            )
        })
        .collect()
}

// ---------- build ----------

pub fn build(p: &Page, d: &[Fetched], now: &str) -> Doc {
    use PageKind::*;
    let at = |n: usize| d.get(n).and_then(Fetched::ok);
    let meta = at(0);
    let primary_404 = matches!(d.get(1), Some(Fetched::NotFound))
        && matches!(
            p.kind,
            Uf | Municipio
                | Autor
                | Deputado
                | Senador
                | Proposicao
                | Votacao
                | Comissao
                | Bancada
                | Auditar
        );
    let built = match p.kind {
        Home => at(1).map(|b| home(p, b, meta)),
        Uf => at(1).and_then(|v| uf(p, v, meta)),
        Municipio => at(1).and_then(|v| municipio(p, v, meta)),
        Autor => at(1).and_then(|v| autor(p, v, meta)),
        Deputado => at(1).and_then(|v| deputado(p, v, at(2), at(3))),
        Senador => at(1).and_then(|v| senador(p, v, at(2), at(3))),
        Proposicao => at(1).and_then(|v| proposicao(p, v, at(2), at(3))),
        Votacao => at(1).and_then(|v| votacao(p, v, at(2))),
        Partido => at(1).and_then(|v| partido(p, v, at(2))),
        Comissao => at(1).and_then(|v| comissao(p, v)),
        Bancada => at(1).and_then(|v| bancada(p, v, at(2))),
        Auditar => at(1).and_then(|v| auditar(p, v)),
        EntendaTema => entenda_tema(p),
        Agenda => Some(agenda(p, at(1), now)),
        Pix => at(1).map(|v| pix(p, v, meta)),
        Ultimas => at(1).map(|v| ultimas(p, v)),
        Emendas => at(1).map(|v| emendas(p, v, meta)),
        Dinheiro => at(1).map(|v| dinheiro(p, v, meta)),
        Deputados => at(1).map(|v| deputados(p, v)),
        Senadores => at(1).map(|v| senadores(p, v)),
        Partidos => at(1).map(|v| partidos(p, v)),
        Comissoes => at(1).map(|v| comissoes(p, v)),
        OrcamentoSecreto => at(1).map(|v| orcamento_secreto(p, v, meta)),
        QuemRecebe => at(1).map(|v| quem_recebe(p, v, meta)),
        _ => None,
    };
    let live = matches!(
        p.kind,
        Deputado
            | Senador
            | Proposicao
            | Votacao
            | Partido
            | Comissao
            | Bancada
            | Auditar
            | Agenda
            | Deputados
            | Senadores
            | Partidos
            | Comissoes
    );
    let mut out = match built {
        Some(x) if !primary_404 => x,
        _ => generic(p, meta),
    };
    if primary_404 || (p.kind == EntendaTema && catalog::tema(&p.id).is_none()) {
        out.status = 404;
    }
    out.complete = !d.iter().any(|f| matches!(f, Fetched::Failed));
    if out.updated.is_none() {
        out.updated = if live {
            Some(now.into())
        } else {
            data_date(meta)
        };
    }
    if out.sources.is_empty() {
        portal(&mut out);
    }
    out
}

fn generic(p: &Page, meta: Option<&Value>) -> Doc {
    use PageKind::*;
    let id = p.id.as_str();
    let total = meta
        .and_then(|m| m.get("totais"))
        .map(|t| {
            format!(
                "{} pagos em {} emendas",
                brl(i(t, "/pago").unwrap_or(0)),
                fmt_int(i(t, "/n").unwrap_or(0))
            )
        })
        .unwrap_or_else(|| "bilhões em emendas".into());
    let (title, h1, desc): (String, String, String) = match p.kind {
        Home => (
            "emenda.online: emendas parlamentares, emenda Pix, votações e gastos do Congresso".into(),
            "Para onde vão as emendas parlamentares".into(),
            format!("Siga o dinheiro público: {total}. Quem enviou, para qual município, emenda Pix, votações e gastos de deputados e senadores."),
        ),
        Uf => {
            let nome = catalog::uf_nome(id).unwrap_or(id);
            (format!("Emendas parlamentares em {nome} ({id}): municípios e autores"), format!("Emendas parlamentares em {nome}"), format!("Quanto {nome} recebeu em emendas parlamentares, quais municípios e quem enviou o dinheiro."))
        }
        Municipio => (format!("Município {id}: emendas parlamentares, prefeito e quem enviou"), format!("Emendas parlamentares do município {id}"), "Emendas parlamentares recebidas pelo município: valores pagos, autores, emenda Pix e prefeito.".into()),
        Autor => (format!("Autor {id}: emendas parlamentares enviadas"), format!("Emendas do autor {id}"), "Emendas parlamentares enviadas por este autor: valores pagos e destinos.".into()),
        Deputado => (format!("Deputado(a) federal {id}: como votou, emendas e cota parlamentar"), format!("Deputado(a) federal {id}"), "Votos, proposições, emendas e gastos da cota parlamentar do(a) deputado(a) federal.".into()),
        Senador => (format!("Senador(a) {id}: emendas, votos e gastos"), format!("Senador(a) {id}"), "Emendas, votos e gastos do(a) senador(a).".into()),
        Proposicao => (format!("Proposição {id}: situação e como votou cada deputado"), format!("Proposição {id}"), "Tramitação, situação, autores e votações nominais da proposição na Câmara.".into()),
        Votacao => (format!("Votação {id} na Câmara: como votou cada deputado"), format!("Votação {id}"), "Placar e voto de cada deputado nesta votação da Câmara, por partido e UF.".into()),
        Partido => (format!("{id}: deputados, bancada e votos"), format!("Partido {id}"), format!("Bancada do {id} na Câmara, deputados em exercício e como votam.")),
        Comissao => (format!("Comissão {id} da Câmara: membros e pauta"), format!("Comissão {id}"), "Membros, pauta e votações da comissão da Câmara dos Deputados.".into()),
        Bancada => (format!("Frente parlamentar {id}: membros"), format!("Frente parlamentar {id}"), "Deputados membros da frente parlamentar (bancada temática) e como votam.".into()),
        Federacao => (format!("Federação partidária {id}"), format!("Federação partidária {id}"), "Partidos da federação, bancada e votos na Câmara.".into()),
        EntendaTema => ("Tema não encontrado — Entenda".into(), "Tema não encontrado".into(), "Explicações curtas sobre emendas, votações e leis.".into()),
        Auditar => (format!("Auditoria de gastos do parlamentar {id}"), "Auditoria de gastos".into(), "Gastos da cota parlamentar nota a nota, com regras de auditoria e fontes oficiais.".into()),
        Agenda => ("Agenda do Congresso hoje: o que a Câmara e o Senado votam".into(), "Agenda do Congresso".into(), "O que a Câmara e o Senado discutem e votam hoje, com horários, comissões e resultados.".into()),
        Pix => ("Emenda Pix: transferências especiais, quem enviou e para onde".into(), "Emenda Pix".into(), "Emenda Pix (transferência especial): quanto foi pago, para quais municípios e quais parlamentares enviaram.".into()),
        Ultimas => ("Últimos pagamentos de emendas parlamentares".into(), "Últimos pagamentos de emendas".into(), "Pagamentos mais recentes de emendas parlamentares: autores, municípios e valores.".into()),
        Emendas => ("Emendas parlamentares: explorador por autor, município e tipo".into(), "Explorador de emendas parlamentares".into(), format!("Explore {total}: filtre por autor, município, estado, ano e tipo.")),
        Dinheiro => ("Para onde vai o dinheiro das emendas: por estado, área e tipo".into(), "Para onde vai o dinheiro".into(), format!("Fluxo do dinheiro das emendas parlamentares: {total}, por estado, área e tipo.")),
        Entenda => ("Entenda emendas parlamentares, emenda Pix e orçamento secreto".into(), "Entenda".into(), "Explicações curtas sobre emendas parlamentares, emenda Pix, orçamento secreto, votações e como uma lei nasce.".into()),
        Deputados => ("Deputados federais em exercício: partido, UF, emendas e gastos".into(), "Deputados federais".into(), "Lista dos 513 deputados federais: partido, estado, emendas, gastos da cota parlamentar e como votaram.".into()),
        Senadores => ("Senadores em exercício: partido, UF, emendas e gastos".into(), "Senadores".into(), "Lista dos 81 senadores: partido, estado, emendas e gastos.".into()),
        Proposicoes => ("Proposições polêmicas: como votou cada deputado (PL 2630, reforma tributária)".into(), "Proposições e votações".into(), "Projetos de lei de grande repercussão e como votou cada deputado: PL das Fake News, reforma tributária, marco temporal e outros.".into()),
        Partidos => ("Partidos políticos na Câmara: bancadas e votos".into(), "Partidos".into(), "Partidos com representação na Câmara dos Deputados: bancadas, deputados e votos.".into()),
        Bancadas => ("Bancadas temáticas: ruralista, evangélica, da bala e outras".into(), "Bancadas temáticas".into(), "Frentes parlamentares (bancadas temáticas) da Câmara: membros, partidos e como votam.".into()),
        Comissoes => ("Comissões da Câmara dos Deputados: membros e pautas".into(), "Comissões".into(), "Comissões permanentes da Câmara: membros, pautas e votações.".into()),
        Federacoes => ("Federações partidárias: partidos e bancadas".into(), "Federações partidárias".into(), "Federações partidárias registradas no TSE e suas bancadas na Câmara.".into()),
        Estaduais => ("Deputados estaduais e assembleias legislativas".into(), "Deputados estaduais".into(), "Links e dados das assembleias legislativas estaduais.".into()),
        Sobre => ("Sobre o emenda.online: fontes, método e autora".into(), "Sobre".into(), "Como o emenda.online coleta e cruza dados públicos de emendas, votações e gastos; fontes, licença e autoria.".into()),
        OrcamentoSecreto => ("Orçamento secreto: bilhões distribuídos sem mostrar quem pediu".into(), "Orçamento secreto".into(), "Entre 2020 e 2022, o relator do Orçamento distribuiu bilhões sem mostrar quem pediu. Veja para onde foi o dinheiro.".into()),
        QuemRecebe => ("Quem mais recebe dinheiro de emendas: empresas, entidades e fundos".into(), "Quem mais recebe".into(), "As empresas privadas, entidades e fundos públicos que mais receberam dinheiro mandado por deputados e senadores.".into()),
        Api => ("API aberta de emendas parlamentares e votações".into(), "API aberta".into(), "API JSON gratuita, sem chave: emendas por município, estado e autor, deputados, senadores, proposições e votações.".into()),
    };
    let mut d = doc(p, &title, &h1, &desc);
    match p.kind {
        Home => {}
        Uf | Municipio | Autor => {
            crumb(&mut d, "Emendas", "/emendas");
            here(&mut d, &h1);
        }
        Deputado | Senador | Proposicao | Votacao | Partido => {
            let (n, h) = match p.kind {
                Deputado => ("Deputados", "/deputados"),
                Senador => ("Senadores", "/senadores"),
                Partido => ("Partidos", "/partidos"),
                _ => ("Proposições", "/proposicoes"),
            };
            crumb(&mut d, n, h);
            here(&mut d, &h1);
        }
        EntendaTema => crumb(&mut d, "Entenda", "/entenda"),
        _ => here(&mut d, &h1),
    }
    match p.kind {
        Proposicoes => d
            .sections
            .push(section("Pautas de grande repercussão", pauta_items())),
        Entenda => d.sections.push(section("Temas", tema_items())),
        Api => d.sections.push(api_section()),
        Home | Sobre | Federacoes | Bancadas | Estaduais => {
            d.sections.push(section("Explore", explore_items()))
        }
        _ => {}
    }
    d
}

fn api_section() -> Section {
    let idx = crate::api::index();
    let items = idx["endpoints"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|e| {
            Some(Item::link(
                e["path"].as_str()?.to_string(),
                e["exemplo"].as_str()?.to_string(),
                e["descricao"].as_str().map(str::to_string),
            ))
        })
        .collect();
    Section {
        heading: "Endpoints".into(),
        text: Some("JSON, CORS livre, sem chave. Base: https://emenda.online/v1".into()),
        items,
    }
}

fn home(p: &Page, b: &Value, meta: Option<&Value>) -> Doc {
    let t = &b["totais"];
    let (a0, a1) = anos(meta).unwrap_or((2014, 2026));
    let desc = format!(
        "Siga o dinheiro: {} pagos em {} emendas parlamentares desde {a0}. Quem enviou, para qual município, emenda Pix e como votou cada deputado.",
        brl(i(t, "/pago").unwrap_or(0)),
        fmt_int(i(t, "/n").unwrap_or(0))
    );
    let mut d = doc(
        p,
        "emenda.online: emendas parlamentares, emenda Pix, votações e gastos do Congresso",
        "Para onde vão as emendas parlamentares",
        &desc,
    );
    d.intro = Some(format!("Dados de emendas parlamentares de {a0} a {a1} (Portal da Transparência), votações e gastos da Câmara e do Senado, atualizados diariamente."));
    money_facts(&mut d, t);
    fact(&mut d, "Período", format!("{a0}–{a1}"));
    d.sections.push(section(
        "Emendas pagas por estado",
        uf_items(arr(b, "/porUf")),
    ));
    d.sections.push(section(
        "Por tipo de emenda",
        breakdown(arr(b, "/porTipo"), "tipo", tipo_label),
    ));
    d.sections.push(section("Explore", explore_items()));
    d.sections.push(section(
        "Pautas polêmicas: como votou cada deputado",
        pauta_items(),
    ));
    d.sections.push(section("Entenda", tema_items()));
    portal(&mut d);
    dataset(
        &mut d,
        "Emendas parlamentares no Brasil (totais)",
        "/v1/brasil",
        "v1/brasil.json",
        meta,
        Some("Brasil".into()),
    );
    d
}

fn uf(p: &Page, v: &Value, meta: Option<&Value>) -> Option<Doc> {
    let uf = p.id.as_str();
    let nome = s(v, "/nome").or_else(|| catalog::uf_nome(uf).map(String::from))?;
    let t = &v["totais"];
    let pago = brl(i(t, "/pago").unwrap_or(0));
    let prep = uf_prep(uf);
    let title =
        format!("Emendas parlamentares {prep} {nome} ({uf}): {pago} pagos, municípios e autores");
    let munis = arr(v, "/municipios");
    let top = by_pago(munis).first().and_then(|m| s(m, "/nome"));
    let desc = format!(
        "{nome} recebeu {pago} em {} emendas parlamentares pagas{}. Veja municípios, quem enviou e a emenda Pix em {uf}.",
        fmt_int(i(t, "/n").unwrap_or(0)),
        top.map(|t| format!("; maior destino: {t}")).unwrap_or_default()
    );
    let mut d = doc(
        p,
        &title,
        &format!("Emendas parlamentares {prep} {nome} ({uf})"),
        &desc,
    );
    here(&mut d, &nome);
    money_facts(&mut d, t);
    fact(
        &mut d,
        "Municípios com emendas",
        fmt_int(munis.len() as i64),
    );
    d.sections.push(section(
        "Municípios que mais receberam",
        municipio_items(munis, usize::MAX, false),
    ));
    d.sections.push(section(
        "Quem mais enviou",
        autor_items(arr(v, "/autores"), 50),
    ));
    d.sections.push(section(
        "Por tipo",
        breakdown(arr(v, "/porTipo"), "tipo", tipo_label),
    ));
    portal(&mut d);
    d.entities.push(jsonld::uf_area(uf, &nome, ORIGIN));
    dataset(
        &mut d,
        &format!("Emendas parlamentares — {nome}"),
        &format!("/v1/ufs/{uf}"),
        &format!("v1/uf/{uf}.json"),
        meta,
        Some(nome.clone()),
    );
    Some(d)
}

/// "na Bahia", "em São Paulo", "no Pará".
fn uf_prep(uf: &str) -> &'static str {
    match uf {
        "BA" | "PB" | "PE" => "na",
        "AC" | "AP" | "AM" | "CE" | "DF" | "ES" | "MA" | "MT" | "MS" | "PA" | "PR" | "PI"
        | "RJ" | "RN" | "RS" | "TO" => "no",
        _ => "em",
    }
}

fn prefeito(v: &Value) -> Option<(String, Option<String>)> {
    Some((
        title_case(&s(v, "/prefeito/nome")?),
        s(v, "/prefeito/partido"),
    ))
}

fn municipio(p: &Page, v: &Value, meta: Option<&Value>) -> Option<Doc> {
    let nome = s(v, "/nome")?;
    let uf = s(v, "/uf").unwrap_or_default();
    let t = &v["totais"];
    let pago = brl(i(t, "/pago").unwrap_or(0));
    let pix = arr(v, "/porTipo")
        .iter()
        .find(|x| x["tipo"] == "pix")
        .and_then(|x| i(x, "/pago"))
        .filter(|x| *x > 0);
    let pref = prefeito(v);
    let autores = arr(v, "/autores");
    let top_autor = by_pago(autores)
        .first()
        .and_then(|a| s(a, "/nome"))
        .map(|n| title_case(&n));
    let mut desc = format!(
        "{nome}-{uf} recebeu {pago} em {} emendas parlamentares",
        fmt_int(i(t, "/n").unwrap_or(0))
    );
    if let Some(x) = pix {
        desc.push_str(&format!(" ({} via emenda Pix)", brl(x)));
    }
    desc.push('.');
    if let Some((n, pt)) = &pref {
        desc.push_str(&format!(
            " Prefeito(a): {n}{}.",
            pt.as_ref().map(|p| format!(" ({p})")).unwrap_or_default()
        ));
    }
    if let Some(a) = &top_autor {
        desc.push_str(&format!(" Quem mais enviou: {a}."));
    }
    let title = format!("{nome} ({uf}): {pago} em emendas parlamentares, prefeito e quem enviou");
    let mut d = doc(
        p,
        &title,
        &format!("Emendas parlamentares em {nome} ({uf})"),
        &desc,
    );
    if let Some(n) = catalog::uf_nome(&uf) {
        crumb(&mut d, n, &format!("/uf/{uf}"));
    }
    here(&mut d, &nome);
    if let Some((n, pt)) = &pref {
        fact(
            &mut d,
            "Prefeito(a)",
            format!(
                "{n}{}",
                pt.as_ref().map(|p| format!(" ({p})")).unwrap_or_default()
            ),
        );
    }
    if let Some(vn) = s(v, "/prefeito/vice/nome") {
        let vp = s(v, "/prefeito/vice/partido")
            .map(|p| format!(" ({p})"))
            .unwrap_or_default();
        fact(
            &mut d,
            "Vice-prefeito(a)",
            format!("{}{vp}", title_case(&vn)),
        );
    }
    money_facts(&mut d, t);
    if let Some(x) = pix {
        fact(&mut d, "Emenda Pix (pago)", brl(x));
    }
    fact(&mut d, "Código IBGE", p.id.clone());
    d.sections
        .push(section("Quem enviou as emendas", autor_items(autores, 50)));
    let emendas: Vec<Item> = by_pago(arr(v, "/emendas"))
        .into_iter()
        .take(60)
        .map(|e| {
            let label = format!(
                "{} · {} · {}",
                s(e, "/ano").unwrap_or_default(),
                tipo_label(&s(e, "/tipo").unwrap_or_default()),
                s(e, "/funcao").unwrap_or_default()
            );
            let autor = s(e, "/autor/nome")
                .map(|n| title_case(&n))
                .unwrap_or_default();
            let note = Some(format!(
                "{} pagos; autor: {autor}; código {}",
                brl(i(e, "/pago").unwrap_or(0)),
                s(e, "/codigo").unwrap_or_default()
            ));
            match s(e, "/autor/codigo") {
                Some(c) => Item::link(label, format!("/autor/{c}"), note),
                None => Item::text(label, note),
            }
        })
        .collect();
    d.sections
        .push(section("Emendas (maiores pagamentos)", emendas));
    let fav: Vec<Item> = by_pago(arr(v, "/favorecidos"))
        .into_iter()
        .take(20)
        .filter_map(|f| {
            Some(Item::text(
                s(f, "/nome")?,
                Some(brl(i(f, "/valor").unwrap_or(0))),
            ))
        })
        .collect();
    d.sections.push(section("Quem recebeu (favorecidos)", fav));
    let conv: Vec<Item> = by_pago(arr(v, "/convenios"))
        .into_iter()
        .take(20)
        .filter_map(|c| {
            Some(Item::text(
                clip(&s(c, "/objeto")?, 140),
                Some(format!(
                    "{} · {}",
                    brl(i(c, "/valor").unwrap_or(0)),
                    s(c, "/data").unwrap_or_default()
                )),
            ))
        })
        .collect();
    if !conv.is_empty() {
        d.sections.push(section("Convênios", conv));
    }
    portal(&mut d);
    src(
        &mut d,
        "IBGE",
        &format!("https://cidades.ibge.gov.br/brasil/{}", uf.to_lowercase()),
    );
    let pref_ref = pref.as_ref().map(|(n, pt)| (n.as_str(), pt.as_deref()));
    d.entities
        .extend(jsonld::municipio(&p.id, &nome, &uf, pref_ref, ORIGIN));
    dataset(
        &mut d,
        &format!("Emendas parlamentares — {nome} ({uf})"),
        &format!("/v1/municipios/{}", p.id),
        &format!("v1/municipio/{}.json", p.id),
        meta,
        Some(format!("{nome}, {uf}")),
    );
    Some(d)
}

fn autor(p: &Page, v: &Value, meta: Option<&Value>) -> Option<Doc> {
    let nome = title_case(&s(v, "/nome")?);
    let t = &v["totais"];
    let pago = brl(i(t, "/pago").unwrap_or(0));
    let ufs: Vec<String> = by_pago(arr(v, "/porUf"))
        .iter()
        .take(3)
        .filter_map(|u| s(u, "/uf"))
        .collect();
    let desc = format!(
        "{nome} enviou {} emendas parlamentares com {pago} pagos{}. Veja municípios, favorecidos e cada emenda.",
        fmt_int(i(t, "/n").unwrap_or(0)),
        if ufs.is_empty() { String::new() } else { format!(", principalmente para {}", ufs.join(", ")) }
    );
    let mut d = doc(
        p,
        &format!("{nome}: {pago} em emendas parlamentares e para onde foi o dinheiro"),
        &format!("Emendas de {nome}"),
        &desc,
    );
    crumb(&mut d, "Emendas", "/emendas");
    here(&mut d, &nome);
    money_facts(&mut d, t);
    fact(&mut d, "Código do autor", p.id.clone());
    d.sections
        .push(section("Por estado", uf_items(arr(v, "/porUf"))));
    let emendas: Vec<Item> = by_pago(arr(v, "/emendas"))
        .into_iter()
        .take(80)
        .map(|e| {
            let label = format!(
                "{} · {} · {}",
                s(e, "/ano").unwrap_or_default(),
                s(e, "/localidade").unwrap_or_default(),
                s(e, "/funcao").unwrap_or_default()
            );
            let note = Some(format!(
                "{} pagos; {}",
                brl(i(e, "/pago").unwrap_or(0)),
                tipo_label(&s(e, "/tipo").unwrap_or_default())
            ));
            match s(e, "/ibge") {
                Some(ib) => Item::link(label, format!("/municipio/{ib}"), note),
                None => Item::text(label, note),
            }
        })
        .collect();
    d.sections
        .push(section("Emendas (maiores pagamentos)", emendas));
    let fav: Vec<Item> = by_pago(arr(v, "/favorecidos"))
        .into_iter()
        .take(20)
        .filter_map(|f| {
            Some(Item::text(
                s(f, "/nome")?,
                Some(brl(i(f, "/valor").unwrap_or(0))),
            ))
        })
        .collect();
    d.sections.push(section("Maiores favorecidos", fav));
    portal(&mut d);
    dataset(
        &mut d,
        &format!("Emendas parlamentares de {nome}"),
        &format!("/v1/autores/{}", p.id),
        &format!("v1/autor/{}.json", p.id),
        meta,
        None,
    );
    Some(d)
}

fn find_autor<'a>(autores: Option<&'a Value>, nome: &str) -> Option<&'a Value> {
    let key = chave_nome(nome);
    autores?
        .as_array()?
        .iter()
        .find(|a| a.get("chave").and_then(Value::as_str) == Some(key.as_str()))
}

struct Parl<'a> {
    casa: &'a str,
    job: &'a str,
    nome: String,
    partido: Option<String>,
    uf: Option<String>,
    foto: Option<String>,
    oficial: String,
    api: String,
}

fn parlamentar_doc(p: &Page, x: Parl, gastos: Option<&Value>, autores: Option<&Value>) -> Doc {
    let pu = match (&x.partido, &x.uf) {
        (Some(a), Some(b)) => format!(" ({a}-{b})"),
        (Some(a), None) | (None, Some(a)) => format!(" ({a})"),
        _ => String::new(),
    };
    let senado = x.casa.starts_with("Senado");
    let nome = &x.nome;
    let mandato = gastos
        .and_then(|g| i(g, "/mandato/total"))
        .filter(|v| *v > 0);
    let cota = mandato.or_else(|| gastos.and_then(|g| i(g, "/total")).filter(|v| *v > 0));
    let periodo = if mandato.is_some() {
        "no mandato"
    } else {
        "desde 2019"
    };
    let emendas = find_autor(autores, nome);
    let mut desc = format!(
        "{}{} {nome}{pu}:",
        if senado {
            "Senador(a)"
        } else {
            "Deputado(a) federal"
        },
        ""
    );
    let mut parts = vec![];
    if let Some(c) = cota {
        parts.push(format!("{} gastos da cota parlamentar {periodo}", brl(c)));
    }
    if let Some(a) = emendas {
        parts.push(format!(
            "{} pagos em {} emendas",
            brl(i(a, "/pago").unwrap_or(0)),
            fmt_int(i(a, "/n").unwrap_or(0))
        ));
    }
    if parts.is_empty() {
        parts.push("votos, proposições, emendas e gastos".into());
    }
    desc.push_str(&format!(
        " {}. Veja como votou nas pautas polêmicas.",
        parts.join(", ")
    ));
    let title = if senado {
        format!("Senador(a) {nome}{pu}: emendas, votos e gastos")
    } else {
        format!("{nome}{pu}: como votou, emendas e gastos da cota parlamentar")
    };
    let mut d = doc(p, &title, &format!("{nome}{pu}"), &desc);
    if senado {
        crumb(&mut d, "Senadores", "/senadores");
    } else {
        crumb(&mut d, "Deputados", "/deputados");
    }
    here(&mut d, nome);
    fact(&mut d, "Cargo", x.job);
    if let Some(pt) = &x.partido {
        fact(&mut d, "Partido", pt.clone());
    }
    if let Some(u) = &x.uf {
        fact(&mut d, "UF", u.clone());
    }
    if let Some(c) = cota {
        fact(&mut d, &format!("Cota parlamentar ({periodo})"), brl(c));
    }
    if let Some(m) = gastos
        .and_then(|g| i(g, "/mandato/mediaMensal"))
        .filter(|m| *m > 0)
    {
        fact(&mut d, "Média mensal da cota", brl(m));
    }
    if let Some(a) = emendas {
        fact(&mut d, "Emendas pagas", brl(i(a, "/pago").unwrap_or(0)));
        fact(
            &mut d,
            "Número de emendas",
            fmt_int(i(a, "/n").unwrap_or(0)),
        );
        if let Some(c) = s(a, "/codigo") {
            d.sections.push(section(
                "Emendas parlamentares",
                vec![Item::link(
                    format!("Todas as emendas de {nome}"),
                    format!("/autor/{c}"),
                    None,
                )],
            ));
        }
    }
    if let Some(g) = gastos {
        let cats: Vec<Item> = by_pago(arr(g, "/porCategoria"))
            .into_iter()
            .take(15)
            .filter_map(|c| {
                Some(Item::text(
                    sentence_case(&s(c, "/categoria")?),
                    Some(brl(i(c, "/valor").unwrap_or(0))),
                ))
            })
            .collect();
        if !cats.is_empty() {
            d.sections
                .push(section("Gastos da cota parlamentar por categoria", cats));
        }
        let forn: Vec<Item> = by_pago(arr(g, "/topFornecedores"))
            .into_iter()
            .take(10)
            .filter_map(|f| {
                Some(Item::text(
                    s(f, "/nome")?,
                    Some(format!(
                        "{} em {} notas",
                        brl(i(f, "/valor").unwrap_or(0)),
                        i(f, "/n").unwrap_or(0)
                    )),
                ))
            })
            .collect();
        if !forn.is_empty() {
            d.sections.push(section("Maiores fornecedores", forn));
        }
    }
    let casa_slug = if senado { "senado" } else { "camara" };
    d.sections.push(section(
        "Auditoria",
        vec![Item::link(
            "Auditar gastos nota a nota",
            format!("/auditar/{casa_slug}/{}", p.id),
            None,
        )],
    ));
    if !senado {
        d.sections
            .push(section("Pautas polêmicas: veja o voto", pauta_items()));
    }
    src(
        &mut d,
        if senado {
            "Senado Federal"
        } else {
            "Câmara dos Deputados"
        },
        &x.oficial,
    );
    src(&mut d, "Dados abertos (API)", &x.api);
    d.image = x.foto.clone();
    let url = super::abs(ORIGIN, &d.path);
    d.entities.push(jsonld::person(&PersonIn {
        name: nome,
        url: &url,
        image: x.foto.as_deref(),
        job_title: x.job,
        partido: x.partido.as_deref(),
        uf: x.uf.as_deref(),
        casa: x.casa,
        same_as: vec![x.oficial.clone()],
    }));
    d
}

fn deputado(p: &Page, v: &Value, gastos: Option<&Value>, autores: Option<&Value>) -> Option<Doc> {
    let st = "/dados/ultimoStatus";
    let nome = s(v, &format!("{st}/nomeEleitoral")).or_else(|| s(v, &format!("{st}/nome")))?;
    let x = Parl {
        casa: "Câmara dos Deputados",
        job: "Deputado(a) federal",
        nome,
        partido: s(v, &format!("{st}/siglaPartido")),
        uf: s(v, &format!("{st}/siglaUf")),
        foto: s(v, &format!("{st}/urlFoto")).map(|u| u.replacen("http://", "https://", 1)),
        oficial: format!("https://www.camara.leg.br/deputados/{}", p.id),
        api: format!("{CAMARA_API}deputados/{}", p.id),
    };
    let mut d = parlamentar_doc(p, x, gastos, autores);
    if let Some(sit) = s(v, &format!("{st}/situacao")) {
        fact(&mut d, "Situação", sit);
    }
    if let (Some(m), Some(u)) = (
        s(v, "/dados/municipioNascimento"),
        s(v, "/dados/ufNascimento"),
    ) {
        fact(&mut d, "Naturalidade", format!("{m} ({u})"));
    }
    if let Some(e) = s(v, "/dados/escolaridade") {
        fact(&mut d, "Escolaridade", e);
    }
    Some(d)
}

fn senador(p: &Page, v: &Value, gastos: Option<&Value>, autores: Option<&Value>) -> Option<Doc> {
    let b = "/DetalheParlamentar/Parlamentar/IdentificacaoParlamentar";
    let x = Parl {
        casa: "Senado Federal",
        job: "Senador(a)",
        nome: s(v, &format!("{b}/NomeParlamentar"))?,
        partido: s(v, &format!("{b}/SiglaPartidoParlamentar")),
        uf: s(v, &format!("{b}/UfParlamentar")),
        foto: s(v, &format!("{b}/UrlFotoParlamentar"))
            .map(|u| u.replacen("http://", "https://", 1)),
        oficial: format!(
            "https://www25.senado.leg.br/web/senadores/senador/-/perfil/{}",
            p.id
        ),
        api: format!("{SENADO_API}senador/{}", p.id),
    };
    let mut d = parlamentar_doc(p, x, gastos, autores);
    if let Some(n) = s(v, &format!("{b}/NomeCompletoParlamentar")) {
        fact(&mut d, "Nome completo", n);
    }
    Some(d)
}

fn proposicao(
    p: &Page,
    v: &Value,
    autores: Option<&Value>,
    votacoes: Option<&Value>,
) -> Option<Doc> {
    let x = &v["dados"];
    let rotulo = format!(
        "{} {}/{}",
        s(x, "/siglaTipo")?,
        s(x, "/numero")?,
        s(x, "/ano")?
    );
    let ementa = s(x, "/ementa").unwrap_or_default();
    let sit = s(x, "/statusProposicao/descricaoSituacao");
    let pauta = p.id.parse().ok().and_then(catalog::pauta);
    let apelido = pauta
        .map(|p| format!(" ({})", p.apelido))
        .unwrap_or_default();
    let title = format!("{rotulo}{apelido}: o que é, situação e como votou cada deputado");
    let desc = format!(
        "{}{}",
        clip(&ementa, 110),
        sit.as_ref()
            .map(|s| format!(" Situação: {s}."))
            .unwrap_or_default()
    );
    let mut d = doc(p, &title, &format!("{rotulo}{apelido}"), &desc);
    crumb(&mut d, "Proposições", "/proposicoes");
    here(&mut d, &rotulo);
    d.intro = Some(ementa.clone()).filter(|e| !e.is_empty());
    fact(&mut d, "Identificação", rotulo.clone());
    if let Some(dt) = s(x, "/dataApresentacao") {
        fact(&mut d, "Apresentada em", br_date(&dt));
    }
    if let Some(s) = &sit {
        fact(&mut d, "Situação", s.clone());
    }
    if let Some(t) = s(x, "/statusProposicao/descricaoTramitacao") {
        fact(&mut d, "Última tramitação", t);
    }
    if let Some(o) = s(x, "/statusProposicao/siglaOrgao") {
        fact(&mut d, "Órgão atual", o);
    }
    if let Some(pa) = pauta {
        d.sections.push(text_section("Resumo", pa.resumo));
    }
    let autores_v: Vec<String> = autores
        .map(|a| arr(a, "/dados"))
        .unwrap_or(&[])
        .iter()
        .filter_map(|a| s(a, "/nome"))
        .collect();
    if !autores_v.is_empty() {
        d.sections.push(section(
            "Autores",
            autores_v
                .iter()
                .take(30)
                .map(|n| Item::text(n.clone(), None))
                .collect(),
        ));
    }
    let vots: Vec<Item> = votacoes
        .map(|v| arr(v, "/dados"))
        .unwrap_or(&[])
        .iter()
        .take(40)
        .filter_map(|v| {
            let id = s(v, "/id")?;
            let label = format!(
                "{} · {}: {}",
                s(v, "/data").unwrap_or_default(),
                s(v, "/siglaOrgao").unwrap_or_default(),
                clip(&s(v, "/descricao").unwrap_or_default(), 140)
            );
            Some(Item::link(label, format!("/votacao/{id}"), None))
        })
        .collect();
    if !vots.is_empty() {
        d.sections
            .push(section("Votações (veja como votou cada deputado)", vots));
    }
    let oficial = format!("https://www.camara.leg.br/propostas-legislativas/{}", p.id);
    src(&mut d, "Câmara dos Deputados", &oficial);
    src(
        &mut d,
        "Dados abertos (API)",
        &format!("{CAMARA_API}proposicoes/{}", p.id),
    );
    let url = super::abs(ORIGIN, &d.path);
    let date = s(x, "/dataApresentacao");
    let text_url = s(x, "/urlInteiroTeor");
    d.entities.push(jsonld::legislation(&LegislationIn {
        url: &url,
        name: &format!("{rotulo}{apelido}"),
        identifier: &rotulo,
        ementa: Some(ementa.as_str()).filter(|e| !e.is_empty()),
        date: date.as_deref(),
        situacao: sit.as_deref(),
        source: &oficial,
        authors: autores_v.into_iter().take(10).collect(),
        text_url: text_url.as_deref(),
    }));
    Some(d)
}

fn votacao(p: &Page, v: &Value, votos: Option<&Value>) -> Option<Doc> {
    let x = &v["dados"];
    let descricao = s(x, "/descricao").unwrap_or_default();
    let data = s(x, "/data")
        .or_else(|| s(x, "/dataHoraRegistro"))
        .unwrap_or_default();
    let orgao = s(x, "/siglaOrgao").unwrap_or_default();
    let prop = arr(x, "/proposicoesAfetadas")
        .first()
        .or_else(|| x.get("proposicaoObjeto").filter(|p| p.is_object()));
    let prop_label = prop.and_then(|p| {
        Some(format!(
            "{} {}/{}",
            s(p, "/siglaTipo")?,
            s(p, "/numero")?,
            s(p, "/ano")?
        ))
    });
    let prop_id = prop.and_then(|p| s(p, "/id"));
    let label = prop_label.clone().unwrap_or_else(|| clip(&descricao, 60));
    let lista = votos.map(|v| arr(v, "/dados")).unwrap_or(&[]);
    let count = |t: &str| lista.iter().filter(|v| v["tipoVoto"] == t).count();
    let (sim, nao, abst) = (count("Sim"), count("Não"), count("Abstenção"));
    let title = if lista.is_empty() {
        format!("Votação {label} na Câmara ({}): resultado", br_date(&data))
    } else {
        format!(
            "Como votou cada deputado: {label}, {sim} a {nao} ({})",
            br_date(&data)
        )
    };
    let placar = if lista.is_empty() {
        String::new()
    } else {
        format!(" Placar: {sim} sim, {nao} não, {abst} abstenções.")
    };
    let desc = format!(
        "{}.{placar} Veja o voto de cada deputado por partido e UF.",
        clip(descricao.trim_end_matches('.'), 90)
    );
    let mut d = doc(p, &title, &format!("Votação: {label}"), &desc);
    crumb(&mut d, "Proposições", "/proposicoes");
    if let (Some(l), Some(id)) = (&prop_label, &prop_id) {
        crumb(&mut d, l, &format!("/proposicao/{id}"));
    }
    here(&mut d, &format!("Votação {}", br_date(&data)));
    d.intro = Some(descricao.clone()).filter(|x| !x.is_empty());
    fact(&mut d, "Data", br_date(&data));
    if !orgao.is_empty() {
        fact(&mut d, "Órgão", orgao.clone());
    }
    match i(x, "/aprovacao") {
        Some(1) => fact(&mut d, "Resultado", "Aprovada"),
        Some(0) => fact(&mut d, "Resultado", "Rejeitada"),
        _ => {}
    }
    if !lista.is_empty() {
        fact(&mut d, "Sim", sim.to_string());
        fact(&mut d, "Não", nao.to_string());
        fact(&mut d, "Abstenção", abst.to_string());
        fact(&mut d, "Total de votos", lista.len().to_string());
        // per party
        let mut partidos: Vec<(String, Vec<(String, usize)>)> = vec![];
        for v in lista {
            let pt = s(v, "/deputado_/siglaPartido").unwrap_or_else(|| "?".into());
            let tv = s(v, "/tipoVoto").unwrap_or_default();
            let e = match partidos.iter_mut().position(|(p, _)| *p == pt) {
                Some(n) => &mut partidos[n].1,
                None => {
                    partidos.push((pt, vec![]));
                    &mut partidos.last_mut().unwrap().1
                }
            };
            match e.iter_mut().find(|(t, _)| *t == tv) {
                Some(c) => c.1 += 1,
                None => e.push((tv, 1)),
            }
        }
        partidos.sort_by(|a, b| a.0.cmp(&b.0));
        let items = partidos
            .iter()
            .map(|(pt, c)| {
                let parts: Vec<String> = c.iter().map(|(t, n)| format!("{n} {t}")).collect();
                Item::text(format!("{pt}: {}", parts.join(", ")), None)
            })
            .collect();
        d.sections.push(section("Votos por partido", items));
        let mut tipos: Vec<String> = vec![];
        for v in lista {
            if let Some(t) = s(v, "/tipoVoto") {
                if !tipos.contains(&t) {
                    tipos.push(t);
                }
            }
        }
        tipos.sort_by_key(|t| match t.as_str() {
            "Sim" => 0,
            "Não" => 1,
            "Abstenção" => 2,
            _ => 3,
        });
        for t in tipos {
            let items: Vec<Item> = lista
                .iter()
                .filter(|v| v["tipoVoto"] == t.as_str())
                .filter_map(|v| {
                    let dep = &v["deputado_"];
                    let label = format!(
                        "{} ({}-{})",
                        s(dep, "/nome")?,
                        s(dep, "/siglaPartido").unwrap_or_default(),
                        s(dep, "/siglaUf").unwrap_or_default()
                    );
                    Some(match s(dep, "/id") {
                        Some(id) => Item::link(label, format!("/deputado/{id}"), None),
                        None => Item::text(label, None),
                    })
                })
                .collect();
            d.sections
                .push(section(&format!("Votaram {t} ({})", items.len()), items));
        }
    }
    src(
        &mut d,
        "Dados abertos da Câmara",
        &format!("{CAMARA_API}votacoes/{}", p.id),
    );
    Some(d)
}

fn dep_items(list: &[Value]) -> Vec<Item> {
    list.iter()
        .filter_map(|x| {
            let label = format!(
                "{} ({}-{})",
                s(x, "/nome")?,
                s(x, "/siglaPartido").unwrap_or_default(),
                s(x, "/siglaUf").unwrap_or_default()
            );
            Some(Item::link(
                label,
                format!("/deputado/{}", s(x, "/id")?),
                None,
            ))
        })
        .collect()
}

fn partido(p: &Page, v: &Value, deps: Option<&Value>) -> Option<Doc> {
    let x = arr(v, "/dados")
        .iter()
        .find(|x| s(x, "/sigla").is_some_and(|sg| sg.eq_ignore_ascii_case(&p.id)))?;
    let sigla = s(x, "/sigla")?;
    let nome = s(x, "/nome").unwrap_or_else(|| sigla.clone());
    let list = deps.map(|d| arr(d, "/dados")).unwrap_or(&[]);
    let desc = format!(
        "{nome} ({sigla}){}. Veja a lista de deputados, emendas e como a bancada votou nas pautas polêmicas.",
        if list.is_empty() { String::new() } else { format!(" tem {} deputados federais em exercício", list.len()) }
    );
    let mut d = doc(
        p,
        &format!("{sigla} ({nome}): deputados, bancada na Câmara e votos"),
        &format!("{nome} ({sigla})"),
        &desc,
    );
    crumb(&mut d, "Partidos", "/partidos");
    here(&mut d, &sigla);
    if !list.is_empty() {
        fact(&mut d, "Deputados em exercício", list.len().to_string());
        d.sections
            .push(section("Deputados federais", dep_items(list)));
    }
    src(
        &mut d,
        "Dados abertos da Câmara",
        &format!("{CAMARA_API}partidos?sigla={sigla}"),
    );
    let url = super::abs(ORIGIN, &d.path);
    d.entities.push(
        json!({ "@type": "PoliticalParty", "name": nome, "alternateName": sigla, "url": url }),
    );
    Some(d)
}

fn comissao(p: &Page, v: &Value) -> Option<Doc> {
    let x = &v["dados"];
    let sigla = s(x, "/sigla")?;
    let nome = s(x, "/nome").unwrap_or_else(|| sigla.clone());
    let desc =
        format!("{nome} ({sigla}) da Câmara dos Deputados: membros, pauta, reuniões e votações.");
    let mut d = doc(
        p,
        &format!("{sigla} – {nome}: membros, pauta e votações"),
        &format!("{nome} ({sigla})"),
        &desc,
    );
    crumb(&mut d, "Comissões", "/comissoes");
    here(&mut d, &sigla);
    if let Some(t) = s(x, "/tipoOrgao") {
        fact(&mut d, "Tipo", t);
    }
    if let Some(sl) = s(x, "/sala") {
        fact(&mut d, "Local", sl);
    }
    let site = s(x, "/urlWebsite").unwrap_or_else(|| "https://www.camara.leg.br".into());
    src(&mut d, "Câmara dos Deputados", &site);
    src(
        &mut d,
        "Dados abertos (API)",
        &format!("{CAMARA_API}orgaos/{}", p.id),
    );
    d.entities.push(json!({ "@type": "GovernmentOrganization", "name": nome, "alternateName": sigla, "url": site,
        "parentOrganization": { "@type": "GovernmentOrganization", "name": "Câmara dos Deputados" } }));
    Some(d)
}

fn bancada(p: &Page, v: &Value, membros: Option<&Value>) -> Option<Doc> {
    let titulo = s(v, "/dados/titulo")?;
    let list = membros.map(|m| arr(m, "/dados")).unwrap_or(&[]);
    let desc = format!(
        "{titulo}{}: lista de deputados membros, partidos e como votam.",
        if list.is_empty() {
            String::new()
        } else {
            format!(" reúne {} parlamentares", list.len())
        }
    );
    let mut d = doc(
        p,
        &format!("{titulo}: membros e como votam"),
        &titulo,
        &desc,
    );
    crumb(&mut d, "Bancadas", "/bancadas");
    here(&mut d, &titulo);
    if !list.is_empty() {
        fact(&mut d, "Membros", list.len().to_string());
        d.sections.push(section("Membros", dep_items(list)));
    }
    src(
        &mut d,
        "Câmara dos Deputados",
        &format!(
            "https://www.camara.leg.br/internet/deputado/frenteDetalhe.asp?id={}",
            p.id
        ),
    );
    src(
        &mut d,
        "Dados abertos (API)",
        &format!("{CAMARA_API}frentes/{}", p.id),
    );
    Some(d)
}

fn auditar(p: &Page, v: &Value) -> Option<Doc> {
    let nome = s(v, "/dados/ultimoStatus/nomeEleitoral").or_else(|| {
        s(
            v,
            "/DetalheParlamentar/Parlamentar/IdentificacaoParlamentar/NomeParlamentar",
        )
    })?;
    let (casa, id) = p.id.split_once('/')?;
    let perfil = if casa == "senado" {
        format!("/senador/{id}")
    } else {
        format!("/deputado/{id}")
    };
    let desc = format!("Auditoria dos gastos da cota parlamentar de {nome}: notas fiscais, fornecedores e alertas de regras, com links para os documentos oficiais.");
    let mut d = doc(
        p,
        &format!("Auditoria dos gastos de {nome}: cota parlamentar nota a nota"),
        &format!("Auditoria de gastos: {nome}"),
        &desc,
    );
    crumb(&mut d, &nome, &perfil);
    here(&mut d, "Auditoria");
    d.sections.push(section(
        "Perfil",
        vec![Item::link(nome.clone(), perfil, None)],
    ));
    src(
        &mut d,
        "Cota parlamentar (Câmara)",
        "https://www.camara.leg.br/cota-parlamentar/",
    );
    Some(d)
}

fn entenda_tema(p: &Page) -> Option<Doc> {
    let t = catalog::tema(&p.id)?;
    let kw = catalog::tema_keywords(t.slug);
    let title = if kw.is_empty() {
        format!("{}: o que é e como funciona", t.titulo)
    } else {
        format!("{} e {kw}: o que é e como funciona", t.titulo)
    };
    let mut d = doc(p, &title, t.titulo, t.resumo);
    crumb(&mut d, "Entenda", "/entenda");
    here(&mut d, t.titulo);
    d.intro = Some(t.resumo.into());
    d.sections.push(section(
        "Passo a passo",
        t.passos
            .iter()
            .map(|(a, b)| Item::text(*a, Some((*b).into())))
            .collect(),
    ));
    for x in t.detalhes {
        d.sections.push(text_section("Contexto", x));
    }
    d.sections.push(section(
        "Fontes oficiais",
        t.fontes
            .iter()
            .map(|(l, h)| Item::link(*l, *h, None))
            .collect(),
    ));
    for (l, h) in t.fontes {
        src(&mut d, l, h);
    }
    let lower = t.titulo.to_lowercase();
    let q1 = if lower.starts_with("como ") || lower.starts_with("o que ") {
        format!("{}?", t.titulo)
    } else {
        format!("O que é {lower}?")
    };
    let mut qas = vec![(q1, t.resumo.to_string())];
    let passos: Vec<String> = t.passos.iter().map(|(a, b)| format!("{a}: {b}")).collect();
    qas.push((
        format!("Como funciona na prática ({lower})?"),
        passos.join(" "),
    ));
    if !t.detalhes.is_empty() {
        qas.push((
            format!("Qual é o contexto e a controvérsia sobre {lower}?"),
            t.detalhes.join(" "),
        ));
    }
    let f: Vec<&str> = t.fontes.iter().map(|(l, _)| *l).collect();
    qas.push(("Quais são as fontes oficiais?".into(), f.join("; ")));
    d.entities.push(jsonld::faq(&qas));
    Some(d)
}

fn agenda(p: &Page, ev: Option<&Value>, now: &str) -> Doc {
    let dia = if p.id.is_empty() {
        now.get(..10).unwrap_or(now).to_string()
    } else {
        p.id.clone()
    };
    let quando = if p.id.is_empty() {
        format!("hoje ({})", br_date(&dia))
    } else {
        br_date(&dia)
    };
    let list = ev.map(|e| arr(e, "/dados")).unwrap_or(&[]);
    let desc = format!(
        "Agenda do Congresso {quando}: {} na Câmara — comissões, plenário, horários e o que será votado.",
        if list.is_empty() { "eventos".to_string() } else { format!("{} eventos", list.len()) }
    );
    let mut d = doc(
        p,
        &format!("Agenda do Congresso {quando}: o que a Câmara vota"),
        &format!("Agenda do Congresso — {}", br_date(&dia)),
        &desc,
    );
    here(&mut d, "Agenda");
    let url = super::abs(ORIGIN, &d.path);
    let mut items = vec![];
    for e in list {
        let inicio = s(e, "/dataHoraInicio").unwrap_or_default();
        let hora = inicio.get(11..16).unwrap_or("").to_string();
        let org = arr(e, "/orgaos").first();
        let sigla = org.and_then(|o| s(o, "/sigla")).unwrap_or_default();
        let tipo = s(e, "/descricaoTipo").unwrap_or_default();
        let descr = clip(&s(e, "/descricao").unwrap_or_default(), 120);
        let sit = s(e, "/situacao").unwrap_or_default();
        items.push(Item::text(
            format!("{hora} · {sigla} · {tipo}"),
            Some(format!("{descr} ({sit})")),
        ));
        if d.entities.len() < 30 && !inicio.is_empty() {
            let name = format!(
                "{tipo} — {}",
                org.and_then(|o| s(o, "/nome")).unwrap_or(sigla.clone())
            );
            let start = format!("{inicio}-03:00");
            let end = s(e, "/dataHoraFim").map(|f| format!("{f}-03:00"));
            let local = s(e, "/localCamara/nome")
                .or_else(|| s(e, "/localExterno"))
                .unwrap_or_else(|| "Câmara dos Deputados".into());
            d.entities.push(jsonld::event(&EventIn {
                name: &name,
                start: &start,
                end: end.as_deref(),
                location: &local,
                url: &url,
                cancelled: sit.to_lowercase().contains("cancelad"),
                description: Some(descr.as_str()).filter(|x| !x.is_empty()),
            }));
        }
    }
    fact(&mut d, "Data", br_date(&dia));
    fact(&mut d, "Eventos na Câmara", list.len().to_string());
    if !items.is_empty() {
        d.sections.push(section("Eventos", items));
    }
    src(
        &mut d,
        "Agenda da Câmara (dados abertos)",
        &format!("{CAMARA_API}eventos?dataInicio={dia}&dataFim={dia}"),
    );
    d
}

fn pix(p: &Page, v: &Value, meta: Option<&Value>) -> Doc {
    let t = &v["totais"];
    let pago = brl(i(t, "/pago").unwrap_or(0));
    let desc = format!(
        "Emenda Pix: {pago} pagos em {} transferências especiais, direto para prefeituras e estados. Veja quem enviou e quais municípios receberam.",
        fmt_int(i(t, "/n").unwrap_or(0))
    );
    let mut d = doc(
        p,
        &format!("Emenda Pix: {pago} em transferências especiais, quem enviou e para onde"),
        "Emenda Pix (transferências especiais)",
        &desc,
    );
    here(&mut d, "Emenda Pix");
    money_facts(&mut d, t);
    d.sections.push(section(
        "Municípios que mais receberam emenda Pix",
        municipio_items(arr(v, "/municipios"), 100, true),
    ));
    d.sections.push(section(
        "Quem mais enviou emenda Pix",
        autor_items(arr(v, "/autores"), 100),
    ));
    d.sections
        .push(section("Por estado", uf_items(arr(v, "/porUf"))));
    d.sections.push(section(
        "Entenda",
        vec![Item::link(
            "O que é a emenda Pix",
            "/entenda/emenda-pix",
            None,
        )],
    ));
    portal(&mut d);
    dataset(
        &mut d,
        "Emenda Pix (transferências especiais)",
        "/v1/pix",
        "v1/pix.json",
        meta,
        Some("Brasil".into()),
    );
    d
}

fn ultimas(p: &Page, v: &Value) -> Doc {
    let w = arr(v, "/janelas").first().cloned().unwrap_or(Value::Null);
    let mes = i(v, "/ultimoMes").map(mes_label).unwrap_or_default();
    let valor = brl(i(&w, "/valor").unwrap_or(0));
    let desc = format!(
        "Últimos pagamentos de emendas parlamentares ({mes}): {valor} em {} pagamentos. Veja autores, municípios e estados que mais receberam.",
        fmt_int(i(&w, "/pagamentos").unwrap_or(0))
    );
    let mut d = doc(
        p,
        &format!("Últimos pagamentos de emendas parlamentares ({mes}): {valor}"),
        &format!("Últimos pagamentos de emendas — {mes}"),
        &desc,
    );
    here(&mut d, "Últimos pagamentos");
    fact(&mut d, "Mês", mes);
    fact(&mut d, "Valor pago", valor);
    fact(
        &mut d,
        "Pagamentos",
        fmt_int(i(&w, "/pagamentos").unwrap_or(0)),
    );
    d.sections.push(section(
        "Quem mais teve emendas pagas",
        autor_items(arr(&w, "/autores"), 40),
    ));
    d.sections.push(section(
        "Municípios que mais receberam",
        municipio_items(arr(&w, "/municipios"), 40, true),
    ));
    d.sections
        .push(section("Estados", uf_items(arr(&w, "/ufs"))));
    portal(&mut d);
    d
}

fn emendas(p: &Page, b: &Value, meta: Option<&Value>) -> Doc {
    let t = &b["totais"];
    let (a0, a1) = anos(meta).unwrap_or((2014, 2026));
    let (n, pago) = (
        fmt_int(i(t, "/n").unwrap_or(0)),
        brl(i(t, "/pago").unwrap_or(0)),
    );
    let desc = format!("Explore {n} emendas parlamentares ({a0}–{a1}) com {pago} pagos: por autor, município, estado, ano, tipo e área.");
    let mut d = doc(
        p,
        &format!(
            "Emendas parlamentares {a0}–{a1}: {n} emendas e {pago} pagos, por autor e município"
        ),
        "Explorador de emendas parlamentares",
        &desc,
    );
    here(&mut d, "Emendas");
    money_facts(&mut d, t);
    d.sections.push(section(
        "Por tipo",
        breakdown(arr(b, "/porTipo"), "tipo", tipo_label),
    ));
    d.sections.push(section(
        "Por ano",
        arr(b, "/porAno")
            .iter()
            .filter_map(|x| {
                Some(Item::text(
                    s(x, "/ano")?,
                    Some(format!(
                        "{} pagos, {} emendas",
                        brl(i(x, "/pago").unwrap_or(0)),
                        fmt_int(i(x, "/n").unwrap_or(0))
                    )),
                ))
            })
            .collect(),
    ));
    d.sections
        .push(section("Por estado", uf_items(arr(b, "/porUf"))));
    portal(&mut d);
    dataset(
        &mut d,
        "Emendas parlamentares por ano, tipo e estado",
        "/v1/brasil",
        "v1/brasil.json",
        meta,
        Some("Brasil".into()),
    );
    d
}

/// Orçamento secreto (emendas de relator-geral, RP9).
fn beneficiado_items(v: &[Value], n: usize) -> Vec<Item> {
    v.iter()
        .take(n)
        .filter_map(|x| {
            let nome = s(x, "/nome")?;
            let onde = [s(x, "/municipio"), s(x, "/uf")]
                .into_iter()
                .flatten()
                .filter(|t| !t.is_empty())
                .collect::<Vec<_>>()
                .join(" - ");
            Some(Item::text(
                nome,
                Some(format!("{} · {onde}", brl(i(x, "/valor").unwrap_or(0)))),
            ))
        })
        .collect()
}

fn quem_recebe(p: &Page, v: &Value, meta: Option<&Value>) -> Doc {
    let t = &v["totais"];
    let privados = brl(i(t, "/empresas").unwrap_or(0) + i(t, "/entidades").unwrap_or(0));
    let topo = arr(v, "/empresas")
        .first()
        .and_then(|x| s(x, "/nome"))
        .map(|n| format!(" A que mais recebeu: {n}."))
        .unwrap_or_default();
    let desc = format!(
        "{privados} de emendas foram para empresas e entidades privadas.{topo} Veja também os fundos públicos que mais receberam."
    );
    let mut d = doc(
        p,
        &format!("Quem mais recebe dinheiro de emendas: {privados} para empresas e entidades"),
        "Quem mais recebe",
        &desc,
    );
    here(&mut d, "Quem mais recebe");
    fact(
        &mut d,
        "Empresas privadas",
        brl(i(t, "/empresas").unwrap_or(0)),
    );
    fact(
        &mut d,
        "Entidades sem fins lucrativos",
        brl(i(t, "/entidades").unwrap_or(0)),
    );
    fact(&mut d, "Fundos públicos", brl(i(t, "/fundos").unwrap_or(0)));
    for (titulo, k) in [
        ("Empresas privadas que mais receberam", "/empresas"),
        (
            "Entidades sem fins lucrativos que mais receberam",
            "/entidades",
        ),
        ("Fundos públicos que mais receberam", "/fundos"),
    ] {
        d.sections
            .push(section(titulo, beneficiado_items(arr(v, k), 100)));
    }
    portal(&mut d);
    dataset(
        &mut d,
        "Quem mais recebe dinheiro de emendas",
        "/data/v1/beneficiados.json",
        "v1/beneficiados.json",
        meta,
        Some("Brasil".into()),
    );
    d
}

fn orcamento_secreto(p: &Page, b: &Value, meta: Option<&Value>) -> Doc {
    let total: i64 = arr(b, "/porTipo")
        .iter()
        .filter(|x| s(x, "/tipo").as_deref() == Some("relator"))
        .filter_map(|x| i(x, "/pago"))
        .sum();
    let pago = brl(total);
    let desc = format!(
        "Orçamento secreto: {pago} foram distribuídos sem mostrar quem pediu. Veja para quais estados e áreas foi o dinheiro."
    );
    let mut d = doc(
        p,
        &format!("Orçamento secreto: {pago} sem mostrar quem pediu"),
        "Orçamento secreto",
        &desc,
    );
    here(&mut d, "Orçamento secreto");
    fact(&mut d, "Pago pelo orçamento secreto", pago);
    d.sections.push(text_section(
        "O que foi",
        "Entre 2020 e 2022, o relator do Orçamento distribuiu bilhões sem mostrar qual político pediu cada valor. Em dezembro de 2022, o STF decidiu que isso não podia continuar (ADPF 850, 851 e 854). Oficialmente: emendas de relator-geral (RP9).",
    ));
    d.sections.push(section(
        "Veja também",
        vec![
            Item::link(
                "Dinheiro mandado sem dizer para quê (emenda Pix)",
                "/pix",
                None,
            ),
            Item::link(
                "Entenda o orçamento secreto",
                "/entenda/emenda-de-relator",
                None,
            ),
        ],
    ));
    src(
        &mut d,
        "STF — ADPF 854",
        "https://portal.stf.jus.br/processos/detalhe.asp?incidente=6199750",
    );
    portal(&mut d);
    dataset(
        &mut d,
        "Orçamento secreto (emendas de relator-geral)",
        "/v1/brasil",
        "v1/brasil.json",
        meta,
        Some("Brasil".into()),
    );
    d
}

fn dinheiro(p: &Page, b: &Value, meta: Option<&Value>) -> Doc {
    let t = &b["totais"];
    let funcoes = by_pago(arr(b, "/porFuncao"));
    let top = funcoes
        .first()
        .and_then(|f| s(f, "/funcao"))
        .unwrap_or_default();
    let desc = format!(
        "Para onde vai o dinheiro das emendas: {} pagos, por estado, área (a maior é {top}) e tipo de emenda.",
        brl(i(t, "/pago").unwrap_or(0))
    );
    let mut d = doc(
        p,
        "Para onde vai o dinheiro das emendas: por estado, área e tipo",
        "Para onde vai o dinheiro das emendas",
        &desc,
    );
    here(&mut d, "Dinheiro");
    money_facts(&mut d, t);
    d.sections.push(section(
        "Por área (função)",
        breakdown(arr(b, "/porFuncao"), "funcao", same),
    ));
    d.sections
        .push(section("Por estado", uf_items(arr(b, "/porUf"))));
    d.sections.push(section(
        "Por tipo",
        breakdown(arr(b, "/porTipo"), "tipo", tipo_label),
    ));
    portal(&mut d);
    dataset(
        &mut d,
        "Fluxo do dinheiro das emendas parlamentares",
        "/v1/brasil",
        "v1/brasil.json",
        meta,
        Some("Brasil".into()),
    );
    d
}

fn deputados(p: &Page, v: &Value) -> Doc {
    let list = arr(v, "/dados");
    let mut d = generic(p, None);
    if !list.is_empty() {
        d.title = format!(
            "Deputados federais em exercício ({}): partido, UF, emendas e gastos{SUFFIX}",
            list.len()
        );
        fact(&mut d, "Deputados em exercício", list.len().to_string());
        d.sections.push(section("Deputados", dep_items(list)));
    }
    src(
        &mut d,
        "Dados abertos da Câmara",
        &format!("{CAMARA_API}deputados"),
    );
    d
}

fn senadores(p: &Page, v: &Value) -> Doc {
    let list = arr(v, "/ListaParlamentarEmExercicio/Parlamentares/Parlamentar");
    let mut d = generic(p, None);
    let items: Vec<Item> = list
        .iter()
        .filter_map(|x| {
            let b = &x["IdentificacaoParlamentar"];
            let label = format!(
                "{} ({}-{})",
                s(b, "/NomeParlamentar")?,
                s(b, "/SiglaPartidoParlamentar").unwrap_or_default(),
                s(b, "/UfParlamentar").unwrap_or_default()
            );
            Some(Item::link(
                label,
                format!("/senador/{}", s(b, "/CodigoParlamentar")?),
                None,
            ))
        })
        .collect();
    if !items.is_empty() {
        d.title = format!(
            "Senadores em exercício ({}): partido, UF, emendas e gastos{SUFFIX}",
            items.len()
        );
        fact(&mut d, "Senadores em exercício", items.len().to_string());
        d.sections.push(section("Senadores", items));
    }
    src(
        &mut d,
        "Dados abertos do Senado",
        &format!("{SENADO_API}senador/lista/atual"),
    );
    d
}

fn partidos(p: &Page, v: &Value) -> Doc {
    let mut d = generic(p, None);
    let items: Vec<Item> = arr(v, "/dados")
        .iter()
        .filter_map(|x| {
            let sg = s(x, "/sigla")?;
            Some(Item::link(
                format!("{sg} — {}", s(x, "/nome").unwrap_or_default()),
                format!("/partido/{sg}"),
                None,
            ))
        })
        .collect();
    if !items.is_empty() {
        d.sections.insert(0, section("Partidos", items));
    }
    src(
        &mut d,
        "Dados abertos da Câmara",
        &format!("{CAMARA_API}partidos"),
    );
    d
}

fn comissoes(p: &Page, v: &Value) -> Doc {
    let mut d = generic(p, None);
    let items: Vec<Item> = arr(v, "/dados")
        .iter()
        .filter_map(|x| {
            Some(Item::link(
                format!(
                    "{} — {}",
                    s(x, "/sigla")?,
                    s(x, "/nome").unwrap_or_default()
                ),
                format!("/comissao/{}", s(x, "/id")?),
                None,
            ))
        })
        .collect();
    if !items.is_empty() {
        d.sections.push(section("Comissões permanentes", items));
    }
    src(
        &mut d,
        "Dados abertos da Câmara",
        &format!("{CAMARA_API}orgaos"),
    );
    d
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::seo::{PageKind, ORIGIN};
    use serde_json::{json, Value};

    const NOW: &str = "2026-10-28T21:00:00Z";

    fn meta() -> Fetched {
        Fetched::Ok(
            json!({"generatedAt": "2026-10-28T20:31:24Z", "anos": [2014, 2026],
            "totais": {"n": 94755, "pago": 19455707030175i64}}),
        )
    }
    fn ok(v: Value) -> Fetched {
        Fetched::Ok(v)
    }
    fn page(k: PageKind, id: &str) -> Page {
        Page::new(k, id)
    }
    fn all_text(d: &Doc) -> String {
        crate::seo::markdown::render(d, ORIGIN)
    }

    fn iraquara() -> Value {
        json!({"ibge": "2914406", "nome": "Iraquara", "uf": "BA",
            "prefeito": {"nome": "NINO COUTINHO", "partido": "PSD", "eleicao": 2024, "vice": {"nome": "OZIEL O COMPANHEIRO", "partido": "PC do B"}},
            "totais": {"n": 15, "empenhado": 656043109, "liquidado": 260350000, "pago": 260350000, "rapPago": 388031248},
            "porTipo": [{"tipo": "individual", "n": 12, "pago": 190350000}, {"tipo": "pix", "n": 3, "pago": 70000000}],
            "autores": [{"codigo": "3795", "nome": "OTTO ALENCAR", "n": 6, "pago": 260000000}],
            "emendas": [{"codigo": "202237950005", "ano": 2022, "tipo": "pix", "autor": {"codigo": "3795", "nome": "OTTO ALENCAR"}, "funcao": "Encargos especiais", "pago": 70000000, "empenhado": 70000000}],
            "favorecidos": [{"documento": "13922596000129", "nome": "MUNICIPIO DE IRAQUARA", "valor": 2345212601i64}],
            "convenios": [{"numero": "950016", "objeto": "Pavimentacao", "valor": 287021000, "data": "2023-12-18"}]})
    }

    #[test]
    fn sources_by_kind() {
        use PageKind::*;
        let d = |s: &str| Source::Data(s.into());
        let m = d("v1/meta.json");
        assert_eq!(
            sources(&page(Municipio, "2914406"), "2026-10-28"),
            [m.clone(), d("v1/municipio/2914406.json")]
        );
        assert_eq!(
            sources(&page(Uf, "BA"), ""),
            [m.clone(), d("v1/uf/BA.json")]
        );
        assert_eq!(
            sources(&page(Home, ""), ""),
            [m.clone(), d("v1/brasil.json")]
        );
        assert_eq!(
            sources(&page(Deputado, "204554"), ""),
            [
                m.clone(),
                Source::Camara("deputados/204554".into()),
                d("v1/gastos/deputado/204554.json"),
                d("v1/autores.json")
            ]
        );
        assert_eq!(
            sources(&page(Votacao, "1-2"), ""),
            [
                m.clone(),
                Source::Camara("votacoes/1-2".into()),
                Source::Camara("votacoes/1-2/votos".into())
            ]
        );
        let ag = sources(&page(Agenda, ""), "2026-10-28");
        assert!(
            matches!(&ag[1], Source::Camara(p) if p.contains("dataInicio=2026-10-28&dataFim=2026-10-28"))
        );
        assert_eq!(
            sources(&page(EntendaTema, "emenda-pix"), ""),
            std::slice::from_ref(&m)
        );
    }

    #[test]
    fn municipio_doc() {
        let d = build(
            &page(PageKind::Municipio, "2914406"),
            &[meta(), ok(iraquara())],
            NOW,
        );
        assert_eq!(d.title, "Iraquara (BA): R$ 2,6 mi em emendas parlamentares, prefeito e quem enviou | emenda.online");
        assert_eq!(d.h1, "Emendas parlamentares em Iraquara (BA)");
        assert!(d.description.chars().count() <= 160, "{}", d.description);
        assert!(
            d.description.contains("R$ 2,6 mi") && d.description.contains("Nino Coutinho (PSD)"),
            "{}",
            d.description
        );
        assert!(d.description.contains("emenda Pix"), "{}", d.description);
        assert_eq!(d.path, "/municipio/2914406");
        assert_eq!(d.md_path, "/municipio/2914406.md");
        assert_eq!(
            d.breadcrumbs,
            [
                ("Início".into(), "/".into()),
                ("Bahia".into(), "/uf/BA".into()),
                ("Iraquara".into(), "/municipio/2914406".into())
            ]
        );
        assert_eq!(d.updated.as_deref(), Some("2026-10-28"));
        assert_eq!((d.status, d.complete), (200, true));
        let t = all_text(&d);
        assert!(
            t.contains("[Otto Alencar](https://emenda.online/autor/3795)"),
            "{t}"
        );
        assert!(t.contains("| Prefeito(a) | Nino Coutinho (PSD) |"), "{t}");
        let types: Vec<&str> = d
            .entities
            .iter()
            .filter_map(|e| e["@type"].as_str())
            .collect();
        assert_eq!(types, ["City", "GovernmentOrganization", "Dataset"]);
        assert!(d.entities[2]["distribution"]
            .to_string()
            .contains("/v1/municipios/2914406"));
    }

    #[test]
    fn not_found_and_failure_fall_back() {
        let d = build(
            &page(PageKind::Municipio, "9999999"),
            &[meta(), Fetched::NotFound],
            NOW,
        );
        assert_eq!(d.status, 404);
        assert!(d.title.ends_with("| emenda.online"));
        let d = build(
            &page(PageKind::Municipio, "2914406"),
            &[Fetched::Failed, Fetched::Failed],
            NOW,
        );
        assert_eq!((d.status, d.complete), (200, false));
        assert!(
            d.title.contains("2914406") || d.title.contains("Município"),
            "{}",
            d.title
        );
        assert!(!d.description.is_empty());
    }

    #[test]
    fn uf_doc() {
        let uf = json!({"uf": "BA", "nome": "Bahia", "totais": {"n": 6059, "pago": 906628544737i64, "empenhado": 1451581363179i64},
            "municipios": [{"ibge": "2929701", "nome": "Sátiro Dias", "n": 14, "pago": 2440087600i64}, {"ibge": "2914406", "nome": "Iraquara", "n": 15, "pago": 260350000}],
            "autores": [{"codigo": "7106", "nome": "BANCADA DA BAHIA", "n": 92, "pago": 92312877611i64}]});
        let d = build(&page(PageKind::Uf, "BA"), &[meta(), ok(uf)], NOW);
        assert_eq!(d.title, "Emendas parlamentares na Bahia (BA): R$ 9,1 bi pagos, municípios e autores | emenda.online");
        let t = all_text(&d);
        assert!(
            t.contains("[Sátiro Dias](https://emenda.online/municipio/2929701) — R$ 24,4 mi"),
            "{t}"
        );
        assert!(t.contains("/autor/7106"));
    }

    #[test]
    fn deputado_doc() {
        let dep = json!({"dados": {"id": 204554, "nomeCivil": "JOSE ABILIO", "ultimoStatus": {"nome": "Abílio Santana", "nomeEleitoral": "Abílio Santana",
            "siglaPartido": "PSC", "siglaUf": "BA", "urlFoto": "https://www.camara.leg.br/internet/deputado/bandep/204554.jpg", "situacao": "Exercício"},
            "dataNascimento": "1965-02-13", "municipioNascimento": "Salvador", "ufNascimento": "BA"}});
        let gastos = json!({"total": 14992790, "mandato": {"total": 14992790, "meses": 45, "mediaMensal": 333173},
            "porCategoria": [{"categoria": "DIVULGAÇÃO DA ATIVIDADE PARLAMENTAR.", "valor": 12363490, "n": 6}],
            "topFornecedores": [{"nome": "PRODUTORA X", "valor": 6750000, "n": 5}]});
        let autores = json!([{"codigo": "1234", "nome": "ABILIO SANTANA", "chave": "ABILIO SANTANA", "n": 10, "pago": 500000000}]);
        let d = build(
            &page(PageKind::Deputado, "204554"),
            &[meta(), ok(dep), ok(gastos), ok(autores)],
            NOW,
        );
        assert_eq!(d.title, "Abílio Santana (PSC-BA): como votou, emendas e gastos da cota parlamentar | emenda.online");
        assert!(
            d.description.contains("R$ 149,9 mil") && d.description.contains("R$ 5 mi"),
            "{}",
            d.description
        );
        assert!(d.description.chars().count() <= 160);
        assert_eq!(d.entities[0]["@type"], "Person");
        assert_eq!(d.entities[0]["memberOf"][1]["name"], "PSC");
        assert_eq!(
            d.image.as_deref(),
            Some("https://www.camara.leg.br/internet/deputado/bandep/204554.jpg")
        );
        let t = all_text(&d);
        assert!(
            t.contains("/autor/1234") && t.contains("Divulgação da atividade parlamentar"),
            "{t}"
        );
        assert!(t.contains("/proposicao/2256735"), "pautas polêmicas linked");
    }

    #[test]
    fn deputado_out_of_mandate_uses_total_cota() {
        let dep = json!({"dados": {"ultimoStatus": {"nomeEleitoral": "Fulano", "siglaPartido": "PSC", "siglaUf": "BA"}}});
        let gastos = json!({"total": 170177937, "mandato": {"total": 0, "mediaMensal": 0}});
        let d = build(
            &page(PageKind::Deputado, "1"),
            &[meta(), ok(dep), ok(gastos), Fetched::Failed],
            NOW,
        );
        assert!(
            d.description
                .contains("R$ 1,7 mi gastos da cota parlamentar"),
            "{}",
            d.description
        );
        assert!(!d.facts.iter().any(|(_, v)| v == "R$ 0"), "{:?}", d.facts);
    }

    #[test]
    fn senador_doc() {
        let p = "IdentificacaoParlamentar";
        let sen = json!({"DetalheParlamentar": {"Parlamentar": {p: {"CodigoParlamentar": "5672", "NomeParlamentar": "Alan Rick", "NomeCompletoParlamentar": "Alan Rick Miranda",
            "SiglaPartidoParlamentar": "REPUBLICANOS", "UfParlamentar": "AC", "UrlFotoParlamentar": "http://www.senado.leg.br/x.jpg"}}}});
        let d = build(
            &page(PageKind::Senador, "5672"),
            &[meta(), ok(sen), Fetched::NotFound, Fetched::Failed],
            NOW,
        );
        assert!(
            d.title
                .starts_with("Senador(a) Alan Rick (REPUBLICANOS-AC):"),
            "{}",
            d.title
        );
        assert_eq!(d.entities[0]["image"], "https://www.senado.leg.br/x.jpg");
        assert_eq!(d.status, 200);
    }

    #[test]
    fn proposicao_doc() {
        let prop = json!({"dados": {"id": 2256735, "siglaTipo": "PL", "numero": 2630, "ano": 2020,
            "ementa": "Institui a Lei Brasileira de Liberdade, Responsabilidade e Transparência na Internet.",
            "dataApresentacao": "2020-07-03T16:28", "statusProposicao": {"descricaoSituacao": "Pronta para Pauta", "dataHora": "2024-04-24T15:57"},
            "urlInteiroTeor": "https://camara.leg.br/x.pdf"}});
        let autores = json!({"dados": [{"nome": "Senado Federal - Alessandro Vieira", "tipo": "Órgão do Poder Legislativo"}]});
        let vots = json!({"dados": [{"id": "2256735-1", "data": "2023-04-25", "descricao": "Aprovado o requerimento de urgência", "aprovacao": 1, "siglaOrgao": "PLEN"}]});
        let d = build(
            &page(PageKind::Proposicao, "2256735"),
            &[meta(), ok(prop), ok(autores), ok(vots)],
            NOW,
        );
        assert_eq!(d.title, "PL 2630/2020 (PL das Fake News): o que é, situação e como votou cada deputado | emenda.online");
        assert!(d.description.starts_with("Institui a Lei Brasileira"));
        let l = &d.entities[0];
        assert_eq!(l["@type"], "Legislation");
        assert_eq!(l["legislationIdentifier"], "PL 2630/2020");
        assert_eq!(l["legislationDate"], "2020-07-03");
        assert!(l["isBasedOn"].as_str().unwrap().contains("2256735"));
        assert!(all_text(&d).contains("[2023-04-25 · PLEN: Aprovado o requerimento de urgência](https://emenda.online/votacao/2256735-1)"));
    }

    #[test]
    fn votacao_doc() {
        let v = json!({"dados": {"id": "2256735-1", "data": "2023-04-25", "descricao": "Aprovado o requerimento de urgência.", "aprovacao": 1, "siglaOrgao": "PLEN",
            "proposicoesAfetadas": [{"id": 2256735, "siglaTipo": "PL", "numero": 2630, "ano": 2020}]}});
        let votos = json!({"dados": [
            {"tipoVoto": "Sim", "deputado_": {"id": 1, "nome": "Ana", "siglaPartido": "PT", "siglaUf": "SP"}},
            {"tipoVoto": "Sim", "deputado_": {"id": 2, "nome": "Bia", "siglaPartido": "PL", "siglaUf": "RJ"}},
            {"tipoVoto": "Não", "deputado_": {"id": 3, "nome": "Caio", "siglaPartido": "PL", "siglaUf": "SP"}}]});
        let d = build(
            &page(PageKind::Votacao, "2256735-1"),
            &[meta(), ok(v), ok(votos)],
            NOW,
        );
        assert_eq!(
            d.title,
            "Como votou cada deputado: PL 2630/2020, 2 a 1 (25/04/2023) | emenda.online"
        );
        assert!(d.description.contains("2 sim, 1 não"), "{}", d.description);
        let t = all_text(&d);
        assert!(
            t.contains("## Votaram Sim (2)")
                && t.contains("[Ana (PT-SP)](https://emenda.online/deputado/1)"),
            "{t}"
        );
        assert!(t.contains("PL: 1 Sim, 1 Não"), "{t}");
        assert!(d
            .breadcrumbs
            .iter()
            .any(|(_, p)| p == "/proposicao/2256735"));
    }

    #[test]
    fn entenda_faq() {
        let d = build(
            &page(PageKind::EntendaTema, "emenda-de-relator"),
            &[meta()],
            NOW,
        );
        assert!(d.title.contains("orçamento secreto"), "{}", d.title);
        let faq = d
            .entities
            .iter()
            .find(|e| e["@type"] == "FAQPage")
            .expect("faq");
        assert!(faq["mainEntity"].as_array().unwrap().len() >= 2);
        assert_eq!(
            build(&page(PageKind::EntendaTema, "nope"), &[meta()], NOW).status,
            404
        );
    }

    #[test]
    fn agenda_events() {
        let ev = json!({"dados": [{"id": 1, "dataHoraInicio": "2026-10-28T09:30", "dataHoraFim": null, "situacao": "Convocada",
            "descricaoTipo": "Reunião Deliberativa", "descricao": "Pauta", "orgaos": [{"sigla": "CCJC", "nome": "Comissão de Constituição e Justiça"}],
            "localCamara": {"nome": "Plenário 1"}}]});
        let d = build(&page(PageKind::Agenda, ""), &[meta(), ok(ev)], NOW);
        assert_eq!(d.path, "/agenda");
        assert!(d.title.contains("28/10/2026"), "{}", d.title);
        let e = d
            .entities
            .iter()
            .find(|e| e["@type"] == "Event")
            .expect("event");
        assert_eq!(e["startDate"], "2026-10-28T09:30-03:00");
        assert!(all_text(&d).contains("09:30 · CCJC"));
    }

    #[test]
    fn home_and_static_pages_have_unique_titles() {
        use PageKind::*;
        let brasil = json!({"totais": {"n": 94755, "pago": 19455707030175i64, "empenhado": 34279109498583i64},
            "porAno": [{"ano": 2014, "n": 1, "pago": 1}, {"ano": 2026, "n": 1, "pago": 1}],
            "porUf": [{"uf": "SP", "nome": "São Paulo", "n": 11150, "pago": 1425969623818i64}],
            "porTipo": [{"tipo": "individual", "n": 1, "pago": 1}], "porFuncao": [{"funcao": "Saúde", "n": 1, "pago": 1}]});
        let home = build(&page(Home, ""), &[meta(), ok(brasil.clone())], NOW);
        assert!(
            home.description.contains("R$ 194,6 bi"),
            "{}",
            home.description
        );
        assert!(home.entities.iter().any(|e| e["@type"] == "Dataset"));
        let mut titles = vec![home.title.clone()];
        for k in [
            Pix,
            Ultimas,
            Emendas,
            Dinheiro,
            Entenda,
            Deputados,
            Senadores,
            Proposicoes,
            Partidos,
            Bancadas,
            Comissoes,
            Federacoes,
            Estaduais,
            Sobre,
            Api,
        ] {
            let d = build(&page(k, ""), &[meta(), Fetched::Failed], NOW);
            assert!(
                d.title.ends_with(" | emenda.online") && d.description.chars().count() <= 160,
                "{k:?}"
            );
            assert!(!d.h1.is_empty());
            titles.push(d.title);
        }
        let n = titles.len();
        titles.sort();
        titles.dedup();
        assert_eq!(titles.len(), n);
        let p = build(&page(Proposicoes, ""), &[meta()], NOW);
        assert!(all_text(&p).contains("/proposicao/2256735"));
    }
}
