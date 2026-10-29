//! SEO and AI-readable output for page routes. Pure; I/O lives in `glue_seo` (wasm).
//!
//! Data flow: `route` -> `pages::sources` (what to fetch) -> glue fetches -> `pages::build` -> `Doc`
//! -> `head::render` + `prerender::render` (HTML) or `markdown::render` (text/markdown).
pub mod catalog;
pub mod head;
pub mod jsonld;
pub mod markdown;
pub mod negotiate;
pub mod pages;
pub mod prerender;
pub mod sitemap;

#[cfg(target_arch = "wasm32")]
pub(crate) mod glue_seo;

pub const SITE: &str = "emenda.online";
pub const ORIGIN: &str = "https://emenda.online";
pub const LICENSE_TEXT: &str =
    "Dados públicos (Portal da Transparência, Câmara, Senado, IBGE); código GPL-3.0.";
pub const LICENSE_URL: &str = "https://www.gnu.org/licenses/gpl-3.0.html";
pub const GITHUB: &str = "https://github.com/kleeedolinux/emenda.pl";
pub const X_PROFILE: &str = "https://x.com/klee00z";
pub const PORTAL: &str = "https://portaldatransparencia.gov.br/emendas";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PageKind {
    Home,
    Uf,
    Municipio,
    Autor,
    Deputado,
    Senador,
    Proposicao,
    Votacao,
    Partido,
    Comissao,
    Bancada,
    Federacao,
    EntendaTema,
    Auditar,
    Agenda,
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
    OrcamentoSecreto,
    QuemRecebe,
    EmpresasContratadas,
    Api,
}

/// Static pages: path segment -> kind.
pub const STATIC_PAGES: [(&str, PageKind); 18] = [
    ("pix", PageKind::Pix),
    ("ultimas", PageKind::Ultimas),
    ("emendas", PageKind::Emendas),
    ("dinheiro", PageKind::Dinheiro),
    ("entenda", PageKind::Entenda),
    ("agenda", PageKind::Agenda),
    ("deputados", PageKind::Deputados),
    ("senadores", PageKind::Senadores),
    ("proposicoes", PageKind::Proposicoes),
    ("partidos", PageKind::Partidos),
    ("bancadas", PageKind::Bancadas),
    ("comissoes", PageKind::Comissoes),
    ("federacoes", PageKind::Federacoes),
    ("estaduais", PageKind::Estaduais),
    ("sobre", PageKind::Sobre),
    ("orcamento-secreto", PageKind::OrcamentoSecreto),
    ("quem-recebe", PageKind::QuemRecebe),
    ("empresas-contratadas", PageKind::EmpresasContratadas),
];

const ID_PAGES: [(&str, PageKind); 12] = [
    ("uf", PageKind::Uf),
    ("municipio", PageKind::Municipio),
    ("autor", PageKind::Autor),
    ("deputado", PageKind::Deputado),
    ("senador", PageKind::Senador),
    ("proposicao", PageKind::Proposicao),
    ("votacao", PageKind::Votacao),
    ("partido", PageKind::Partido),
    ("comissao", PageKind::Comissao),
    ("bancada", PageKind::Bancada),
    ("federacao", PageKind::Federacao),
    ("entenda", PageKind::EntendaTema),
];

/// A page route. `id` is normalized (UF/partido uppercase; auditar `casa/id`; agenda `YYYY-MM-DD` or empty).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Page {
    pub kind: PageKind,
    pub id: String,
}

impl Page {
    pub fn new(kind: PageKind, id: &str) -> Self {
        Page {
            kind,
            id: id.into(),
        }
    }

    /// Canonical path (no trailing slash, no tracking params, no `.md`).
    pub fn path(&self) -> String {
        match self.kind {
            PageKind::Home => "/".into(),
            PageKind::Agenda if !self.id.is_empty() => format!("/agenda?dia={}", self.id),
            PageKind::Auditar => format!("/auditar/{}", self.id),
            PageKind::Api => "/api".into(),
            k => match STATIC_PAGES.iter().find(|(_, x)| *x == k) {
                Some((slug, _)) => format!("/{slug}"),
                None => {
                    let slug = ID_PAGES
                        .iter()
                        .find(|(_, x)| *x == k)
                        .map_or("", |(s, _)| *s);
                    format!("/{slug}/{}", self.id)
                }
            },
        }
    }

