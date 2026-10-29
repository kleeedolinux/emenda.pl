//! Viral OG specs for every page, OG paths, and the /og-img photo proxy. Pure.
use emenda_worker::cards::Kind;
use emenda_worker::foto::{self, Foto, OgImg};
use emenda_worker::route::{cache_class, route, CacheClass, Route, Target};
use emenda_worker::seo::{self, Fetched, Page, PageKind};
use emenda_worker::viral::{self, ViralSpec};
use serde_json::{json, Value};

fn page(kind: PageKind, id: &str) -> Page {
    Page::new(kind, id)
}

fn ok(v: Value) -> Fetched {
    Fetched::Ok(v)
}

fn spec(p: &Page, d: Vec<Fetched>, extra: Vec<Fetched>) -> ViralSpec {
    let doc = seo::pages::build(p, &d, "2026-10-28T12:00-03:00");
    viral::spec(p, &d, &extra, &doc)
}

fn autor(nome: &str, pago: i64) -> Value {
    json!({ "codigo": "1", "nome": nome, "chave": nome, "n": 1, "pago": pago, "empenhado": pago })
}

fn municipio() -> Value {
    json!({
        "ibge": "2914505", "nome": "Iraquara", "uf": "BA",
        "totais": { "n": 9, "empenhado": 0, "liquidado": 0, "pago": 200_000_000, "rapPago": 60_000_000 },
        "porTipo": [
            { "tipo": "pix", "n": 2, "pago": 104_000_000, "rapPago": 0 },
            { "tipo": "individual", "n": 7, "pago": 96_000_000, "rapPago": 60_000_000 }
        ],
        "autores": [
            autor("BANCADA DA BAHIA", 900_000_000),
            autor("PAULO MAGALHAES", 120_000_000),
            autor("OTTO ALENCAR", 80_000_000),
            autor("RELATOR GERAL", 70_000_000),
            autor("JOAO DA SILVA", 10_000_000),
            autor("MARIA DOS SANTOS", 5_000_000)
        ],
        "emendas": [], "favorecidos": [], "convenios": []
    })
}

#[test]
fn municipio_leads_with_money_faces_and_pix_hook() {
    let s = spec(
        &page(PageKind::Municipio, "2914505"),
        vec![ok(json!({})), ok(municipio())],
        vec![],
    );
    assert_eq!(s.rotulo, "Dinheiro mandado por políticos");
    assert!(s.secundario.contains("emendas parlamentares"));
    assert_eq!(s.numero, "R$ 2,6 mi");
    assert_eq!(
        s.frase,
        "chegaram em Iraquara (BA), mandados por 4 políticos"
    );
    assert_eq!(s.gancho, "40% sem dizer para quê. Quem mandou?");
    let nomes: Vec<&str> = s.faces.iter().map(|f| f.nome.as_str()).collect();
    assert_eq!(nomes, ["Paulo Magalhaes", "Otto Alencar", "Joao da Silva"]);
    assert_eq!(s.faces[0].foto, Some(Foto::Nome("PAULO MAGALHAES".into())));
    assert_eq!(s.faces[0].detalhe, "R$ 1,2 mi");
    assert_eq!(s.uf.as_deref(), Some("BA"));
}

#[test]
fn uf_uses_state_preposition() {
    let u = json!({
        "uf": "BA", "nome": "Bahia",
        "totais": { "n": 1, "pago": 1_000_000_000, "rapPago": 0 },
        "porTipo": [], "municipios": [], "autores": [autor("OTTO ALENCAR", 1)]
    });
    let s = spec(
        &page(PageKind::Uf, "BA"),
        vec![ok(json!({})), ok(u)],
        vec![],
    );
    assert_eq!(s.numero, "R$ 10 mi");
    assert!(s.frase.starts_with("chegaram na Bahia"), "{}", s.frase);
    assert_eq!(s.gancho, "Quem mandou?");
    assert_eq!(viral::na_uf("SP"), "em São Paulo");
    assert_eq!(viral::na_uf("RJ"), "no Rio de Janeiro");
}

