//! RSS/Atom: routing, sources, item building, escaping and XML well-formedness (roxmltree).
use emenda_worker::api::registry::resolve;
use emenda_worker::feeds::{
    channel, esc, parse, render, rfc3339, rfc822, rss, sources, Fmt, FEEDS,
};
use serde_json::{json, Value};

#[test]
fn parses_feed_paths() {
    let ok = [
        ("agenda.xml", "agenda", None, Fmt::Rss),
        ("agenda.atom", "agenda", None, Fmt::Atom),
        ("deputado/204379.xml", "deputado", Some("204379"), Fmt::Rss),
        (
            "municipio/3550308.atom",
            "municipio",
            Some("3550308"),
            Fmt::Atom,
        ),
        (
            "proposicao/2270800.xml",
            "proposicao",
            Some("2270800"),
            Fmt::Rss,
        ),
    ];
    for (p, id, arg, fmt) in ok {
        let r = parse(p).unwrap_or_else(|| panic!("{p}"));
        assert_eq!((r.id, r.arg.as_deref(), r.fmt), (id, arg, fmt), "{p}");
    }
    for p in [
        "agenda",
        "agenda.json",
        "nada.xml",
        "deputado.xml",
        "deputado/abc.xml",
        "municipio/123.xml",
        "agenda/1.xml",
        "deputado/1/2.xml",
    ] {
        assert!(parse(p).is_none(), "{p}");
    }
}

#[test]
fn every_feed_source_is_a_routed_endpoint() {
    for f in FEEDS {
        let r = parse(f.exemplo.strip_prefix("/rss/").unwrap()).unwrap();
        assert!((900..=3600).contains(&r.ttl()));
        for u in sources(&r, "2026-10-28") {
            let (p, q) = u
                .split_once('?')
                .map_or((u.as_str(), None), |(p, q)| (p, Some(q)));
            assert!(resolve(p.strip_prefix("/v1").unwrap(), q).is_ok(), "{u}");
        }
    }
    let r = parse("agenda.xml").unwrap();
    assert_eq!(
        sources(&r, "2026-10-28"),
        vec!["/v1/agenda?de=2026-10-28&ate=2026-11-04"]
    );
}

#[test]
fn dates_and_escaping() {
    assert_eq!(
        rfc822("2026-10-28T14:05"),
        "Wed, 28 Oct 2026 14:05:00 -0300"
    );
    assert_eq!(rfc822("2024-02-29"), "Thu, 29 Feb 2024 00:00:00 -0300");
    assert_eq!(rfc3339("2026-10-28T14:05:09"), "2026-10-28T14:05:09-03:00");
    assert_eq!(
        esc("a & <b> \"c\" 'd'\u{1}"),
        "a &amp; &lt;b&gt; &quot;c&quot; &apos;d&apos;"
    );
}

fn check_xml<'a>(xml: &'a str, root: &str) -> roxmltree::Document<'a> {
    let doc = roxmltree::Document::parse(xml).unwrap_or_else(|e| panic!("{e}\n{xml}"));
    assert_eq!(doc.root_element().tag_name().name(), root);
    doc
}

#[test]
fn feeds_render_valid_rss_and_atom() {
    let feed = json!({"itens": [
        {"mes": 202610, "codigoEmenda": "2025", "autor": {"codigo": "7", "nome": "Fulano & <Cia>"}, "tipo": "pix",
         "favorecido": {"nome": "MUNICÍPIO DE X", "documento": "1"}, "municipio": {"nome": "Xique-Xique", "uf": "BA"}, "valor": 123456},
        {"mes": 202609, "codigoEmenda": "2024", "autor": {"codigo": "8", "nome": "B"}, "tipo": "individual",
         "favorecido": {"nome": "Y", "documento": "2"}, "municipio": {"nome": "", "uf": ""}, "valor": 1}
    ]});
    let self_url = "https://api.emenda.online/rss/emendas.xml?x=1&y=2";
    for (path, n) in [("emendas.xml", 2), ("pix.atom", 1)] {
        let r = parse(path).unwrap();
        let ch = channel(&r, &[Some(feed.clone())]).unwrap();
        assert_eq!(ch.items.len(), n, "{path}");
        let xml = render(&r, &ch, self_url, "2026-10-28T21:00:00Z");
        if r.fmt == Fmt::Rss {
            let doc = check_xml(&xml, "rss");
            let link = doc
                .descendants()
                .find(|e| e.tag_name().name() == "link" && e.attribute("rel") == Some("self"))
                .unwrap();
            assert_eq!(link.attribute("href"), Some(self_url));
            let t = doc
                .descendants()
                .find(|e| e.tag_name().name() == "item")
                .unwrap()
                .children()
                .find(|e| e.tag_name().name() == "title")
                .unwrap()
                .text()
                .unwrap()
                .to_string();
            assert_eq!(t, "R$ 1,2 mil para MUNICÍPIO DE X — Xique-Xique/BA");
            assert!(xml.contains("Fulano &amp; &lt;Cia&gt;"));
        } else {
            let doc = check_xml(&xml, "feed");
            assert_eq!(
                doc.root_element().tag_name().namespace(),
                Some("http://www.w3.org/2005/Atom")
            );
            assert_eq!(
                doc.descendants()
                    .filter(|e| e.tag_name().name() == "entry")
                    .count(),
                1
            );
        }
    }
}

