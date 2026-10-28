use emenda_worker::cdn::{self, Fallback};

#[test]
fn scope_por_host_ou_prefixo() {
    let cases = [
        (
            "cdn.emenda.online",
            "/foto/deputado/1-160.webp",
            Some("foto/deputado/1-160.webp"),
        ),
        ("cdn.emenda.online", "/", Some("")),
        (
            "emenda.online",
            "/cdn/pdf/frente/1.pdf",
            Some("pdf/frente/1.pdf"),
        ),
        ("x.workers.dev", "/cdn/manifest.json", Some("manifest.json")),
        ("emenda.online", "/cdn", Some("")),
        ("emenda.online", "/foto/deputado/1-160.webp", None),
        ("emenda.online", "/cdnx/a", None),
        ("api.emenda.online", "/v1", None),
    ];
    for (host, path, want) in cases {
        assert_eq!(cdn::scope(host, path), want, "{host}{path}");
    }
}

#[test]
fn caminhos_validos_e_tipos() {
    let cases = [
        ("foto/deputado/204554-160.webp", Some("image/webp")),
        ("foto/senador/5012-512.jpg", Some("image/jpeg")),
        ("logo/partido/PT.webp", Some("image/webp")),
        ("logo/partido/PSOL.svg", Some("image/svg+xml")),
        ("pdf/proposicao/2196833.pdf", Some("application/pdf")),
        ("manifest.json", Some("application/json; charset=utf-8")),
        ("", None),
        ("foto/../x.webp", None),
        ("foto//x.webp", None),
        ("foto/x.exe", None),
        ("foto/x", None),
        ("foto/a b.webp", None),
        ("foto/%2e%2e/x.webp", None),
    ];
    for (p, want) in cases {
        assert_eq!(cdn::content_type(p), want, "{p}");
    }
}

#[test]
fn upstream_e_chave_de_cache() {
    assert_eq!(
        cdn::upstream("foto/deputado/1-160.webp"),
        "https://raw.githubusercontent.com/kleeedolinux/emenda.pl/assets/foto/deputado/1-160.webp"
    );
    assert_eq!(
        cdn::cache_key("pdf/frente/1.pdf"),
        "https://cdn.emenda.online/pdf/frente/1.pdf"
    );
}

#[test]
fn headers_e_cache() {
    let h = |p: &str| {
        cdn::headers(p)
            .into_iter()
            .collect::<std::collections::BTreeMap<_, _>>()
    };
    let foto = h("foto/deputado/1-160.webp");
    assert_eq!(
        foto["Cache-Control"],
        "public, max-age=2592000, s-maxage=2592000, stale-while-revalidate=604800"
    );
    assert_eq!(foto["Access-Control-Allow-Origin"], "*");
    assert_eq!(foto["X-Content-Type-Options"], "nosniff");
    assert_eq!(foto["Content-Type"], "image/webp");
    assert!(!foto.contains_key("Content-Security-Policy"));
    let svg = h("logo/partido/PSOL.svg");
    assert!(svg["Content-Security-Policy"].contains("sandbox"));
    assert!(svg["Content-Security-Policy"].contains("default-src 'none'"));
    let m = h("manifest.json");
    assert!(m["Cache-Control"].contains("s-maxage=3600"));
}

#[test]
fn fallback_para_origem() {
    let cases = [
        (
            "foto/deputado/204554-160.webp",
            Some(Fallback::Redirect(
                "https://www.camara.leg.br/internet/deputado/bandep/204554.jpg".into(),
            )),
        ),
        (
            "foto/senador/5012-512.jpg",
            Some(Fallback::Redirect(
                "https://www.senado.leg.br/senadores/img/fotos-oficiais/senador5012.jpg".into(),
            )),
        ),
        (
            "logo/partido/PT.webp",
            Some(Fallback::Redirect(
                "https://www.camara.leg.br/internet/Deputado/img/partidos/PT.gif".into(),
            )),
        ),
        (
            "pdf/proposicao/2196833.pdf",
            Some(Fallback::Camara {
                path: "proposicoes/2196833".into(),
                campo: "urlInteiroTeor",
            }),
        ),
        (
            "pdf/frente/55703.pdf",
            Some(Fallback::Camara {
                path: "frentes/55703".into(),
                campo: "urlDocumento",
            }),
        ),
        ("foto/deputado/x-160.webp", None),
        ("foto/deputado/1.webp", None),
        ("pdf/proposicao/1a.pdf", None),
        ("logo/partido/PSOL.svg", None),
        ("manifest.json", None),
    ];
    for (p, want) in cases {
        assert_eq!(cdn::fallback(p), want, "{p}");
    }
    let v = serde_json::json!({"dados":{"urlInteiroTeor":"http://www.camara.leg.br/x?codteor=1"}});
    assert_eq!(
        cdn::campo_url(&v, "urlInteiroTeor").as_deref(),
        Some("https://www.camara.leg.br/x?codteor=1")
    );
    assert_eq!(
        cdn::campo_url(&serde_json::json!({"dados":{}}), "urlInteiroTeor"),
        None
    );
}

#[test]
fn etag_condicional() {
    let cases = [
        (Some("\"a\""), "\"a\"", true),
        (Some("W/\"a\""), "\"a\"", true),
        (Some("\"b\", \"a\""), "\"a\"", true),
        (Some("*"), "\"a\"", true),
        (Some("\"b\""), "\"a\"", false),
        (None, "\"a\"", false),
    ];
    for (inm, etag, want) in cases {
        assert_eq!(cdn::etag_match(inm, etag), want, "{inm:?}");
    }
}

#[test]
fn csp_do_site_libera_o_cdn() {
    let csp = emenda_worker::route::SECURITY_HEADERS
        .iter()
        .find(|(k, _)| *k == "Content-Security-Policy")
        .unwrap()
        .1;
    for d in ["img-src", "connect-src", "frame-src"] {
        let dir = csp
            .split(';')
            .map(str::trim)
            .find(|s| s.starts_with(d))
            .unwrap_or_else(|| panic!("{d} ausente"));
        assert!(dir.contains("https://cdn.emenda.online"), "{dir}");
    }
}