#[test]
fn deputado_has_portrait_party_flag_and_money() {
    let dep = json!({ "dados": { "id": 160541, "nomeCivil": "ARTHUR CESAR PEREIRA DE LIRA",
        "ultimoStatus": { "nomeEleitoral": "Arthur Lira", "siglaPartido": "PP", "siglaUf": "AL",
        "urlFoto": "https://www.camara.leg.br/internet/deputado/bandep/160541.jpg" } } });
    let autores = json!([autor("ARTHUR LIRA", 9_880_000_000)]);
    let s = spec(
        &page(PageKind::Deputado, "160541"),
        vec![ok(json!({})), ok(dep), Fetched::NotFound, ok(autores)],
        vec![],
    );
    assert_eq!(s.retrato, Some(Foto::Deputado(160541)));
    assert_eq!(s.selo.as_deref(), Some("PP"));
    assert_eq!(s.uf.as_deref(), Some("AL"));
    assert_eq!(s.numero, "R$ 98,8 mi");
    assert_eq!(s.frase, "mandados por Arthur Lira (PP-AL)");
}

#[test]
fn votacao_has_hemicycle_score_and_reveal_hook() {
    let v = json!({ "dados": { "id": "1-1", "data": "2023-07-07", "descricao": "Aprovada a PEC 45/2019.",
        "aprovacao": 1, "siglaOrgao": "PLEN" } });
    let mut votos = vec![];
    for (t, n) in [("Sim", 3), ("Não", 2), ("Abstenção", 1)] {
        for k in 0..n {
            votos.push(json!({ "tipoVoto": t, "deputado_": { "id": k, "nome": "X", "siglaPartido": "PL", "siglaUf": "SP" } }));
        }
    }
    let s = spec(
        &page(PageKind::Votacao, "1-1"),
        vec![ok(json!({})), ok(v), ok(json!({ "dados": votos }))],
        vec![],
    );
    assert_eq!(s.placar, Some((3, 2, 1)));
    assert_eq!(s.numero, "3 x 2");
    assert_eq!(s.gancho, "Aprovada. Veja como votou cada deputado");
}

#[test]
fn pix_and_home_use_top_people() {
    let pix = json!({ "totais": { "n": 1, "pago": 3_000_000_000_000_i64, "rapPago": 0 },
        "anos": [2020, 2026], "porAno": [], "porUf": [], "municipios": [],
        "autores": [autor("DAVI ALCOLUMBRE", 14_300_000_000_i64), autor("MARCOS ROGERIO", 1)] });
    let s = spec(
        &page(PageKind::Pix, ""),
        vec![ok(json!({})), ok(pix)],
        vec![],
    );
    assert_eq!(s.numero, "R$ 30 bi");
    assert!(s.gancho.contains("sem dizer para quê"));
    assert_eq!(s.faces[0].nome, "Davi Alcolumbre");

    let brasil = json!({ "totais": { "n": 1, "pago": 100_000_000_000_i64, "rapPago": 0 },
        "porAno": [{ "ano": 2015 }, { "ano": 2026 }], "porTipo": [], "porUf": [] });
    let s = spec(
        &page(PageKind::Home, ""),
        vec![ok(json!({})), ok(brasil)],
        vec![ok(json!([
            autor("RELATOR GERAL", 9),
            autor("ARTHUR LIRA", 5),
            autor("ELMAR NASCIMENTO", 3)
        ]))],
    );
    assert_eq!(s.numero, "R$ 1 bi");
    assert_eq!(s.faces.len(), 2);
    assert_eq!(s.faces[0].nome, "Arthur Lira");
}

