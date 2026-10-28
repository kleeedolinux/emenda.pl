use emenda_worker::cards::{self, Kind};
use emenda_worker::meta;
use emenda_worker::money::compact_brl;
use emenda_worker::route::{
    cache_class, cache_control, cache_key, data_source, route, ttl_secs, upstream_url, CacheClass,
    DataSource, Route, Target, Upstream,
};
use serde_json::json;

const DATA: &str = "https://cdn.jsdelivr.net/gh/kleeedolinux/emenda-pl-data@main/";

fn proxy(up: Upstream, rest: &str, q: Option<&str>) -> Route {
    Route::Proxy {
        upstream: up,
        rest: rest.into(),
        query: q.map(Into::into),
    }
}
fn t(kind: Kind, id: &str) -> Target {
    Target {
        kind,
        id: id.into(),
    }
}

#[test]
fn routes() {
    let long = "a".repeat(600);
    let cases: Vec<(&str, &str, Option<&str>, Route)> = vec![
        ("GET", "/api/health", None, Route::Health),
        ("POST", "/api/hit", None, Route::Hit),
        ("GET", "/api/hit", None, Route::MethodNotAllowed),
        ("GET", "/api/stats", None, Route::Stats),
        ("POST", "/api/stats", None, Route::MethodNotAllowed),
        ("HEAD", "/api/health", None, Route::Health),
        ("OPTIONS", "/api/camara/x", None, Route::Options),
        (
            "POST",
            "/api/camara/deputados",
            None,
            Route::MethodNotAllowed,
        ),
        (
            "GET",
            "/api/camara/deputados",
            Some("itens=2"),
            proxy(Upstream::Camara, "deputados", Some("itens=2")),
        ),
        (
            "GET",
            "/api/senado/senador/5012",
            None,
            proxy(Upstream::Senado, "senador/5012", None),
        ),
        (
            "GET",
            "/api/ibge/v3/malhas/paises/BR",
            Some("formato=application/json"),
            proxy(
                Upstream::Ibge,
                "v3/malhas/paises/BR",
                Some("formato=application/json"),
            ),
        ),
        (
            "GET",
            "/data/v1/uf/BA.json",
            None,
            proxy(Upstream::Data, "v1/uf/BA.json", None),
        ),
        ("GET", "/api/camara/../x", None, Route::BadRequest),
        ("GET", "/api/camara/a%2e%2e/x", None, Route::BadRequest),
        ("GET", "/api/camara/a//b", None, Route::BadRequest),
        ("GET", "/api/camara/", None, Route::BadRequest),
        (
            "GET",
            "/api/camara/x",
            Some(long.as_str()),
            Route::BadRequest,
        ),
        ("GET", "/api/evil/x", None, Route::NotFound),
        ("GET", "/api/camaraX/x", None, Route::NotFound),
        (
            "GET",
            "/og/default.png",
            None,
            Route::Og(t(Kind::Default, "")),
        ),
        (
            "GET",
            "/og/deputado/204554.png",
            None,
            Route::Og(t(Kind::Deputado, "204554")),
        ),
        ("GET", "/og/uf/ba.png", None, Route::Og(t(Kind::Uf, "BA"))),
        (
            "GET",
            "/og/votacao/2265603-43.png",
            None,
            Route::Og(t(Kind::Votacao, "2265603-43")),
        ),
        (
            "GET",
            "/og/partido/pt.png",
            None,
            Route::Og(t(Kind::Partido, "PT")),
        ),
        ("GET", "/og/deputado/abc.png", None, Route::NotFound),
        ("GET", "/og/municipio/123.png", None, Route::NotFound),
        (
            "GET",
            "/deputado/204554",
            None,
            Route::Page(t(Kind::Deputado, "204554")),
        ),
        (
            "GET",
            "/municipio/2914406",
            None,
            Route::Page(t(Kind::Municipio, "2914406")),
        ),
        (
            "GET",
            "/autor/1234",
            None,
            Route::Page(t(Kind::Autor, "1234")),
        ),
        ("GET", "/", None, Route::Page(t(Kind::Default, ""))),
        ("GET", "/sobre", None, Route::Page(t(Kind::Default, ""))),
        (
            "GET",
            "/deputado/xx",
            None,
            Route::Page(t(Kind::Default, "")),
        ),
        ("GET", "/assets/index-abc.js", None, Route::Asset),
        ("GET", "/favicon.svg", None, Route::Asset),
    ];
    for (m, p, q, want) in cases {
        assert_eq!(route(m, p, q), want, "{m} {p} {q:?}");
    }
}

