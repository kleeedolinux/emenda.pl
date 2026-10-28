//! Markdown rendering for AI assistants and fetchers. Pure. Links are absolute.
use super::{abs, Doc, LICENSE_TEXT, SITE};

pub const CONTENT_TYPE: &str = "text/markdown; charset=utf-8";

fn cell(s: &str) -> String {
    s.replace('|', "\\|").replace('\n', " ")
}

fn label(s: &str) -> String {
    s.replace('[', "\\[").replace(']', "\\]").replace('\n', " ")
}

pub fn render(d: &Doc, origin: &str) -> String {
    let url = abs(origin, &d.path);
    let mut o = format!("# {}\n\n> {}\n\n", d.h1, d.description);
    o.push_str(&format!("- URL canônica: {url}\n"));
    if !d.sources.is_empty() {
        let s: Vec<String> = d
            .sources
            .iter()
            .map(|(l, u)| format!("[{}]({u})", label(l)))
            .collect();
        o.push_str(&format!("- Fontes: {}\n", s.join("; ")));
    }
    o.push_str(&format!("- Licença: {LICENSE_TEXT}\n"));
    if let Some(u) = &d.updated {
        o.push_str(&format!("- Dados atualizados em: {u}\n"));
    }
    if d.breadcrumbs.len() > 1 {
        let b: Vec<String> = d
            .breadcrumbs
            .iter()
            .map(|(n, p)| format!("[{}]({})", label(n), abs(origin, p)))
            .collect();
        o.push_str(&format!("- Navegação: {}\n", b.join(" > ")));
    }
    o.push('\n');
    if let Some(i) = &d.intro {
        o.push_str(i);
        o.push_str("\n\n");
    }
    if !d.facts.is_empty() {
        o.push_str("| Indicador | Valor |\n|---|---|\n");
        for (k, v) in &d.facts {
            o.push_str(&format!("| {} | {} |\n", cell(k), cell(v)));
        }
        o.push('\n');
    }
    for s in &d.sections {
        o.push_str(&format!("## {}\n\n", s.heading));
        if let Some(t) = &s.text {
            o.push_str(t);
            o.push_str("\n\n");
        }
        for it in &s.items {
            let main = match &it.href {
                Some(h) => format!("[{}]({})", label(&it.label), abs(origin, h)),
                None => it.label.clone(),
            };
            match &it.note {
                Some(n) => o.push_str(&format!("- {main} — {n}\n")),
                None => o.push_str(&format!("- {main}\n")),
            }
        }
        if !s.items.is_empty() {
            o.push('\n');
        }
    }
    o.push_str(&format!(
        "---\nComo citar: {SITE}, \"{}\", {url}{}.\n",
        d.h1,
        d.updated
            .as_deref()
            .map(|u| format!(" (dados de {u})"))
            .unwrap_or_default()
    ));
    o
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::seo::{Item, Section, ORIGIN};

    #[test]
    fn markdown_shape() {
        let d = Doc {
            path: "/municipio/2914406".into(),
            md_path: "/municipio/2914406.md".into(),
            h1: "Iraquara (BA)".into(),
            description: "Recebeu R$ 2,6 mi".into(),
            facts: vec![
                ("Pago".into(), "R$ 2,6 mi".into()),
                ("A|B".into(), "x".into()),
            ],
            sections: vec![Section {
                heading: "Quem enviou".into(),
                text: None,
                items: vec![
                    Item::link("OTTO [A]", "/autor/3795", Some("R$ 2,6 mi".into())),
                    Item::text("Sem link", None),
                ],
            }],
            sources: vec![(
                "Portal da Transparência".into(),
                "https://portaldatransparencia.gov.br/emendas".into(),
            )],
            updated: Some("2026-10-28".into()),
            breadcrumbs: vec![
                ("Início".into(), "/".into()),
                ("BA".into(), "/uf/BA".into()),
            ],
            ..Default::default()
        };
        let m = render(&d, ORIGIN);
        assert!(m.starts_with("# Iraquara (BA)\n\n> Recebeu R$ 2,6 mi\n\n- URL canônica: https://emenda.online/municipio/2914406\n"));
        for n in [
            "- Fontes: [Portal da Transparência](https://portaldatransparencia.gov.br/emendas)",
            "- Licença: ",
            "- Dados atualizados em: 2026-10-28",
            "| Indicador | Valor |\n|---|---|\n| Pago | R$ 2,6 mi |\n| A\\|B | x |",
            "## Quem enviou\n\n- [OTTO \\[A\\]](https://emenda.online/autor/3795) — R$ 2,6 mi\n- Sem link\n",
            "[BA](https://emenda.online/uf/BA)",
            "Como citar: emenda.online",
        ] {
            assert!(m.contains(n), "missing {n}\n{m}");
        }
        assert!(!m.contains("](/"), "relative link");
    }
}
