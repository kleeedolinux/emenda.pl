//! Crawlable HTML summary placed inside `<div id="root">`. React's `createRoot().render()`
//! clears the container on its first commit, so users get the SPA; crawlers without JS get this.
use super::{abs, Doc};
use crate::meta::escape;

/// Upper bound for the injected fragment.
pub const MAX_BYTES: usize = 30 * 1024;
const ROOT: &str = "<div id=\"root\"></div>";

pub fn render(d: &Doc, origin: &str) -> String {
    let mut o = String::with_capacity(4096);
    o.push_str("<main data-prerender=\"1\" style=\"max-width:64rem;margin:0 auto;padding:1rem;font-family:system-ui,sans-serif\">");
    if d.breadcrumbs.len() > 1 {
        o.push_str("<nav aria-label=\"Trilha\"><ol style=\"display:flex;gap:.5rem;list-style:none;padding:0;flex-wrap:wrap\">");
        for (name, path) in &d.breadcrumbs {
            o.push_str(&format!(
                "<li><a href=\"{}\">{}</a></li>",
                escape(path),
                escape(name)
            ));
        }
        o.push_str("</ol></nav>");
    }
    o.push_str(&format!("<h1>{}</h1>", escape(&d.h1)));
    if let Some(i) = &d.intro {
        o.push_str(&format!("<p>{}</p>", escape(i)));
    }
    if !d.facts.is_empty() {
        o.push_str("<table><caption>Resumo</caption><tbody>");
        for (k, v) in &d.facts {
            o.push_str(&format!(
                "<tr><th scope=\"row\">{}</th><td>{}</td></tr>",
                escape(k),
                escape(v)
            ));
        }
        o.push_str("</tbody></table>");
    }
    let tail = footer(d, origin);
    let budget = MAX_BYTES.saturating_sub(tail.len() + 256);
    'outer: for s in &d.sections {
        if o.len() > budget {
            break;
        }
        o.push_str(&format!("<section><h2>{}</h2>", escape(&s.heading)));
        if let Some(t) = &s.text {
            o.push_str(&format!("<p>{}</p>", escape(t)));
        }
        if !s.items.is_empty() {
            o.push_str("<ul>");
            for (n, it) in s.items.iter().enumerate() {
                let li = item(it);
                if o.len() + li.len() > budget {
                    let more = s.items.len() - n;
                    o.push_str(&format!(
                        "<li><a href=\"{}\">… e mais {more} (versão completa)</a></li></ul></section>",
                        escape(&d.md_path)
                    ));
                    break 'outer;
                }
                o.push_str(&li);
            }
            o.push_str("</ul>");
        }
        o.push_str("</section>");
    }
    o.push_str(&tail);
    o.push_str("</main>");
    o
}

fn item(it: &super::Item) -> String {
    let label = escape(&it.label);
    let main = match &it.href {
        Some(h) => format!("<a href=\"{}\">{label}</a>", escape(h)),
        None => label,
    };
    match &it.note {
        Some(n) => format!("<li>{main} — {}</li>", escape(n)),
        None => format!("<li>{main}</li>"),
    }
}

fn footer(d: &Doc, origin: &str) -> String {
    let mut o = String::from("<footer><p>");
    if !d.sources.is_empty() {
        o.push_str("Fontes: ");
        let links: Vec<String> = d
            .sources
            .iter()
            .map(|(l, u)| {
                format!(
                    "<a href=\"{}\" rel=\"nofollow noopener\">{}</a>",
                    escape(u),
                    escape(l)
                )
            })
            .collect();
        o.push_str(&links.join(", "));
        o.push_str(". ");
    }
    if let Some(u) = &d.updated {
        o.push_str(&format!("Dados atualizados em {}. ", escape(u)));
    }
    o.push_str(&format!(
        "<a href=\"{}\" type=\"text/markdown\">Versão em Markdown</a>.</p></footer>",
        escape(&abs(origin, &d.md_path))
    ));
    o
}

/// Put `fragment` inside the empty root div. None if the marker is absent.
pub fn inject_root(html: &str, fragment: &str) -> Option<String> {
    let i = html.find(ROOT)?;
    let at = i + ROOT.len() - "</div>".len();
    Some(format!("{}{fragment}{}", &html[..at], &html[at..]))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::seo::{Item, Section, ORIGIN};

    fn doc(items: usize) -> Doc {
        Doc {
            path: "/uf/BA".into(),
            md_path: "/uf/BA.md".into(),
            h1: "Emendas na <Bahia>".into(),
            intro: Some("Intro".into()),
            facts: vec![("Pago".into(), "R$ 9 bi".into())],
            breadcrumbs: vec![
                ("Início".into(), "/".into()),
                ("BA".into(), "/uf/BA".into()),
            ],
            sections: vec![Section {
                heading: "Municípios".into(),
                text: None,
                items: (0..items)
                    .map(|i| {
                        Item::link(
                            format!("Cidade {i}"),
                            format!("/municipio/{i:07}"),
                            Some("R$ 1 mi".into()),
                        )
                    })
                    .collect(),
            }],
            sources: vec![("Portal".into(), "https://portal".into())],
            updated: Some("2026-10-28".into()),
            status: 200,
            complete: true,
            ..Default::default()
        }
    }

    #[test]
    fn semantic_fragment() {
        let h = render(&doc(3), ORIGIN);
        for n in [
            "<h1>Emendas na &lt;Bahia&gt;</h1>",
            "<th scope=\"row\">Pago</th><td>R$ 9 bi</td>",
            "<h2>Municípios</h2>",
            "<a href=\"/municipio/0000002\">Cidade 2</a> — R$ 1 mi",
            "Dados atualizados em 2026-10-28",
            "href=\"https://emenda.online/uf/BA.md\"",
            "<nav aria-label=\"Trilha\">",
        ] {
            assert!(h.contains(n), "missing {n}");
        }
    }

    #[test]
    fn stays_under_budget() {
        let h = render(&doc(5000), ORIGIN);
        assert!(h.len() <= MAX_BYTES, "{}", h.len());
        assert!(h.contains("… e mais"));
        assert!(h.ends_with("</main>"));
    }

    #[test]
    fn injects_into_root() {
        let html = "<body>\n<div id=\"root\"></div>\n<script></script></body>";
        assert_eq!(
            inject_root(html, "<p>x</p>").unwrap(),
            "<body>\n<div id=\"root\"><p>x</p></div>\n<script></script></body>"
        );
        assert_eq!(inject_root("<div id=\"app\"></div>", "x"), None);
    }
}