    /// Markdown twin of the canonical path.
    pub fn md_path(&self) -> String {
        match self.kind {
            PageKind::Home => "/index.md".into(),
            PageKind::Agenda if !self.id.is_empty() => format!("/agenda.md?dia={}", self.id),
            _ => format!("{}.md", self.path()),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SeoRoute {
    /// `md`: the path ended in `.md`.
    Page {
        page: Page,
        md: bool,
    },
    LlmsTxt,
    LlmsFull,
    SitemapIndex,
    Sitemap(sitemap::Child),
}

/// GET/HEAD routes this module answers; None -> the regular worker router.
pub fn route(method: &str, path: &str, query: Option<&str>) -> Option<SeoRoute> {
    if method != "GET" && method != "HEAD" {
        return None;
    }
    match path {
        "/llms.txt" => return Some(SeoRoute::LlmsTxt),
        "/llms-full.txt" => return Some(SeoRoute::LlmsFull),
        "/sitemap.xml" => return Some(SeoRoute::SitemapIndex),
        "/index.md" | "/.md" => {
            return Some(SeoRoute::Page {
                page: Page::new(PageKind::Home, ""),
                md: true,
            })
        }
        _ => {}
    }
    if let Some(name) = path.strip_prefix("/sitemaps/") {
        return sitemap::Child::from_file(name).map(SeoRoute::Sitemap);
    }
    let (path, md) = match path.strip_suffix(".md") {
        Some(p) => (p, true),
        None => (path, false),
    };
    let trimmed = path.trim_end_matches('/');
    let segs: Vec<&str> = if trimmed.is_empty() {
        vec![]
    } else {
        trimmed.trim_start_matches('/').split('/').collect()
    };
    let page = match segs.as_slice() {
        [] => Page::new(PageKind::Home, ""),
        ["agenda"] => {
            let dia = query_param(query, "dia").filter(|d| crate::cards::valid_day(d));
            Page::new(PageKind::Agenda, dia.unwrap_or(""))
        }
        ["api"] => Page::new(PageKind::Api, ""),
        ["auditar"] => return None,
        ["auditar", casa @ ("camara" | "senado"), id] if is_digits(id, 12) => {
            Page::new(PageKind::Auditar, &format!("{casa}/{id}"))
        }
        [slug] => {
            let (_, kind) = STATIC_PAGES.iter().find(|(s, _)| s == slug)?;
            Page::new(*kind, "")
        }
        [slug, id] => {
            let (_, kind) = ID_PAGES.iter().find(|(s, _)| s == slug)?;
            Page::new(*kind, &valid_id(*kind, id)?)
        }
        _ => return None,
    };
    Some(SeoRoute::Page { page, md })
}

fn is_digits(s: &str, max: usize) -> bool {
    !s.is_empty() && s.len() <= max && s.bytes().all(|b| b.is_ascii_digit())
}

fn valid_id(kind: PageKind, id: &str) -> Option<String> {
    let alnum = |max: usize| {
        !id.is_empty() && id.len() <= max && id.bytes().all(|b| b.is_ascii_alphanumeric())
    };
    let ok = match kind {
        PageKind::Uf => id.len() == 2 && id.bytes().all(|b| b.is_ascii_alphabetic()),
        PageKind::Municipio => id.len() == 7 && is_digits(id, 7),
        PageKind::Autor | PageKind::Partido => alnum(20),
        PageKind::Votacao => {
            !id.is_empty() && id.len() <= 24 && id.bytes().all(|b| b.is_ascii_digit() || b == b'-')
        }
        PageKind::EntendaTema => {
            !id.is_empty()
                && id.len() <= 64
                && id
                    .bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        }
        _ => is_digits(id, 12),
    };
    if !ok {
        return None;
    }
    Some(match kind {
        PageKind::Uf | PageKind::Partido => id.to_ascii_uppercase(),
        _ => id.into(),
    })
}

pub fn query_param<'a>(query: Option<&'a str>, key: &str) -> Option<&'a str> {
    query?
        .split('&')
        .filter_map(|p| p.split_once('='))
        .find(|(k, _)| *k == key)
        .map(|(_, v)| v)
}

/// Something the glue fetches (JSON). Paths are relative to each upstream.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Source {
    /// ETL data file, e.g. `v1/municipio/1.json`.
    Data(String),
    /// Câmara API v2 path (+query).
    Camara(String),
    /// Senado dadosabertos path.
    Senado(String),
    /// Static asset path, e.g. `/geo/municipios.json`.
    Asset(String),
}

#[derive(Debug, Clone, PartialEq)]
pub enum Fetched {
    Ok(serde_json::Value),
    /// Definitive 404 (or 400 for unknown ids).
    NotFound,
    /// Timeout, 5xx, parse error.
    Failed,
}

