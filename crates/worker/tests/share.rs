//! Share targets: voto (como votou) and agenda (pauta do dia). Pure.
use emenda_worker::cards::{self, Kind};
use emenda_worker::meta;
use emenda_worker::route::{cache_class, route, ttl_secs, CacheClass, Route, Target};
use serde_json::json;

fn t(kind: Kind, id: &str) -> Target {
    Target {
        kind,
        id: id.into(),
    }
}

#[test]
fn og_routes_for_voto_and_agenda() {
    let cases: Vec<(&str, Route)> = vec![
        (
            "/og/voto/2196833-395/204554.png",
            Route::Og(t(Kind::Voto, "2196833-395/204554")),
        ),
        (
            "/og/agenda/2026-10-28.png",
            Route::Og(t(Kind::Agenda, "2026-10-28")),
        ),
        ("/og/agenda/hoje.png", Route::Og(t(Kind::Agenda, "hoje"))),
        ("/og/voto/2196833-395.png", Route::NotFound),
        ("/og/voto/2196833-395/x1.png", Route::NotFound),
        ("/og/voto/../1.png", Route::NotFound),
        ("/og/agenda/2026-13-01.png", Route::NotFound),
        ("/og/agenda/26-10-28.png", Route::NotFound),
        ("/og/agenda/2026-10-28/x.png", Route::NotFound),
    ];
    for (path, want) in cases {
        assert_eq!(route("GET", path, None), want, "{path}");
    }
}

#[test]
fn pages_with_share_query_get_specific_targets() {
    let cases: Vec<(&str, Option<&str>, Route)> = vec![
        (
            "/votacao/2196833-395",
            Some("dep=204554"),
            Route::Page(t(Kind::Voto, "2196833-395/204554")),
        ),
        (
            "/votacao/2196833-395",
            Some("tab=x&dep=204554"),
            Route::Page(t(Kind::Voto, "2196833-395/204554")),
        ),
        (
            "/votacao/2196833-395",
            Some("dep=abc"),
            Route::Page(t(Kind::Votacao, "2196833-395")),
        ),
        (
            "/votacao/2196833-395",
            None,
            Route::Page(t(Kind::Votacao, "2196833-395")),
        ),
        (
            "/agenda",
            Some("dia=2026-10-28&evento=camara-1"),
            Route::Page(t(Kind::Agenda, "2026-10-28")),
        ),
        ("/agenda", None, Route::Page(t(Kind::Agenda, "hoje"))),
        (
            "/agenda",
            Some("dia=ontem"),
            Route::Page(t(Kind::Agenda, "hoje")),
        ),
    ];
    for (path, q, want) in cases {
        assert_eq!(route("GET", path, q), want, "{path}?{q:?}");
    }
}

#[test]
fn og_paths_and_cache() {
    assert_eq!(t(Kind::Voto, "1-2/3").og_path(), "/og/voto/1-2/3.png");
    assert_eq!(
        t(Kind::Agenda, "2026-10-28").og_path(),
        "/og/agenda/2026-10-28.png"
    );
    let agenda = Route::Og(t(Kind::Agenda, "hoje"));
    let voto = Route::Og(t(Kind::Voto, "1-2/3"));
    assert_eq!(cache_class(&agenda), Some(CacheClass::OgAgenda));
    assert_eq!(ttl_secs(CacheClass::OgAgenda), 3600);
    assert_eq!(cache_class(&voto), Some(CacheClass::Og));
    assert_eq!(ttl_secs(CacheClass::Og), 86400);
}

#[test]
fn meta_for_voto_and_agenda() {
    let m = meta::page_meta(
        &t(Kind::Voto, "1-2/3"),
        "https://emenda.online",
        "/votacao/1-2?dep=3",
        None,
    );
    assert_eq!(m.image, "https://emenda.online/og/voto/1-2/3.png");
    assert_eq!(m.url, "https://emenda.online/votacao/1-2?dep=3");
    assert!(m.title.contains("votou"), "{}", m.title);
    let a = meta::page_meta(
        &t(Kind::Agenda, "2026-10-28"),
        "https://emenda.online",
        "/agenda?dia=2026-10-28",
        None,
    );
    assert_eq!(a.image, "https://emenda.online/og/agenda/2026-10-28.png");
    assert!(a.title.contains("Agenda"), "{}", a.title);
}

#[test]
fn dates() {
    assert_eq!(cards::dia_brasilia(1_761_620_400_000.0), "2025-10-28"); // 2025-10-28T03:00Z
    assert_eq!(cards::dia_brasilia(1_761_620_399_000.0), "2025-10-27"); // 02:59:59Z = 23:59 BRT
    for (d, want) in [
        ("2026-10-28", "quarta-feira, 28 de outubro"),
        ("2026-01-01", "quinta-feira, 1º de janeiro"),
        ("2024-02-29", "quinta-feira, 29 de fevereiro"),
    ] {
        assert_eq!(cards::dia_extenso(d).as_deref(), Some(want), "{d}");
    }
    assert_eq!(cards::dia_extenso("2026-02-30"), None);
}

fn votacao() -> serde_json::Value {
    json!({"dados": {
        "id": "2196833-395", "data": "2023-07-07", "siglaOrgao": "PLEN",
        "descricao": "Aprovada a Proposta de Emenda à Constituição. Sim: 382; não: 118; abstenção: 3; total: 503.",
        "proposicoesAfetadas": [{"id": 2196833, "siglaTipo": "PEC", "numero": 45, "ano": 2019, "ementa": "Altera o Sistema Tributário Nacional."}]
    }})
}