#[test]
fn every_page_kind_gets_a_non_empty_card() {
    use PageKind::*;
    for (k, id) in [
        (Home, ""),
        (Uf, "BA"),
        (Municipio, "2914505"),
        (Autor, "1"),
        (Deputado, "1"),
        (Senador, "1"),
        (Proposicao, "1"),
        (Votacao, "1-1"),
        (Partido, "PL"),
        (Comissao, "1"),
        (Bancada, "1"),
        (Federacao, "1"),
        (EntendaTema, "emenda-pix"),
        (Auditar, "camara/1"),
        (Agenda, ""),
        (Pix, ""),
        (Ultimas, ""),
        (Emendas, ""),
        (Dinheiro, ""),
        (Entenda, ""),
        (Deputados, ""),
        (Senadores, ""),
        (Proposicoes, ""),
        (Partidos, ""),
        (Bancadas, ""),
        (Comissoes, ""),
        (Federacoes, ""),
        (Estaduais, ""),
        (Sobre, ""),
        (Api, ""),
    ] {
        let s = spec(&page(k, id), vec![Fetched::Failed, Fetched::Failed], vec![]);
        assert!(!s.frase.is_empty(), "{k:?}");
        assert!(!s.rotulo.is_empty(), "{k:?}");
    }
    let s = spec(&page(Auditar, "senado/5"), vec![], vec![]);
    assert_eq!(s.retrato, Some(Foto::Senador(5)));
}

#[test]
fn og_path_covers_every_route() {
    use PageKind::*;
    let cases = [
        (page(Home, ""), "/og/pagina/home.png"),
        (page(Municipio, "2914505"), "/og/municipio/2914505.png"),
        (page(Uf, "BA"), "/og/uf/BA.png"),
        (page(Partido, "PL"), "/og/partido/PL.png"),
        (page(Agenda, ""), "/og/agenda/hoje.png"),
        (page(Agenda, "2026-10-28"), "/og/agenda/2026-10-28.png"),
        (
            page(Auditar, "camara/204554"),
            "/og/pagina/auditar/camara/204554.png",
        ),
        (page(Bancada, "55"), "/og/pagina/bancada/55.png"),
        (
            page(EntendaTema, "emenda-pix"),
            "/og/pagina/entenda/emenda-pix.png",
        ),
        (page(Pix, ""), "/og/pagina/pix.png"),
        (page(Sobre, ""), "/og/pagina/sobre.png"),
    ];
    for (p, want) in cases {
        assert_eq!(viral::og_path(&p), want, "{p:?}");
        // Round trip: the OG route accepts it.
        let r = route("GET", want, None);
        assert!(matches!(r, Route::Og(_)), "{want} -> {r:?}");
    }
}

#[test]
fn og_pagina_targets_validate_and_map_back_to_pages() {
    let t = |id: &str| Target {
        kind: Kind::Pagina,
        id: id.into(),
    };
    assert_eq!(
        route("GET", "/og/pagina/pix.png", None),
        Route::Og(t("pix"))
    );
    assert_eq!(
        route("GET", "/og/pagina/novidades.png", None),
        Route::Og(t("novidades"))
    );
    for bad in [
        "/og/pagina/nope.png",
        "/og/pagina/auditar/x/1.png",
        "/og/pagina/../x.png",
        "/og/pagina/bancada/abc.png",
    ] {
        assert_eq!(route("GET", bad, None), Route::NotFound, "{bad}");
    }
    assert_eq!(
        viral::page_of(&t("auditar/camara/9")),
        Some(page(PageKind::Auditar, "camara/9"))
    );
    assert_eq!(viral::page_of(&t("home")), Some(page(PageKind::Home, "")));
    assert_eq!(
        viral::page_of(&Target {
            kind: Kind::Municipio,
            id: "2914505".into()
        }),
        Some(page(PageKind::Municipio, "2914505"))
    );
    // Pages outside the SEO router still get a card.
    let s = viral::extra_page("novidades").expect("novidades");
    assert!(!s.frase.is_empty());
    for slug in ["congresso", "stf"] {
        assert!(viral::extra_page(slug).is_some(), "{slug}");
        assert!(matches!(
            route("GET", &format!("/{slug}"), None),
            Route::Page(Target {
                kind: Kind::Pagina,
                ..
            })
        ));
    }
}

