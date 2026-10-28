//! Port of apps/web/src/features/legislativo/normas.test.ts (same cases).
use emenda_worker::api::normas::{
    desfecho, links_norma, norma_da_tramitacao, parse_norma_gerada, presidente_na_data, Entrada,
    Norma, Tramite, Veto,
};

fn norma(tipo: &'static str, rotulo: &'static str, numero: u64, data: &str) -> Norma {
    Norma {
        tipo,
        rotulo,
        numero,
        data: data.into(),
    }
}

#[test]
fn presidente_por_data() {
    for (d, nome) in [
        ("2024-06-27", "Luiz Inácio Lula da Silva"),
        ("2023-01-01", "Luiz Inácio Lula da Silva"),
        ("2022-12-31", "Jair Bolsonaro"),
        ("2019-01-01", "Jair Bolsonaro"),
        ("2018-12-31", "Michel Temer"),
        ("2016-08-31", "Michel Temer"),
        ("2016-05-11", "Dilma Rousseff"),
        ("2011-01-01", "Dilma Rousseff"),
        ("2010-12-31", "Luiz Inácio Lula da Silva"),
        ("2003-01-01", "Luiz Inácio Lula da Silva"),
        ("1995-01-01", "Fernando Henrique Cardoso"),
    ] {
        assert_eq!(presidente_na_data(d).map(|p| p.nome), Some(nome), "{d}");
    }
    assert!(presidente_na_data("2016-06-01").unwrap().interino);
    assert!(presidente_na_data("1980-01-01").is_none());
}

#[test]
fn parse_norma() {
    let cases = [
        (
            "Lei nº 14.902 de 27/06/2024",
            norma("lei", "Lei", 14902, "2024-06-27"),
        ),
        (
            "Emenda Constitucional nº 132 de 20/12/2023",
            norma(
                "emenda.constitucional",
                "Emenda Constitucional",
                132,
                "2023-12-20",
            ),
        ),
        (
            "Lei Complementar nº 200 de 30/08/2023",
            norma("lei.complementar", "Lei Complementar", 200, "2023-08-30"),
        ),
        (
            "Decreto Legislativo nº 5 de 01/02/2024",
            norma(
                "decreto.legislativo",
                "Decreto Legislativo",
                5,
                "2024-02-01",
            ),
        ),
    ];
    for (s, want) in cases {
        assert_eq!(parse_norma_gerada(s), Some(want), "{s}");
    }
    assert_eq!(parse_norma_gerada(""), None);
}

#[test]
fn links() {
    let l = links_norma(&norma("lei", "Lei", 14902, "2024-06-27"));
    assert_eq!(
        l.lexml,
        "https://www.lexml.gov.br/urn/urn:lex:br:federal:lei:2024-06-27;14902"
    );
    assert_eq!(
        l.normas,
        "https://normas.leg.br/?urn=urn:lex:br:federal:lei:2024-06-27;14902"
    );
    assert_eq!(
        l.planalto.as_deref(),
        Some("https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2024/lei/l14902.htm")
    );
    assert_eq!(
        links_norma(&norma("lei", "Lei", 14133, "2021-04-01"))
            .planalto
            .as_deref(),
        Some("https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm")
    );
    assert_eq!(
        links_norma(&norma(
            "lei.complementar",
            "Lei Complementar",
            200,
            "2023-08-30"
        ))
        .planalto
        .as_deref(),
        Some("https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp200.htm")
    );
    assert_eq!(
        links_norma(&norma(
            "emenda.constitucional",
            "Emenda Constitucional",
            132,
            "2023-12-20"
        ))
        .planalto
        .as_deref(),
        Some("https://www.planalto.gov.br/ccivil_03/constituicao/emendas/emc/emc132.htm")
    );
    assert_eq!(
        links_norma(&norma(
            "decreto.legislativo",
            "Decreto Legislativo",
            5,
            "2024-02-01"
        ))
        .planalto,
        None
    );
}

fn cam(s: &str) -> Entrada {
    Entrada {
        situacao_camara: Some(s.into()),
        ..Default::default()
    }
}
fn sen(s: &str) -> Entrada {
    Entrada {
        situacao_senado: Some(s.into()),
        ..Default::default()
    }
}