#[test]
fn upstream_urls() {
    let cases = [
        (
            Upstream::Camara,
            "deputados",
            Some("itens=2"),
            "https://dadosabertos.camara.leg.br/api/v2/deputados?itens=2",
        ),
        (
            Upstream::Senado,
            "senador/5012",
            None,
            "https://legis.senado.leg.br/dadosabertos/senador/5012",
        ),
        (
            Upstream::Ibge,
            "v3/malhas/paises/BR",
            Some("formato=x"),
            "https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=x",
        ),
        (
            Upstream::Data,
            "v1/uf/BA.json",
            None,
            "https://cdn.jsdelivr.net/gh/kleeedolinux/emenda-pl-data@main/v1/uf/BA.json",
        ),
    ];
    for (u, r, q, want) in cases {
        assert_eq!(upstream_url(u, r, q, DATA), want);
    }
    assert_eq!(
        upstream_url(Upstream::Data, "v1/a.json", None, "https://x.dev/d"),
        "https://x.dev/d/v1/a.json"
    );
}

#[test]
fn data_source_mode() {
    assert_eq!(data_source(""), DataSource::Assets);
    assert_eq!(data_source("  "), DataSource::Assets);
    assert_eq!(data_source(DATA), DataSource::Remote(DATA.into()));
}

#[test]
fn ttls() {
    let cases = [
        (
            proxy(Upstream::Ibge, "v3/malhas/x", None),
            CacheClass::Ibge,
            30 * 86400,
        ),
        (
            proxy(Upstream::Data, "v1/x.json", None),
            CacheClass::Data,
            6 * 3600,
        ),
        (
            proxy(Upstream::Camara, "deputados", Some("itens=2")),
            CacheClass::CamaraRef,
            12 * 3600,
        ),
        (
            proxy(Upstream::Camara, "deputados/204554", None),
            CacheClass::CamaraRef,
            12 * 3600,
        ),
        (
            proxy(Upstream::Camara, "partidos", None),
            CacheClass::CamaraRef,
            12 * 3600,
        ),
        (
            proxy(Upstream::Camara, "proposicoes/2345", None),
            CacheClass::CamaraDetail,
            3600,
        ),
        (
            proxy(Upstream::Camara, "votacoes/2265603-43", None),
            CacheClass::CamaraDetail,
            3600,
        ),
        (
            proxy(Upstream::Camara, "proposicoes", Some("keywords=x")),
            CacheClass::CamaraList,
            600,
        ),
        (
            proxy(Upstream::Senado, "senador/lista/atual", None),
            CacheClass::Senado,
            6 * 3600,
        ),
        (Route::Og(t(Kind::Default, "")), CacheClass::Og, 86400),
        (Route::Page(t(Kind::Default, "")), CacheClass::Html, 300),
        (Route::Stats, CacheClass::Stats, 30),
    ];
    for (r, class, secs) in cases {
        assert_eq!(cache_class(&r), Some(class), "{r:?}");
        assert_eq!(ttl_secs(class), secs, "{class:?}");
    }
    assert_eq!(cache_class(&Route::Health), None);
    assert_eq!(
        cache_control(CacheClass::Ibge),
        "public, max-age=3600, s-maxage=2592000, stale-while-revalidate=86400"
    );
    assert_eq!(
        cache_control(CacheClass::Html),
        "public, max-age=300, s-maxage=300, stale-while-revalidate=86400"
    );
}