impl Fetched {
    pub fn ok(&self) -> Option<&serde_json::Value> {
        match self {
            Fetched::Ok(v) => Some(v),
            _ => None,
        }
    }
}

/// Local Brasília time (UTC-3, no DST since 2019) as ISO 8601 with offset, minute precision.
pub fn iso_brasilia(now_ms: f64) -> String {
    let local = now_ms - 3.0 * 3_600_000.0;
    let mins = ((local / 60_000.0).floor() as i64).rem_euclid(1440);
    format!(
        "{}T{:02}:{:02}-03:00",
        crate::analytics::day_string(local),
        mins / 60,
        mins % 60
    )
}

/// Edge TTL per page kind: ETL data pages change daily; live Câmara/Senado pages more often.
pub fn ttl(kind: PageKind) -> u32 {
    use PageKind::*;
    match kind {
        Agenda => 300,
        Votacao | Proposicao | Ultimas => 600,
        Deputado | Senador | Partido | Comissao | Bancada | Auditar | Deputados | Senadores
        | Partidos | Comissoes => 3600,
        _ => 6 * 3600,
    }
}

/// Browser max-age stays short (HTML references hashed assets that change on deploy).
pub fn cache_control(kind: PageKind, fmt: negotiate::Format, complete: bool) -> String {
    if !complete {
        return "public, max-age=60".into();
    }
    let browser = match fmt {
        negotiate::Format::Html => 300,
        negotiate::Format::Markdown => 3600.min(ttl(kind)),
    };
    format!(
        "public, max-age={browser}, s-maxage={}, stale-while-revalidate=86400",
        ttl(kind)
    )
}

/// Edge cache key: canonical URL + format + version (index.html hash), so HTML/Markdown
/// variants and deploys never collide.
pub fn cache_key(origin: &str, p: &Page, fmt: negotiate::Format, version: &str) -> String {
    let path = p.path();
    let sep = if path.contains('?') { '&' } else { '?' };
    let f = match fmt {
        negotiate::Format::Html => "html",
        negotiate::Format::Markdown => "md",
    };
    format!(
        "{}{path}{sep}__seo={f}&__v={version}",
        origin.trim_end_matches('/')
    )
}

/// Response headers for a page (besides Cache-Control and security headers).
pub fn headers(
    p: &Page,
    fmt: negotiate::Format,
    status: u16,
    preload: Option<&str>,
) -> Vec<(&'static str, String)> {
    let mut h = vec![("Vary", "User-Agent, Accept".to_string())];
    match fmt {
        negotiate::Format::Html => {
            h.push(("Content-Type", "text/html; charset=utf-8".into()));
            let mut link = format!(
                "<{}>; rel=\"alternate\"; type=\"text/markdown\"",
                abs(ORIGIN, &p.md_path())
            );
            if let Some(pl) = preload {
                link.push_str(", ");
                link.push_str(pl);
            }
            h.push(("Link", link));
        }
        negotiate::Format::Markdown => {
            h.push(("Content-Type", markdown::CONTENT_TYPE.into()));
            h.push((
                "Link",
                format!("<{}>; rel=\"canonical\"", abs(ORIGIN, &p.path())),
            ));
        }
    }
    if status != 200 {
        h.push(("X-Robots-Tag", "noindex".into()));
    }
    h
}