#[test]
fn entity_feeds() {
    let dep = parse("deputado/1.xml").unwrap();
    assert!(
        channel(&dep, &[None, None, None, None]).is_none(),
        "unknown deputy -> 404"
    );
    let data: Vec<Option<Value>> = vec![
        Some(json!({"nome": "Ana", "partido": "PT", "uf": "SP"})),
        Some(json!([{"id": 5, "sigla": "PL 1/2026", "ano": 2026, "ementa": "Cria <algo>"}])),
        Some(
            json!([{"votacao": "9-1", "data": "2026-10-20", "descricao": "Aprovado", "voto": "Sim"}, {"votacao": "9-2", "data": "2026-10-19", "descricao": "X", "voto": null}]),
        ),
        Some(
            json!([{"codigo": "e1", "ano": 2025, "autor": {"codigo": "1", "nome": "ANA"}, "funcao": "Saúde", "tipo": "individual", "localidade": "SP", "empenhado": 1, "pago": 1}]),
        ),
    ];
    let ch = channel(&dep, &data).unwrap();
    assert_eq!(ch.title, "Ana (PT-SP) — emenda.online");
    let titles: Vec<&str> = ch.items.iter().map(|i| i.title.as_str()).collect();
    assert_eq!(
        titles,
        vec![
            "Votou Sim: Aprovado",
            "PL 1/2026: Cria <algo>",
            "Emenda e1: ANA — Saúde"
        ]
    );
    check_xml(
        &render(
            &dep,
            &ch,
            "https://emenda.online/rss/deputado/1.xml",
            "2026-10-28T00:00:00Z",
        ),
        "rss",
    );

    let p = parse("proposicao/9.atom").unwrap();
    let ch = channel(&p, &[Some(json!({"sigla": "PL 9/2024", "ementa": "E"})), Some(json!([{"sequencia": 3, "data": "2026-01-02T10:00", "orgao": "PLEN", "tramitacao": "Votação", "despacho": "Aprovado"}]))]).unwrap();
    assert_eq!(ch.items[0].title, "PLEN — Votação");
    check_xml(
        &render(
            &p,
            &ch,
            "https://emenda.online/rss/proposicao/9.atom",
            "2026-10-28T00:00:00Z",
        ),
        "feed",
    );

    let a = parse("agenda.xml").unwrap();
    let ch = channel(&a, &[Some(json!([{"id": "camara-1", "casa": "camara", "dia": "2026-10-29", "hora": "10:00", "inicio": "2026-10-29T10:00", "titulo": "Sessão", "orgaoSigla": "PLEN", "orgao": "Plenário", "status": "agendada", "fonte": "https://www.camara.leg.br/evento-legislativo/1", "materias": [{"sigla": "PL 1/2026", "ementa": "E"}]}]))]).unwrap();
    assert_eq!(
        ch.items[0].title,
        "[Câmara] 2026-10-29 10:00 — Sessão (PLEN)"
    );
    assert!(ch.items[0].desc.contains("PL 1/2026 E"));
    check_xml(
        &render(
            &a,
            &ch,
            "https://emenda.online/rss/agenda.xml",
            "2026-10-28T00:00:00Z",
        ),
        "rss",
    );

    let v = parse("votacoes.xml").unwrap();
    let ch = channel(&v, &[Some(json!([{"id": "1-2", "registro": "2026-10-27T22:08:21", "descricao": "Aprovado o projeto", "aprovada": true, "placar": {"sim": 300, "nao": 10}}]))]).unwrap();
    assert_eq!(
        ch.items[0].title,
        "Aprovada (Sim 300 × Não 10): Aprovado o projeto"
    );
}

#[test]
fn novidades_feed() {
    // /novidades anuncia /rss/novidades.xml; precisa existir.
    let r = parse("novidades.xml").expect("feed novidades");
    assert_eq!(sources(&r, "2026-10-29"), vec!["/v1/novidades"]);
    let data = serde_json::json!({"itens": [{
        "id": "pagamentos-1", "data": "2026-10-28T21:14:58Z",
        "titulo": "R$ 337,8 mi pagos em outubro", "texto": "Maior pagamento: Bancada de MG.",
        "entidades": [{"url": "/autor/7114"}]
    }]});
    let ch = channel(&r, &[Some(data)]).expect("channel");
    assert_eq!(ch.items.len(), 1);
    assert_eq!(ch.items[0].title, "R$ 337,8 mi pagos em outubro");
    assert_eq!(ch.items[0].guid, "pagamentos-1");
    assert!(ch.items[0].link.ends_with("/autor/7114"));
    let xml = rss(&ch, "https://emenda.online/rss/novidades.xml", "2026-10-29");
    check_xml(&xml, "rss");
}