#[test]
fn cache_keys_sort_query() {
    assert_eq!(
        cache_key("https://e.pl/api/x?b=2&a=1"),
        "https://e.pl/api/x?a=1&b=2"
    );
    assert_eq!(cache_key("https://e.pl/api/x?"), "https://e.pl/api/x");
    assert_eq!(cache_key("https://e.pl/api/x#f"), "https://e.pl/api/x");
}

#[test]
fn money() {
    let cases = [
        (0, "R$ 0"),
        (95_000, "R$ 950"),
        (150_000, "R$ 1,5 mil"),
        (3_240_000_000, "R$ 32,4 mi"),
        (100_000_000, "R$ 1 mi"),
        (1_234_500_000_000, "R$ 12,3 bi"),
        (-3_240_000_000, "-R$ 32,4 mi"),
        (99_999_999, "R$ 1 mi"),
    ];
    for (c, want) in cases {
        assert_eq!(compact_brl(c), want, "{c}");
    }
}

#[test]
fn escaping() {
    assert_eq!(
        meta::escape(r#"<a href="x">'&'</a>"#),
        "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;"
    );
}

#[test]
fn meta_injection() {
    let html = "<head><!-- og:start --><title>old</title><!-- og:end --></head>";
    let m = meta::page_meta(
        &t(Kind::Deputado, "204554"),
        "https://emenda.pl",
        "/deputado/204554",
        Some("Fulano <script>"),
    );
    let out = meta::inject(html, &meta::render(&m)).unwrap();
    assert!(!out.contains("old"));
    assert!(out.contains("<!-- og:start -->") && out.contains("<!-- og:end -->"));
    assert!(
        out.contains(
            r#"<meta property="og:image" content="https://emenda.pl/og/deputado/204554.png">"#
        ),
        "{out}"
    );
    assert!(out.contains(r#"<meta property="og:url" content="https://emenda.pl/deputado/204554">"#));
    assert!(out.contains("Fulano &lt;script&gt;"));
    assert!(!out.contains("<script>"));
    for needle in [
        "og:image:width\" content=\"1200",
        "og:image:height\" content=\"630",
        "summary_large_image",
        "@klee00z",
        "twitter:image",
        "og:description",
        "<title>",
    ] {
        assert!(out.contains(needle), "{needle}");
    }
    assert_eq!(meta::inject("<head></head>", "x"), None);
    let d = meta::page_meta(&t(Kind::Default, ""), "https://emenda.pl", "/sobre", None);
    assert_eq!(d.image, "https://emenda.pl/og/default.png");
}

#[test]
fn chave_nome() {
    assert_eq!(
        cards::chave_nome("  Jandira  Feghali-Ásé "),
        "JANDIRA FEGHALI ASE"
    );
    assert_eq!(cards::chave_nome("João Conceição"), "JOAO CONCEICAO");
}

#[test]
fn deputado_card() {
    let dep = json!({"dados": {"nomeCivil": "X", "ultimoStatus": {"nomeEleitoral": "Tabata Amaral", "siglaPartido": "PSB", "siglaUf": "SP", "urlFoto": "https://www.camara.leg.br/f.jpg"}}});
    let autores = json!([{"codigo": "1", "nome": "TABATA AMARAL", "chave": "TABATA AMARAL", "n": 12, "pago": 3_240_000_000i64, "empenhado": 1}]);
    let c = cards::deputado(&dep, Some(&autores), Some(321)).unwrap();
    assert_eq!(c.kind, Kind::Deputado);
    assert_eq!(c.title, "Tabata Amaral");
    assert_eq!(c.subtitle, "PSB-SP");
    assert_eq!(
        c.photo_url.as_deref(),
        Some("https://www.camara.leg.br/f.jpg")
    );
    assert_eq!(
        c.stats,
        vec![
            ("Pago em emendas".into(), "R$ 32,4 mi".into()),
            ("Emendas".into(), "12".into()),
            ("Proposições".into(), "321".into())
        ]
    );
    assert!(cards::deputado(&json!({}), None, None).is_none());
}

#[test]
fn municipio_card() {
    let m = json!({"ibge": "2914406", "nome": "Ilhéus", "uf": "BA", "prefeito": {"nome": "Valderico", "partido": "UNIÃO", "eleicao": 2024, "situacao": "x"}, "totais": {"pago": 150_000, "n": 3}});
    let c = cards::municipio(&m).unwrap();
    assert_eq!(
        (c.title.as_str(), c.subtitle.as_str()),
        ("Ilhéus-BA", "Prefeito: Valderico (UNIÃO)")
    );
    assert_eq!(c.stats[0], ("Pago".into(), "R$ 1,5 mil".into()));
}

#[test]
fn other_cards() {
    let p = json!({"dados": {"siglaTipo": "PL", "numero": 2630, "ano": 2020, "ementa": "Institui a Lei", "statusProposicao": {"descricaoSituacao": "Pronta para Pauta"}}});
    let c = cards::proposicao(&p).unwrap();
    assert_eq!(
        (c.title.as_str(), c.badge.as_deref()),
        ("PL 2630/2020", Some("Pronta para Pauta"))
    );
    let v = json!({"dados": {"descricao": "Aprovado o requerimento", "data": "2023-05-02", "siglaOrgao": "PLEN"}});
    let votos = json!({"dados": [{"tipoVoto": "Sim"}, {"tipoVoto": "Não"}, {"tipoVoto": "Sim"}]});
    let c = cards::votacao(&v, Some(&votos)).unwrap();
    assert_eq!(
        c.stats,
        vec![("Sim".into(), "2".into()), ("Não".into(), "1".into())]
    );
    let s = json!({"DetalheParlamentar": {"Parlamentar": {"IdentificacaoParlamentar": {"NomeParlamentar": "Romário", "SiglaPartidoParlamentar": "PL", "UfParlamentar": "RJ", "UrlFotoParlamentar": "http://www.senado.leg.br/f.jpg"}}}});
    let c = cards::senador(&s, None).unwrap();
    assert_eq!(
        (c.title.as_str(), c.subtitle.as_str()),
        ("Romário", "PL-RJ")
    );
    let u = json!({"uf": "BA", "nome": "Bahia", "totais": {"pago": 100_000_000, "n": 5}, "municipios": [1, 2]});
    assert_eq!(cards::uf(&u).unwrap().title, "Bahia (BA)");
    let a = json!({"codigo": "9", "nome": "FULANO", "totais": {"pago": 0, "n": 0}});
    assert_eq!(cards::autor(&a).unwrap().title, "FULANO");
    let pt = json!({"dados": {"sigla": "PT", "nome": "Partido dos Trabalhadores", "status": {"totalMembros": "68"}}});
    let c = cards::partido(&pt).unwrap();
    assert_eq!((c.title.as_str(), c.stats[0].1.as_str()), ("PT", "68"));
    assert_eq!(cards::default_card().kind, Kind::Default);
}

#[test]
fn origins() {
    use emenda_worker::route::public_origin;
    assert_eq!(public_origin("http", "emenda.pl"), "https://emenda.pl");
    assert_eq!(
        public_origin("http", "localhost:8787"),
        "http://localhost:8787"
    );
}

#[test]
fn content_types() {
    use emenda_worker::route::content_type;
    let j = "application/json; charset=utf-8";
    assert_eq!(
        content_type(
            Upstream::Data,
            "v1/a.json",
            Some("text/plain; charset=utf-8")
        ),
        j
    );
    assert_eq!(
        content_type(Upstream::Data, "v1/a.topojson", Some("text/plain")),
        "text/plain"
    );
    assert_eq!(
        content_type(Upstream::Camara, "deputados", Some("application/json")),
        "application/json"
    );
    assert_eq!(content_type(Upstream::Ibge, "x", None), j);
}