#[test]
fn og_img_route_parse_and_cache() {
    let cases = [
        ("/og-img/deputado/204554", Some(OgImg::Deputado(204554))),
        ("/og-img/senador/5672", Some(OgImg::Senador(5672))),
        (
            "/og-img/nome/PAULO-MAGALHAES",
            Some(OgImg::Nome("PAULO MAGALHAES".into())),
        ),
        ("/og-img/nome/paulo", None),
        ("/og-img/deputado/x", None),
        ("/og-img/nome/A-B/C", None),
    ];
    for (path, want) in cases {
        let r = route("GET", path, None);
        match &want {
            Some(img) => assert_eq!(r, Route::OgImg(img.clone()), "{path}"),
            None => assert_eq!(r, Route::NotFound, "{path}"),
        }
    }
    let r = route("GET", "/og-img/deputado/1", None);
    assert_eq!(cache_class(&r), Some(CacheClass::OgImg));
}

#[test]
fn foto_paths_and_candidates() {
    assert_eq!(
        foto::path(&Foto::Deputado(7)).as_deref(),
        Some("/og-img/deputado/7")
    );
    assert_eq!(
        foto::path(&Foto::Nome("PAULO MAGALHAES".into())).as_deref(),
        Some("/og-img/nome/PAULO-MAGALHAES")
    );
    let c = foto::candidates(&OgImg::Deputado(7), 512);
    assert_eq!(
        c[0],
        "https://raw.githubusercontent.com/kleeedolinux/emenda.pl/assets/foto/deputado/7-512.webp"
    );
    assert_eq!(
        c[1],
        "https://www.camara.leg.br/internet/deputado/bandep/7.jpg"
    );
    let c = foto::candidates(&OgImg::Senador(5), 160);
    assert!(c[0].ends_with("foto/senador/5-160.webp"));
    assert!(c[1].ends_with("senador5.jpg"));
}

#[test]
fn name_lookup_prefers_exact_match() {
    let resp = json!({ "dados": [
        { "id": 1, "nome": "Paulo Magalhães Filho", "siglaPartido": "X", "siglaUf": "BA" },
        { "id": 74574, "nome": "Paulo Magalhães", "siglaPartido": "PSD", "siglaUf": "BA" }
    ]});
    let p = foto::deputado_por_nome(&resp, "PAULO MAGALHAES").unwrap();
    assert_eq!(
        (p.id, p.nome.as_str(), p.partido.as_str()),
        (74574, "Paulo Magalhães", "PSD")
    );
    assert!(foto::deputado_por_nome(&json!({ "dados": [] }), "X").is_none());
    // No fuzzy fallback: "Otto Alencar Filho" is not "Otto Alencar".
    let filho = json!({ "dados": [{ "id": 9, "nome": "Otto Alencar Filho", "siglaPartido": "PSD", "siglaUf": "BA" }] });
    assert!(foto::deputado_por_nome(&filho, "OTTO ALENCAR").is_none());
    // Older legislatures come uppercase.
    let old = json!({ "dados": [{ "id": 3, "nome": "DAVI ALCOLUMBRE", "siglaPartido": "DEM", "siglaUf": "AP" }] });
    assert_eq!(
        foto::deputado_por_nome(&old, "DAVI ALCOLUMBRE")
            .unwrap()
            .nome,
        "Davi Alcolumbre"
    );
    assert_eq!(
        foto::logo_candidates("PP")[0],
        "https://raw.githubusercontent.com/kleeedolinux/emenda.pl/assets/logo/partido/PP.webp"
    );
    assert!(foto::logo_candidates("PP")[1].ends_with("/partidos/PP.gif"));
    assert!(foto::flag_candidates("BA")[0].ends_with("bandeira/uf/BA.svg"));
    let q = foto::nome_query("PAULO MAGALHAES");
    assert!(q.starts_with("deputados?nome=PAULO%20MAGALHAES"));
    assert!(q.contains("idLegislatura=57") && q.contains("idLegislatura=54"));

    let lista = json!({ "ListaParlamentarEmExercicio": { "Parlamentares": { "Parlamentar": [
        { "IdentificacaoParlamentar": { "CodigoParlamentar": "35", "NomeParlamentar": "Otto Alencar",
          "SiglaPartidoParlamentar": "PSD", "UfParlamentar": "BA" } }
    ]}}});
    let p = foto::senador_por_nome(&lista, "OTTO ALENCAR").unwrap();
    assert_eq!((p.id, p.partido.as_str()), (35, "PSD"));
}

