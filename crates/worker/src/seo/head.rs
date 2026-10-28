//! `<head>` block (title, description, canonical, hreflang, robots, OG/Twitter, JSON-LD) and
//! the `Link` preload header. Pure.
use super::{abs, jsonld, Doc};
use crate::meta::{escape, END, START};

pub const ROBOTS_INDEX: &str =
    "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";
pub const ROBOTS_NOINDEX: &str = "noindex, follow";

pub fn robots(d: &Doc) -> &'static str {
    if d.status == 200 {
        ROBOTS_INDEX
    } else {
        ROBOTS_NOINDEX
    }
}

/// Replacement for the `<!-- og:start … --> … <!-- og:end -->` block. `og_image`: absolute URL.
pub fn render(d: &Doc, origin: &str, og_image: &str) -> String {
    let t = escape(&d.title);
    let desc = escape(&d.description);
    let url = escape(&abs(origin, &d.path));
    let md = escape(&abs(origin, &d.md_path));
    let img = escape(og_image);
    let alt = escape(&d.h1);
    let robots = robots(d);
    let ld = jsonld::script_tag(&jsonld::graph(d, origin));
    format!(
        "{START}\n<title>{t}</title>\n<meta name=\"description\" content=\"{desc}\">\n\
<meta name=\"robots\" content=\"{robots}\">\n<link rel=\"canonical\" href=\"{url}\">\n\
<link rel=\"alternate\" hreflang=\"pt-BR\" href=\"{url}\">\n<link rel=\"alternate\" hreflang=\"x-default\" href=\"{url}\">\n\
<link rel=\"alternate\" type=\"text/markdown\" href=\"{md}\" title=\"Markdown\">\n\
<meta property=\"og:type\" content=\"website\">\n<meta property=\"og:title\" content=\"{t}\">\n\
<meta property=\"og:description\" content=\"{desc}\">\n<meta property=\"og:url\" content=\"{url}\">\n\
<meta property=\"og:image\" content=\"{img}\">\n<meta property=\"og:image:alt\" content=\"{alt}\">\n\
<meta name=\"twitter:card\" content=\"summary_large_image\">\n<meta name=\"twitter:title\" content=\"{t}\">\n\
<meta name=\"twitter:description\" content=\"{desc}\">\n<meta name=\"twitter:image\" content=\"{img}\">\n\
<meta name=\"twitter:image:alt\" content=\"{alt}\">\n{ld}\n{END}"
    )
}

fn attr<'a>(tag: &'a str, name: &str) -> Option<&'a str> {
    let key = format!(" {name}=\"");
    let i = tag.find(&key)? + key.len();
    tag[i..].split('"').next()
}

/// `Link` header with the critical resources found in index.html (fonts, CSS, entry JS).
/// Cloudflare turns it into 103 Early Hints when enabled for the zone.
pub fn preload_links(html: &str) -> Option<String> {
    let head = &html[..html.find("</head>").unwrap_or(html.len())];
    let mut out: Vec<String> = vec![];
    for tag in head.split('<').skip(1) {
        let tag = tag.split('>').next().unwrap_or("");
        let local = |h: &str| h.starts_with('/') && !h.starts_with("//");
        if tag.starts_with("link ") {
            let (Some(rel), Some(href)) = (attr(tag, "rel"), attr(tag, "href")) else {
                continue;
            };
            if !local(href) {
                continue;
            }
            match rel {
                "preload" if attr(tag, "as") == Some("font") => {
                    let ty = attr(tag, "type").unwrap_or("font/woff2");
                    out.push(format!(
                        "<{href}>; rel=preload; as=font; type=\"{ty}\"; crossorigin"
                    ));
                }
                "stylesheet" => out.push(format!("<{href}>; rel=preload; as=style")),
                _ => {}
            }
        } else if tag.starts_with("script ") && attr(tag, "type") == Some("module") {
            if let Some(src) = attr(tag, "src").filter(|s| local(s)) {
                out.push(format!("<{src}>; rel=modulepreload"));
            }
        }
    }
    (!out.is_empty()).then(|| out.join(", "))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::seo::ORIGIN;

    fn doc() -> Doc {
        Doc {
            path: "/municipio/2914406".into(),
            md_path: "/municipio/2914406.md".into(),
            title: "Iraquara (BA): R$ 2,6 mi \"x\"".into(),
            h1: "Iraquara (BA)".into(),
            description: "desc <b>".into(),
            status: 200,
            complete: true,
            ..Default::default()
        }
    }

    #[test]
    fn head_block_has_all_tags() {
        let h = render(
            &doc(),
            ORIGIN,
            "https://emenda.online/og/municipio/2914406.png",
        );
        for needle in [
            "<!-- og:start -->",
            "<title>Iraquara (BA): R$ 2,6 mi &quot;x&quot;</title>",
            "<meta name=\"description\" content=\"desc &lt;b&gt;\">",
            "<link rel=\"canonical\" href=\"https://emenda.online/municipio/2914406\">",
            "hreflang=\"pt-BR\"",
            "hreflang=\"x-default\"",
            "type=\"text/markdown\" href=\"https://emenda.online/municipio/2914406.md\"",
            "<meta name=\"robots\" content=\"index, follow",
            "og:image\" content=\"https://emenda.online/og/municipio/2914406.png\"",
            "twitter:card",
            "application/ld+json",
            "<!-- og:end -->",
        ] {
            assert!(h.contains(needle), "missing {needle}\n{h}");
        }
        let html = "<head><!-- og:start (x) -->old<!-- og:end --></head>";
        let out = crate::meta::inject(html, &h).unwrap();
        assert!(!out.contains("old") && out.contains("<title>"));
    }

    #[test]
    fn not_found_is_noindex() {
        let mut d = doc();
        d.status = 404;
        assert!(render(&d, ORIGIN, "i").contains("noindex, follow"));
    }

    #[test]
    fn preload_from_index_html() {
        let html = r#"<head><link rel="preload" href="/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin />
<link rel="icon" href="/favicon.svg" />
<script type="module" crossorigin src="/assets/index-J4.js"></script>
<link rel="modulepreload" crossorigin href="/assets/react.js">
<link rel="stylesheet" crossorigin href="/assets/index-BF.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/x"></head><body><script type="module" src="/x.js"></script>"#;
        assert_eq!(
            preload_links(html).unwrap(),
            "</fonts/inter-latin.woff2>; rel=preload; as=font; type=\"font/woff2\"; crossorigin, \
</assets/index-J4.js>; rel=modulepreload, </assets/index-BF.css>; rel=preload; as=style"
        );
        assert_eq!(preload_links("<head></head>"), None);
    }
}
