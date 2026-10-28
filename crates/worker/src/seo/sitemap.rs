//! sitemap.xml (index + children) and llms.txt / llms-full.txt. Pure.
use super::catalog::{PAUTAS, TEMAS, UFS};
use super::{abs, fmt_int, Fetched, Source, LICENSE_TEXT, SITE, STATIC_PAGES};
use crate::meta::escape;
use crate::money::compact_brl;
use serde_json::Value;

pub const XML: &str = "application/xml; charset=utf-8";
pub const TEXT: &str = "text/plain; charset=utf-8";
/// Edge + browser TTL for sitemaps and llms files.
pub const TTL: u32 = 24 * 3600;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Child {
    Paginas,
    Ufs,
    Municipios,
    Autores,
    Parlamentares,
    Proposicoes,
    Entenda,
}

const CHILDREN: [(Child, &str); 7] = [
    (Child::Paginas, "paginas.xml"),
    (Child::Ufs, "ufs.xml"),
    (Child::Municipios, "municipios.xml"),
    (Child::Autores, "autores.xml"),
    (Child::Parlamentares, "parlamentares.xml"),
    (Child::Proposicoes, "proposicoes.xml"),
    (Child::Entenda, "entenda.xml"),
];

pub const META: &str = "v1/meta.json";

impl Child {
    pub fn from_file(name: &str) -> Option<Child> {
        CHILDREN.iter().find(|(_, f)| *f == name).map(|(c, _)| *c)
    }
    pub fn file(self) -> &'static str {
        CHILDREN
            .iter()
            .find(|(c, _)| *c == self)
            .map_or("", |(_, f)| f)
    }
    /// What to fetch; `meta.json` (lastmod) is always first.
    pub fn sources(self) -> Vec<Source> {
        let mut v = vec![Source::Data(META.into())];
        match self {
            Child::Municipios => v.push(Source::Asset("/geo/municipios.json".into())),
            Child::Autores => v.push(Source::Data("v1/autores.json".into())),
            Child::Parlamentares => {
                v.push(Source::Camara("deputados?ordem=ASC&ordenarPor=nome".into()));
                v.push(Source::Senado("senador/lista/atual".into()));
            }
            Child::Proposicoes => v.push(Source::Camara(
                "votacoes?ordem=DESC&ordenarPor=dataHoraRegistro&itens=100".into(),
            )),
            _ => {}
        }
        v
    }
}

/// `generatedAt` date ("2026-10-28") from data meta.
pub fn lastmod(meta: Option<&Value>) -> Option<String> {
    let g = meta?.get("generatedAt")?.as_str()?;
    Some(g.get(..10).unwrap_or(g).to_string())
}

pub fn index(origin: &str, lastmod: Option<&str>) -> String {
    let lm = lastmod
        .map(|l| format!("<lastmod>{}</lastmod>", escape(l)))
        .unwrap_or_default();
    let mut o = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<sitemapindex xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n");
    for (_, f) in CHILDREN {
        o.push_str(&format!(
            "<sitemap><loc>{}</loc>{lm}</sitemap>\n",
            escape(&abs(origin, &format!("/sitemaps/{f}")))
        ));
    }
    o.push_str("</sitemapindex>\n");
    o
}

pub fn urlset(origin: &str, paths: &[String], lastmod: Option<&str>) -> String {
    let lm = lastmod
        .map(|l| format!("<lastmod>{}</lastmod>", escape(l)))
        .unwrap_or_default();
    let mut o = String::with_capacity(paths.len() * 96 + 128);
    o.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n");
    for p in paths.iter().take(50_000) {
        o.push_str(&format!(
            "<url><loc>{}</loc>{lm}</url>\n",
            escape(&abs(origin, p))
        ));
    }
    o.push_str("</urlset>\n");
    o
}

fn arr<'a>(v: Option<&'a Value>, ptr: &str) -> &'a [Value] {
    v.and_then(|v| v.pointer(ptr))
        .and_then(Value::as_array)
        .map_or(&[], |a| a.as_slice())
}