#[test]
fn orcamento_secreto_has_seo_page_and_og_card() {
    // SEO router: real page, canonical + markdown.
    let Some(seo::SeoRoute::Page { page: p, .. }) = seo::route("GET", "/orcamento-secreto", None)
    else {
        panic!("rota SEO")
    };
    assert_eq!(p.kind, PageKind::OrcamentoSecreto);
    assert_eq!(p.md_path(), "/orcamento-secreto.md");
    // OG: /og/pagina/orcamento-secreto.png
    assert_eq!(viral::og_path(&p), "/og/pagina/orcamento-secreto.png");
    assert!(matches!(
        route("GET", "/og/pagina/orcamento-secreto.png", None),
        Route::Og(_)
    ));
    // Card leads with the RP9 total, plain words.
    let b = json!({
        "totais": { "n": 3, "pago": 90_000_000_000_i64, "rapPago": 0 },
        "porTipo": [
            { "tipo": "relator", "n": 1, "pago": 37_200_000_000_i64, "rapPago": 0 },
            { "tipo": "pix", "n": 1, "pago": 10_000_000_000_i64, "rapPago": 0 }
        ],
        "porUf": [], "fluxo": []
    });
    let s = spec(&p, vec![ok(json!({})), ok(b)], vec![]);
    assert_eq!(s.numero, "R$ 372 mi");
    assert_eq!(s.frase, "foram distribuídos sem mostrar quem pediu");
    assert!(s.gancho.contains("Veja para onde foi"));
    let doc = seo::pages::build(
        &p,
        &[
            ok(json!({})),
            ok(json!({"porTipo": [{"tipo": "relator", "pago": 37_200_000_000_i64}]})),
        ],
        "2026-10-28T12:00-03:00",
    );
    assert!(doc.title.contains("Orçamento secreto"), "{}", doc.title);
    assert!(
        doc.description.contains("sem mostrar quem pediu"),
        "{}",
        doc.description
    );
}

#[test]
fn quem_recebe_has_seo_page_and_og_card() {
    let Some(seo::SeoRoute::Page { page: p, .. }) = seo::route("GET", "/quem-recebe", None) else {
        panic!("rota SEO")
    };
    assert_eq!(p.kind, PageKind::QuemRecebe);
    assert_eq!(viral::og_path(&p), "/og/pagina/quem-recebe.png");
    assert_eq!(
        seo::pages::sources(&p, "2026-10-28")[1],
        seo::Source::Data("v1/beneficiados.json".into())
    );
    let b = json!({
        "totais": { "empresas": 30_000_000_000_i64, "entidades": 10_000_000_000_i64, "fundos": 5_000_000_000_i64 },
        "empresas": [{ "documento": "1", "nome": "CONSTRUTORA Y LTDA", "tipo": "Pessoa Jurídica", "valor": 20_000_000_000_i64, "uf": "MG", "municipio": "BETIM" }],
        "entidades": [{ "documento": "2", "nome": "HOSPITAL X", "tipo": "Pessoa Jurídica", "valor": 10_000_000_000_i64, "uf": "SP", "municipio": "CAMPINAS" }],
        "fundos": [{ "documento": "3", "nome": "FUNDO ESTADUAL DE SAUDE", "tipo": "Pessoa Jurídica", "valor": 5_000_000_000_i64, "uf": "SP", "municipio": "SAO PAULO" }]
    });
    let s = spec(&p, vec![ok(json!({})), ok(b.clone())], vec![]);
    assert_eq!(s.numero, "R$ 400 mi");
    assert_eq!(s.frase, "foram para empresas e entidades privadas");
    let doc = seo::pages::build(&p, &[ok(json!({})), ok(b)], "2026-10-28T12:00-03:00");
    assert!(doc.title.contains("Quem mais recebe"), "{}", doc.title);
    assert!(
        doc.description.contains("CONSTRUTORA Y LTDA"),
        "{}",
        doc.description
    );
    let labels: Vec<&str> = doc.sections.iter().map(|s| s.heading.as_str()).collect();
    assert!(
        labels.contains(&"Fundos públicos que mais receberam"),
        "{labels:?}"
    );
}