#[test]
fn desfechos() {
    let cases = [
        (cam("Transformado em Norma Jurídica"), "lei"),
        (
            sen("TRANSFORMADA EM NORMA JURÍDICA COM VETO PARCIAL"),
            "lei",
        ),
        (cam("Arquivada"), "arquivada"),
        (cam("Vetado totalmente"), "vetada"),
        (sen("VETADO TOTALMENTE"), "vetada"),
        (cam("Rejeitada"), "rejeitada"),
        (cam("Aguardando Deliberação"), "tramitando"),
        (cam("Transformado em nova proposição"), "tramitando"),
    ];
    for (e, want) in cases {
        assert_eq!(desfecho(&e).tipo, want, "{e:?}");
    }
    let d = desfecho(&Entrada {
        situacao_senado: Some("TRANSFORMADA EM NORMA JURÍDICA COM VETO PARCIAL".into()),
        norma_gerada: Some("Lei nº 14.902 de 27/06/2024".into()),
        ..Default::default()
    });
    assert_eq!(d.veto, Some(Veto::Parcial));
    assert_eq!(d.norma.as_ref().map(|n| n.numero), Some(14902));
    assert_eq!(
        d.presidente.map(|p| p.nome),
        Some("Luiz Inácio Lula da Silva")
    );

    let d = desfecho(&Entrada {
        situacao_camara: Some("Transformado em Norma Jurídica".into()),
        norma: Some(norma("lei", "Lei", 14701, "2023-10-20")),
        veto: Some(Veto::Parcial),
        ..Default::default()
    });
    assert_eq!(
        (
            d.norma.map(|n| n.numero),
            d.veto,
            d.presidente.map(|p| p.nome)
        ),
        (
            Some(14701),
            Some(Veto::Parcial),
            Some("Luiz Inácio Lula da Silva")
        )
    );

    let d = desfecho(&Entrada {
        situacao_senado: Some("TRANSFORMADA EM NORMA JURÍDICA".into()),
        norma_gerada: Some("Emenda Constitucional nº 132 de 20/12/2023".into()),
        ..Default::default()
    });
    assert!(d.presidente.is_none());
    assert!(d.promulgada_congresso);
}

fn t(data: &str, desc: &str, desp: &str) -> Tramite {
    Tramite {
        data_hora: data.into(),
        descricao: desc.into(),
        despacho: desp.into(),
    }
}

#[test]
fn norma_na_tramitacao() {
    let r = norma_da_tramitacao(&[
        t(
            "2024-06-18T00:00",
            "Expedição de Documento",
            "Remessa dos Autógrafos à sanção",
        ),
        t(
            "2024-06-27T00:00",
            "Transformado em Norma Jurídica com Veto Parcial",
            "Transformado na Lei Ordinária 14902/2024. DOU 28/04/24. Vetado parcialmente.",
        ),
        t(
            "2025-06-30T00:00",
            "Apresentação de Proposição",
            "Recebido Ofício que comunica a Rejeição de Veto a Projeto de Lei (PL 914-2024).",
        ),
    ]);
    assert_eq!(r.norma, Some(norma("lei", "Lei", 14902, "2024-06-27")));
    assert_eq!(r.veto, Some(Veto::Parcial));
    assert!(r.veto_derrubado);
    for (desp, tipo, n) in [
        (
            "Transformado na Lei Complementar 200/2023.",
            "lei.complementar",
            200,
        ),
        (
            "Transformado na Emenda Constitucional 132/2023.",
            "emenda.constitucional",
            132,
        ),
        (
            "Transformado no Decreto Legislativo 5/2024",
            "decreto.legislativo",
            5,
        ),
    ] {
        let r = norma_da_tramitacao(&[t(
            "2023-12-20T00:00",
            "Transformado em Norma Jurídica",
            desp,
        )]);
        assert_eq!(
            r.norma.map(|x| (x.tipo, x.numero)),
            Some((tipo, n)),
            "{desp}"
        );
    }
    assert!(
        norma_da_tramitacao(&[t("2023-01-01T00:00", "Apresentação", "x")])
            .norma
            .is_none()
    );
}
