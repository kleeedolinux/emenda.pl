//! HTML meta tags for page routes. Pure.
use crate::cards::Kind;
use crate::route::Target;

pub const START: &str = "<!-- og:start -->";
pub const END: &str = "<!-- og:end -->";
const SITE: &str = "emenda.pl";
const DEFAULT_DESC: &str =
    "Para onde vão as emendas parlamentares: quem enviou, quanto foi pago e onde.";

pub fn escape(s: &str) -> String {
    let mut o = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => o.push_str("&amp;"),
            '<' => o.push_str("&lt;"),
            '>' => o.push_str("&gt;"),
            '"' => o.push_str("&quot;"),
            '\'' => o.push_str("&#39;"),
            c => o.push(c),
        }
    }
    o
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PageMeta {
    pub title: String,
    pub description: String,
    pub url: String,
    pub image: String,
}

/// `name` overrides the generic label (e.g. resolved deputado name).
pub fn page_meta(t: &Target, origin: &str, path: &str, name: Option<&str>) -> PageMeta {
    let origin = origin.trim_end_matches('/');
    let (label, desc) = match t.kind {
        Kind::Default => (None, DEFAULT_DESC.to_string()),
        Kind::Deputado => (
            Some(format!("Deputado(a) {}", t.id)),
            "Emendas pagas, proposições e votos do(a) deputado(a).".into(),
        ),
        Kind::Senador => (
            Some(format!("Senador(a) {}", t.id)),
            "Emendas e atuação do(a) senador(a).".into(),
        ),
        Kind::Municipio => (
            Some(format!("Município {}", t.id)),
            "Emendas parlamentares recebidas pelo município.".into(),
        ),
        Kind::Uf => (
            Some(t.id.clone()),
            "Emendas parlamentares destinadas ao estado.".into(),
        ),
        Kind::Autor => (
            Some(format!("Autor {}", t.id)),
            "Emendas enviadas por este autor.".into(),
        ),
        Kind::Proposicao => (
            Some(format!("Proposição {}", t.id)),
            "Tramitação e situação da proposição.".into(),
        ),
        Kind::Votacao => (
            Some(format!("Votação {}", t.id)),
            "Placar e detalhes da votação.".into(),
        ),
        Kind::Partido => (Some(t.id.clone()), "Emendas e bancada do partido.".into()),
    };
    let title = match name.map(str::to_string).or(label) {
        Some(n) => format!("{n} · {SITE}"),
        None => format!("{SITE} · emendas parlamentares"),
    };
    PageMeta {
        title,
        description: desc,
        url: format!("{origin}{path}"),
        image: format!("{origin}{}", t.og_path()),
    }
}

pub fn render(m: &PageMeta) -> String {
    let (t, d, u, i) = (
        escape(&m.title),
        escape(&m.description),
        escape(&m.url),
        escape(&m.image),
    );
    format!(
        "{START}\n<title>{t}</title>\n<meta name=\"description\" content=\"{d}\">\n\
<meta property=\"og:type\" content=\"website\">\n<meta property=\"og:site_name\" content=\"{SITE}\">\n\
<meta property=\"og:title\" content=\"{t}\">\n<meta property=\"og:description\" content=\"{d}\">\n\
<meta property=\"og:url\" content=\"{u}\">\n<meta property=\"og:image\" content=\"{i}\">\n\
<meta property=\"og:image:width\" content=\"1200\">\n<meta property=\"og:image:height\" content=\"630\">\n\
<meta name=\"twitter:card\" content=\"summary_large_image\">\n<meta name=\"twitter:title\" content=\"{t}\">\n\
<meta name=\"twitter:description\" content=\"{d}\">\n<meta name=\"twitter:image\" content=\"{i}\">\n\
<meta name=\"twitter:creator\" content=\"@klee00z\">\n{END}"
    )
}

/// Replace the marker block (markers included) with `block`. None if markers are missing.
pub fn inject(html: &str, block: &str) -> Option<String> {
    // O marcador de início pode ter uma nota: "<!-- og:start (…) -->".
    let s = html.find("<!-- og:start")?;
    html[s..].find("-->")?;
    let e = html[s..].find(END)? + s + END.len();
    Some(format!("{}{block}{}", &html[..s], &html[e..]))
}