/// Rendered page content shared by meta, JSON-LD, prerender and Markdown.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Doc {
    /// Canonical path.
    pub path: String,
    /// Markdown twin path.
    pub md_path: String,
    pub title: String,
    pub h1: String,
    /// <= 160 chars.
    pub description: String,
    pub intro: Option<String>,
    pub facts: Vec<(String, String)>,
    pub sections: Vec<Section>,
    /// (name, path); first is home.
    pub breadcrumbs: Vec<(String, String)>,
    /// (label, absolute url).
    pub sources: Vec<(String, String)>,
    /// e.g. "2026-10-28" (data) or ISO timestamp (live).
    pub updated: Option<String>,
    /// Main schema.org entities (besides WebPage/Breadcrumb/Org/WebSite).
    pub entities: Vec<serde_json::Value>,
    pub image: Option<String>,
    /// 200 or 404.
    pub status: u16,
    /// false -> some source failed; generic fallback content, short cache.
    pub complete: bool,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct Section {
    pub heading: String,
    pub text: Option<String>,
    pub items: Vec<Item>,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct Item {
    pub label: String,
    /// Site path ("/municipio/1") or absolute URL.
    pub href: Option<String>,
    pub note: Option<String>,
}

impl Item {
    pub fn link(label: impl Into<String>, href: impl Into<String>, note: Option<String>) -> Self {
        Item {
            label: label.into(),
            href: Some(href.into()),
            note,
        }
    }
    pub fn text(label: impl Into<String>, note: Option<String>) -> Self {
        Item {
            label: label.into(),
            href: None,
            note,
        }
    }
}

/// Absolute URL for a site path; absolute URLs pass through.
pub fn abs(origin: &str, href: &str) -> String {
    if href.starts_with("http://") || href.starts_with("https://") {
        href.into()
    } else {
        format!("{}{href}", origin.trim_end_matches('/'))
    }
}

/// 94755 -> "94.755".
pub fn fmt_int(n: i64) -> String {
    let s = n.unsigned_abs().to_string();
    let mut o = String::new();
    for (i, c) in s.chars().enumerate() {
        if i > 0 && (s.len() - i).is_multiple_of(3) {
            o.push('.');
        }
        o.push(c);
    }
    if n < 0 {
        format!("-{o}")
    } else {
        o
    }
}

/// Truncate to `max` chars at a word boundary, with "…".
pub fn clip(s: &str, max: usize) -> String {
    let s = s.trim();
    if s.chars().count() <= max {
        return s.into();
    }
    let cut: String = s.chars().take(max - 1).collect();
    let cut = match cut.rfind(' ') {
        Some(i) if i > max / 2 => &cut[..i],
        _ => cut.as_str(),
    };
    format!(
        "{}…",
        cut.trim_end_matches([' ', ',', ';', ':', '.', '—', '-'])
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn page(path: &str, q: Option<&str>) -> Option<(PageKind, String, bool)> {
        match route("GET", path, q)? {
            SeoRoute::Page { page, md } => Some((page.kind, page.id, md)),
            _ => None,
        }
    }

    #[test]
    fn routes_pages_and_md_twins() {
        use PageKind::*;
        type Case<'a> = (&'a str, Option<&'a str>, Option<(PageKind, &'a str, bool)>);
        let cases: &[Case] = &[
            ("/", None, Some((Home, "", false))),
            ("/index.md", None, Some((Home, "", true))),
            (
                "/municipio/2914406",
                None,
                Some((Municipio, "2914406", false)),
            ),
            (
                "/municipio/2914406.md",
                None,
                Some((Municipio, "2914406", true)),
            ),
            (
                "/municipio/2914406/",
                None,
                Some((Municipio, "2914406", false)),
            ),
            ("/municipio/29144", None, None),
            ("/uf/ba", None, Some((Uf, "BA", false))),
            ("/partido/pl.md", None, Some((Partido, "PL", true))),
            ("/deputado/204554", None, Some((Deputado, "204554", false))),
            ("/deputado/abc", None, None),
            ("/senador/5672", None, Some((Senador, "5672", false))),
            (
                "/votacao/2620905-56",
                None,
                Some((Votacao, "2620905-56", false)),
            ),
            (
                "/entenda/emenda-pix",
                None,
                Some((EntendaTema, "emenda-pix", false)),
            ),
            ("/entenda", None, Some((Entenda, "", false))),
            (
                "/agenda",
                Some("dia=2026-10-28"),
                Some((Agenda, "2026-10-28", false)),
            ),
            ("/agenda", Some("dia=x"), Some((Agenda, "", false))),
            (
                "/auditar/camara/204554",
                None,
                Some((Auditar, "camara/204554", false)),
            ),
            ("/auditar/x/1", None, None),
            ("/pix.md", None, Some((Pix, "", true))),
            ("/deputados", None, Some((Deputados, "", false))),
            ("/assets/x.js", None, None),
            ("/data/v1/meta.json", None, None),
            ("/v1/meta", None, None),
            ("/og/default.png", None, None),
            ("/favicon.svg", None, None),
            ("/api/health", None, None),
        ];
        for (path, q, want) in cases {
            let want = want.map(|(k, id, md)| (k, id.to_string(), md));
            assert_eq!(page(path, *q), want, "{path}");
        }
    }

    #[test]
    fn routes_text_files_and_methods() {
        assert_eq!(route("GET", "/llms.txt", None), Some(SeoRoute::LlmsTxt));
        assert_eq!(
            route("HEAD", "/llms-full.txt", None),
            Some(SeoRoute::LlmsFull)
        );
        assert_eq!(
            route("GET", "/sitemap.xml", None),
            Some(SeoRoute::SitemapIndex)
        );
        assert_eq!(
            route("GET", "/sitemaps/municipios.xml", None),
            Some(SeoRoute::Sitemap(sitemap::Child::Municipios))
        );
        assert_eq!(route("GET", "/sitemaps/x.xml", None), None);
        assert_eq!(route("POST", "/", None), None);
    }

    #[test]
    fn canonical_paths_drop_tracking_and_md() {
        let cases = [
            (Page::new(PageKind::Home, ""), "/", "/index.md"),
            (Page::new(PageKind::Uf, "BA"), "/uf/BA", "/uf/BA.md"),
            (Page::new(PageKind::Pix, ""), "/pix", "/pix.md"),
            (
                Page::new(PageKind::Agenda, "2026-10-28"),
                "/agenda?dia=2026-10-28",
                "/agenda.md?dia=2026-10-28",
            ),
            (
                Page::new(PageKind::Auditar, "camara/1"),
                "/auditar/camara/1",
                "/auditar/camara/1.md",
            ),
            (
                Page::new(PageKind::EntendaTema, "emenda-pix"),
                "/entenda/emenda-pix",
                "/entenda/emenda-pix.md",
            ),
        ];
        for (p, path, md) in cases {
            assert_eq!(p.path(), path);
            assert_eq!(p.md_path(), md);
        }
        // tracking params never reach the canonical
        let Some(SeoRoute::Page { page, .. }) =
            route("GET", "/municipio/2914406", Some("utm_source=x&fbclid=y"))
        else {
            panic!()
        };
        assert_eq!(page.path(), "/municipio/2914406");
    }

    #[test]
    fn cache_policy() {
        use negotiate::Format;
        assert_eq!(ttl(PageKind::Municipio), 6 * 3600);
        assert_eq!(ttl(PageKind::Votacao), 600);
        assert_eq!(ttl(PageKind::Agenda), 300);
        assert_eq!(
            cache_control(PageKind::Municipio, Format::Html, true),
            "public, max-age=300, s-maxage=21600, stale-while-revalidate=86400"
        );
        assert_eq!(
            cache_control(PageKind::Municipio, Format::Html, false),
            "public, max-age=60"
        );
        let p = Page::new(PageKind::Uf, "BA");
        assert_eq!(
            cache_key("https://emenda.online", &p, Format::Markdown, "abc"),
            "https://emenda.online/uf/BA?__seo=md&__v=abc"
        );
        let a = Page::new(PageKind::Agenda, "2026-10-28");
        assert_eq!(
            cache_key("http://localhost:8787", &a, Format::Html, "v"),
            "http://localhost:8787/agenda?dia=2026-10-28&__seo=html&__v=v"
        );
    }

    #[test]
    fn response_headers() {
        use negotiate::Format;
        let p = Page::new(PageKind::Uf, "BA");
        let h = headers(
            &p,
            Format::Html,
            200,
            Some("</a.css>; rel=preload; as=style"),
        );
        let get = |k: &str| h.iter().find(|(n, _)| *n == k).map(|(_, v)| v.clone());
        assert_eq!(get("Content-Type").unwrap(), "text/html; charset=utf-8");
        assert_eq!(get("Vary").unwrap(), "User-Agent, Accept");
        assert_eq!(
            get("Link").unwrap(),
            "<https://emenda.online/uf/BA.md>; rel=\"alternate\"; type=\"text/markdown\", </a.css>; rel=preload; as=style"
        );
        assert_eq!(get("X-Robots-Tag"), None);
        let h = headers(&p, Format::Markdown, 404, None);
        let get = |k: &str| h.iter().find(|(n, _)| *n == k).map(|(_, v)| v.clone());
        assert_eq!(get("Content-Type").unwrap(), "text/markdown; charset=utf-8");
        assert_eq!(
            get("Link").unwrap(),
            "<https://emenda.online/uf/BA>; rel=\"canonical\""
        );
        assert_eq!(get("X-Robots-Tag").unwrap(), "noindex");
    }

    #[test]
    fn brasilia_timestamp() {
        // 2026-10-28T01:30:00Z -> 2026-10-27T22:30-03:00
        let ms = 1_793_151_000_000.0;
        assert_eq!(iso_brasilia(ms), "2026-10-27T22:30-03:00");
    }

    #[test]
    fn clip_respects_limit_and_words() {
        assert_eq!(clip("curto", 160), "curto");
        let long = "palavra ".repeat(40);
        let c = clip(&long, 160);
        assert!(c.chars().count() <= 160, "{}", c.chars().count());
        assert!(c.ends_with("palavra…"));
    }
}