fn votos() -> serde_json::Value {
    json!({"dados": [
        {"tipoVoto": "Sim", "deputado_": {"id": 1, "nome": "Ana", "siglaPartido": "PT", "siglaUf": "SP", "urlFoto": "https://www.camara.leg.br/1.jpg"}},
        {"tipoVoto": "Não", "deputado_": {"id": 204554, "nome": "Bia Lima", "siglaPartido": "PL", "siglaUf": "RJ", "urlFoto": "https://www.camara.leg.br/2.jpg"}},
        {"tipoVoto": "Abstenção", "deputado_": {"id": 3, "nome": "Caio", "siglaPartido": "MDB", "siglaUf": "BA"}},
        {"tipoVoto": "Sim", "deputado_": {"id": 4, "nome": "Duda", "siglaPartido": "PSD", "siglaUf": "MG"}}
    ]})
}

#[test]
fn voto_card_spec() {
    let v = cards::voto(&votacao(), &votos(), 204554).expect("spec");
    assert_eq!(v.deputado, "Bia Lima");
    assert_eq!(v.partido_uf, "PL-RJ");
    assert_eq!(v.voto, "Não");
    assert_eq!(v.placar, (2, 1, 1));
    assert_eq!(
        v.titulo,
        "PEC 45/2019 · Altera o Sistema Tributário Nacional."
    );
    assert_eq!(v.data, "07/07/2023");
    assert_eq!(
        v.photo_url.as_deref(),
        Some("https://www.camara.leg.br/2.jpg")
    );
    assert!(cards::voto(&votacao(), &votos(), 999).is_none());
    // Sem proposição afetada: usa a descrição.
    let bare = json!({"dados": {"descricao": "Requerimento aprovado.", "data": "2023-07-07"}});
    assert_eq!(
        cards::voto(&bare, &votos(), 1).unwrap().titulo,
        "Requerimento aprovado."
    );
}

fn eventos() -> serde_json::Value {
    json!({"dados": [
        {"id": 10, "dataHoraInicio": "2026-10-28T09:00", "descricaoTipo": "Audiência Pública", "situacao": "Agendada",
         "orgaos": [{"sigla": "CSAUDE", "nome": "Comissão de Saúde"}]},
        {"id": 11, "dataHoraInicio": "2026-10-28T13:55", "descricaoTipo": "Sessão Deliberativa Extraordinária", "situacao": "Agendada",
         "orgaos": [{"sigla": "PLEN", "nome": "Plenário"}]},
        {"id": 12, "dataHoraInicio": "2026-10-28T10:00", "descricaoTipo": "Reunião Deliberativa", "situacao": "Cancelada",
         "orgaos": [{"sigla": "CCJC", "nome": "Comissão de Constituição e Justiça"}]}
    ]})
}

#[test]
fn agenda_plenario_event_is_picked_for_pauta() {
    assert_eq!(cards::agenda_evento_principal(&eventos()), Some(11));
    assert_eq!(cards::agenda_evento_principal(&json!({"dados": []})), None);
}

#[test]
fn agenda_card_spec_prefers_pauta() {
    let pauta = json!({"dados": [
        {"ordem": 1, "titulo": "PL 2630/2020", "proposicao_": {"id": 1, "siglaTipo": "PL", "numero": 2630, "ano": 2020, "ementa": "Institui a Lei Brasileira de Liberdade, Responsabilidade e Transparência na Internet."}},
        {"ordem": 2, "titulo": "PEC 45/2019", "proposicao_": {"id": 2, "siglaTipo": "PEC", "numero": 45, "ano": 2019, "ementa": "Reforma tributária."}},
        {"ordem": 3, "titulo": "REQ 1/2026", "proposicao_": null}
    ]});
    let a = cards::agenda("2026-10-28", &eventos(), Some(&pauta)).expect("spec");
    assert_eq!(a.dia, "quarta-feira, 28 de outubro");
    assert_eq!(a.casa, "Plenário da Câmara");
    assert_eq!(a.total, 3);
    assert_eq!(a.items.len(), 3);
    assert_eq!(a.items[0].sigla, "PL 2630/2020");
    assert_eq!(a.items[0].hora, "13:55");
    assert!(a.items[0].titulo.starts_with("Institui a Lei Brasileira"));
    assert_eq!(a.items[2].sigla, "REQ 1/2026");
}

#[test]
fn agenda_card_spec_falls_back_to_events() {
    let a = cards::agenda("2026-10-28", &eventos(), None).expect("spec");
    assert_eq!(a.casa, "Câmara dos Deputados");
    assert_eq!(a.total, 2, "cancelled events are dropped");
    let siglas: Vec<_> = a.items.iter().map(|i| i.sigla.as_str()).collect();
    assert_eq!(siglas, ["CSAUDE", "Plenário"]);
    assert_eq!(a.items[1].titulo, "Sessão Deliberativa Extraordinária");
    assert_eq!(a.items[0].hora, "09:00");
    // Dia sem eventos ainda gera cartão.
    let e = cards::agenda("2026-10-28", &json!({"dados": []}), None).unwrap();
    assert!(e.items.is_empty());
    assert!(cards::agenda("2026-99-99", &eventos(), None).is_none());
}