fn sid(v: &Value, ptr: &str) -> Option<String> {
    match v.pointer(ptr)? {
        Value::String(s) if !s.is_empty() => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

/// Paths of a child sitemap. `d` matches `sources()` order.
pub fn child_paths(c: Child, d: &[Fetched]) -> Vec<String> {
    let at = |i: usize| d.get(i).and_then(Fetched::ok);
    match c {
        Child::Paginas => {
            let mut v = vec!["/".to_string(), "/api".into()];
            v.extend(STATIC_PAGES.iter().map(|(s, _)| format!("/{s}")));
            v
        }
        Child::Ufs => UFS.iter().map(|(u, _)| format!("/uf/{u}")).collect(),
        Child::Municipios => arr(at(1), "")
            .iter()
            .filter_map(|m| sid(m, "/0"))
            .filter(|id| id.len() == 7)
            .map(|id| format!("/municipio/{id}"))
            .collect(),
        Child::Autores => arr(at(1), "")
            .iter()
            .filter_map(|a| sid(a, "/codigo"))
            .map(|c| format!("/autor/{c}"))
            .collect(),
        Child::Parlamentares => {
            let mut v: Vec<String> = arr(at(1), "/dados")
                .iter()
                .filter_map(|x| sid(x, "/id"))
                .map(|id| format!("/deputado/{id}"))
                .collect();
            v.extend(
                arr(
                    at(2),
                    "/ListaParlamentarEmExercicio/Parlamentares/Parlamentar",
                )
                .iter()
                .filter_map(|x| sid(x, "/IdentificacaoParlamentar/CodigoParlamentar"))
                .map(|c| format!("/senador/{c}")),
            );
            v
        }
        Child::Proposicoes => {
            let mut v: Vec<String> = PAUTAS
                .iter()
                .map(|p| format!("/proposicao/{}", p.camara_id))
                .collect();
            v.extend(
                arr(at(1), "/dados")
                    .iter()
                    .filter_map(|x| sid(x, "/id"))
                    .map(|id| format!("/votacao/{id}")),
            );
            v
        }
        Child::Entenda => TEMAS
            .iter()
            .map(|t| format!("/entenda/{}", t.slug))
            .collect(),
    }
}

/// robots.txt body (also shipped as `apps/web/public/robots.txt`).
pub fn robots(origin: &str) -> String {
    format!(
        "User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: {}\n",
        abs(origin, "/sitemap.xml")
    )
}

pub fn llms_txt(origin: &str, meta: Option<&Value>) -> String {
    let u = |p: &str| abs(origin, p);
    let totais = meta
        .and_then(|m| m.get("totais"))
        .map(|t| {
            format!(
                " Base atual: {} emendas, {} pagos.",
                fmt_int(t["n"].as_i64().unwrap_or(0)),
                compact_brl(t["pago"].as_i64().unwrap_or(0))
            )
        })
        .unwrap_or_default();
    let updated = lastmod(meta)
        .map(|l| format!("\nDados atualizados em: {l}.\n"))
        .unwrap_or_default();
    let mut o = format!(
        "# {SITE}\n\n> Transparência do Congresso Nacional: para onde vão as emendas parlamentares (quem enviou, quanto foi pago e em qual município), \
emenda Pix, votações nominais (como votou cada deputado), proposições, cota parlamentar e agenda da Câmara e do Senado.{totais}\n{updated}\n\
Toda página tem versão Markdown: acrescente `.md` ao caminho (ex.: {}) ou use `?formato=md`. Valores em reais (R$); \"pago\" inclui só pagamentos do exercício; \"RAP pago\" são restos a pagar.\n\n",
        u("/municipio/2914406.md")
    );
    o.push_str("## Páginas principais\n\n");
    for (p, d) in [
        (
            "/index.md",
            "Visão geral do Brasil: totais por ano, tipo, estado",
        ),
        ("/emendas.md", "Explorador de emendas parlamentares"),
        (
            "/pix.md",
            "Emenda Pix (transferências especiais): quem enviou e para onde",
        ),
        ("/ultimas.md", "Últimos pagamentos de emendas"),
        ("/dinheiro.md", "Fluxo do dinheiro por estado e área"),
        ("/deputados.md", "Deputados federais em exercício"),
        ("/senadores.md", "Senadores em exercício"),
        (
            "/proposicoes.md",
            "Proposições polêmicas e como cada deputado votou",
        ),
        ("/agenda.md", "Agenda do Congresso hoje"),
        (
            "/entenda.md",
            "Explicações: o que é emenda, emenda Pix, orçamento secreto, votações",
        ),
    ] {
        o.push_str(&format!(
            "- [{}]({}): {d}\n",
            p.trim_end_matches(".md").trim_start_matches('/'),
            u(p)
        ));
    }
    o.push_str("\n## Padrões de URL (Markdown)\n\n");
    for (p, d) in [
        ("/uf/{UF}.md", "Estado, ex.: /uf/BA.md"),
        (
            "/municipio/{ibge}.md",
            "Município pelo código IBGE de 7 dígitos: emendas recebidas, prefeito, autores",
        ),
        (
            "/autor/{codigo}.md",
            "Autor de emendas (código do Portal da Transparência)",
        ),
        (
            "/deputado/{id}.md",
            "Deputado(a) federal pelo id da Câmara: emendas, cota parlamentar",
        ),
        ("/senador/{codigo}.md", "Senador(a) pelo código do Senado"),
        (
            "/proposicao/{id}.md",
            "Proposição da Câmara: situação, autores, votações",
        ),
        (
            "/votacao/{id}.md",
            "Votação da Câmara: placar e voto de cada deputado",
        ),
        ("/partido/{SIGLA}.md", "Partido: bancada e líder"),
        ("/entenda/{tema}.md", "Tema explicativo"),
    ] {
        o.push_str(&format!("- `{}`: {d}\n", u(p)));
    }
    o.push_str("\n## Entenda\n\n");
    for t in TEMAS {
        o.push_str(&format!(
            "- [{}]({}): {}\n",
            t.titulo,
            u(&format!("/entenda/{}.md", t.slug)),
            t.resumo
        ));
    }
    o.push_str(&format!(
        "\n## Dados e API\n\n- [API aberta /v1]({}): JSON, CORS livre, sem chave. Documentação: {}\n\
- [Índice da API]({})\n- [Arquivos de dados]({}): JSON estático gerado do Portal da Transparência\n\
- [MCP]({}): servidor Model Context Protocol (ferramentas de consulta)\n- [RSS]({}): últimos pagamentos\n\
- [Sitemap]({})\n- [Versão completa deste arquivo]({})\n\n\
## Licença e citação\n\n- {LICENSE_TEXT}\n- Fontes oficiais: Portal da Transparência (CGU), Dados Abertos da Câmara, Dados Abertos do Senado, IBGE.\n\
- Como citar: \"{SITE}, <título da página>, <URL>, dados de <data>\". Autora: Júlia Klee (https://x.com/klee00z).\n",
        u("/v1"),
        u("/api"),
        u("/v1"),
        u("/data/v1/meta.json"),
        u("/mcp"),
        u("/rss"),
        u("/sitemap.xml"),
        u("/llms-full.txt"),
    ));
    o
}

/// llms.txt + full topic texts, UF table, top autores, pautas and API endpoints.
pub fn llms_full(origin: &str, meta: Option<&Value>, brasil: Option<&Value>) -> String {
    let u = |p: &str| abs(origin, p);
    let mut o = llms_txt(origin, meta);
    o.push_str("\n# Conteúdo completo\n\n## Temas (Entenda)\n\n");
    for t in TEMAS {
        o.push_str(&format!("### {}\n\n{}\n\n", t.titulo, t.resumo));
        for (a, b) in t.passos {
            o.push_str(&format!("- **{a}**: {b}\n"));
        }
        for d in t.detalhes {
            o.push_str(&format!("\n{d}\n"));
        }
        let f: Vec<String> = t
            .fontes
            .iter()
            .map(|(l, h)| format!("[{l}]({h})"))
            .collect();
        o.push_str(&format!("\nFontes: {}\n\n", f.join("; ")));
    }
    let ufs = arr(brasil, "/porUf");
    if !ufs.is_empty() {
        o.push_str(
            "## Emendas por estado (pago)\n\n| UF | Estado | Emendas | Pago |\n|---|---|---|---|\n",
        );
        for x in ufs {
            let uf = x["uf"].as_str().unwrap_or("");
            o.push_str(&format!(
                "| [{uf}]({}) | {} | {} | {} |\n",
                u(&format!("/uf/{uf}.md")),
                x["nome"].as_str().unwrap_or(""),
                fmt_int(x["n"].as_i64().unwrap_or(0)),
                compact_brl(x["pago"].as_i64().unwrap_or(0))
            ));
        }
        o.push('\n');
    }
    o.push_str("## Pautas polêmicas acompanhadas\n\n");
    for p in PAUTAS {
        o.push_str(&format!(
            "- [{} — {}]({}): {}\n",
            p.rotulo(),
            p.apelido,
            u(&format!("/proposicao/{}.md", p.camara_id)),
            p.resumo
        ));
    }
    o.push_str("\n## Endpoints da API /v1\n\n");
    let idx = crate::api::index();
    for e in idx["endpoints"].as_array().into_iter().flatten() {
        o.push_str(&format!(
            "- `{}`: {} (ex.: {})\n",
            e["path"].as_str().unwrap_or(""),
            e["descricao"].as_str().unwrap_or(""),
            u(e["exemplo"].as_str().unwrap_or(""))
        ));
    }
    o
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::seo::ORIGIN;
    use serde_json::json;

    #[test]
    fn child_files_roundtrip() {
        for (c, f) in CHILDREN {
            assert_eq!(Child::from_file(f), Some(c));
            assert_eq!(c.file(), f);
            assert_eq!(c.sources()[0], Source::Data(META.into()));
        }
        assert_eq!(Child::from_file("nope.xml"), None);
    }

    #[test]
    fn index_lists_children_with_lastmod() {
        let x = index(ORIGIN, Some("2026-10-28"));
        assert!(x.starts_with("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<sitemapindex"));
        assert_eq!(x.matches("<sitemap>").count(), 7);
        assert!(x.contains(
            "<loc>https://emenda.online/sitemaps/municipios.xml</loc><lastmod>2026-10-28</lastmod>"
        ));
    }

    #[test]
    fn child_paths_from_data() {
        let meta = Fetched::Ok(json!({"generatedAt": "2026-10-28T20:31:24Z"}));
        let muni = Fetched::Ok(json!([
            [1100015, "Alta Floresta D'Oeste", "RO"],
            [2914406, "Iraquara", "BA"]
        ]));
        assert_eq!(
            child_paths(Child::Municipios, &[meta.clone(), muni]),
            ["/municipio/1100015", "/municipio/2914406"]
        );
        let autores = Fetched::Ok(json!([{"codigo": "3795"}, {"codigo": "8100"}]));
        assert_eq!(
            child_paths(Child::Autores, &[meta.clone(), autores]),
            ["/autor/3795", "/autor/8100"]
        );
        let deps = Fetched::Ok(json!({"dados": [{"id": 204554}]}));
        let sens = Fetched::Ok(
            json!({"ListaParlamentarEmExercicio": {"Parlamentares": {"Parlamentar": [{"IdentificacaoParlamentar": {"CodigoParlamentar": "5672"}}]}}}),
        );
        assert_eq!(
            child_paths(Child::Parlamentares, &[meta.clone(), deps, sens]),
            ["/deputado/204554", "/senador/5672"]
        );
        assert_eq!(
            child_paths(
                Child::Parlamentares,
                &[meta.clone(), Fetched::Failed, Fetched::Failed]
            ),
            Vec::<String>::new()
        );
        let vots = Fetched::Ok(json!({"dados": [{"id": "2620905-56"}]}));
        let p = child_paths(Child::Proposicoes, &[meta.clone(), vots]);
        assert!(
            p.contains(&"/proposicao/2256735".to_string())
                && p.contains(&"/votacao/2620905-56".to_string())
        );
        assert_eq!(child_paths(Child::Ufs, &[]).len(), 27);
        assert_eq!(child_paths(Child::Entenda, &[]).len(), TEMAS.len());
        assert!(child_paths(Child::Paginas, &[]).contains(&"/pix".to_string()));
        assert_eq!(lastmod(meta.ok()), Some("2026-10-28".into()));
    }

    #[test]
    fn urlset_escapes_and_is_absolute() {
        let x = urlset(ORIGIN, &["/a?b=1&c=2".into()], None);
        assert!(x.contains("<url><loc>https://emenda.online/a?b=1&amp;c=2</loc></url>"));
        assert!(x.ends_with("</urlset>\n"));
    }

    #[test]
    fn llms_files() {
        let meta = json!({"generatedAt": "2026-10-28T20:31:24Z", "totais": {"n": 94755, "pago": 19455707030175i64}});
        let t = llms_txt(ORIGIN, Some(&meta));
        assert!(t.starts_with("# emenda.online\n\n> "));
        for n in [
            "94.755 emendas",
            "R$ 194,6 bi",
            "2026-10-28",
            "https://emenda.online/municipio/2914406.md",
            "## Entenda",
            "/entenda/emenda-pix.md",
            "/v1",
            "/mcp",
            "/sitemap.xml",
            "Como citar",
        ] {
            assert!(t.contains(n), "missing {n}");
        }
        let brasil =
            json!({"porUf": [{"uf": "BA", "nome": "Bahia", "n": 6059, "pago": 906628544737i64}]});
        let f = llms_full(ORIGIN, Some(&meta), Some(&brasil));
        assert!(f.contains("| [BA](https://emenda.online/uf/BA.md) | Bahia | 6.059 | R$ 9,1 bi |"));
        assert!(f.contains("PL 2630/2020"));
        assert!(f.contains("`/v1/votacoes/{id}`"));
        assert!(robots(ORIGIN).contains("Sitemap: https://emenda.online/sitemap.xml"));
    }
}
