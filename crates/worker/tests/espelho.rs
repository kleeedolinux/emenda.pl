//! Espelho: pedido /api/{camara,senado}/* -> arquivo(s) do snapshot + montagem da resposta.
use emenda_worker::espelho::{
    ao_vivo_primeiro, montar, resolver, Casa, Filtro, Lista, Plano, SenFiltro, SenadoPlano,
};
use serde_json::{json, Value};

const HOJE: &str = "2026-10-28";
const CAM: &str = "https://dadosabertos.camara.leg.br/api/v2";

fn plano(casa: Casa, rest: &str, q: &str) -> Option<Plano> {
    resolver(casa, rest, (!q.is_empty()).then_some(q), HOJE).map(|r| r.plano)
}

fn arquivo(casa: Casa, rest: &str, q: &str) -> Option<String> {
    match plano(casa, rest, q) {
        Some(Plano::Arquivo(k)) => Some(k),
        _ => None,
    }
}

fn lista(rest: &str, q: &str) -> Lista {
    match plano(Casa::Camara, rest, q) {
        Some(Plano::Lista(l)) => l,
        p => panic!("{rest}?{q}: esperava lista, veio {p:?}"),
    }
}

#[test]
fn arquivos_camara_por_caminho() {
    let casos = [
        ("deputados/204501", "", "camara/deputados/204501.json"),
        (
            "deputados/204501/historico",
            "",
            "camara/deputados/204501/historico.json",
        ),
        (
            "deputados/204501/frentes",
            "",
            "camara/deputados/204501/frentes.json",
        ),
        (
            "deputados/204501/profissoes",
            "",
            "camara/deputados/204501/profissoes.json",
        ),
        (
            "deputados/204501/ocupacoes",
            "",
            "camara/deputados/204501/ocupacoes.json",
        ),
        ("proposicoes/2585316", "", "camara/proposicoes/2585316.json"),
        (
            "proposicoes/2585316/autores",
            "",
            "camara/proposicoes/2585316/autores.json",
        ),
        (
            "proposicoes/2585316/tramitacoes",
            "",
            "camara/proposicoes/2585316/tramitacoes.json",
        ),
        (
            "proposicoes/2585316/votacoes",
            "",
            "camara/proposicoes/2585316/votacoes.json",
        ),
        (
            "proposicoes/2585316/temas",
            "",
            "camara/proposicoes/2585316/temas.json",
        ),
        (
            "proposicoes/2585316/relacionadas",
            "",
            "camara/proposicoes/2585316/relacionadas.json",
        ),
        ("votacoes/2555417-29", "", "camara/votacoes/2555417-29.json"),
        (
            "votacoes/2555417-29/votos",
            "",
            "camara/votacoes/2555417-29/votos.json",
        ),
        (
            "votacoes/2555417-29/orientacoes",
            "",
            "camara/votacoes/2555417-29/orientacoes.json",
        ),
        ("partidos/36844", "", "camara/partidos/36844.json"),
        ("frentes/55001", "", "camara/frentes/55001.json"),
        (
            "frentes/55001/membros",
            "",
            "camara/frentes/55001/membros.json",
        ),
        ("orgaos/2003", "", "camara/orgaos/2003.json"),
        ("eventos/83095/pauta", "", "camara/eventos/83095/pauta.json"),
        (
            "referencias/proposicoes/siglaTipo",
            "",
            "camara/referencias/proposicoes/siglaTipo.json",
        ),
        (
            "referencias/proposicoes/codTema",
            "",
            "camara/referencias/proposicoes/codTema.json",
        ),
    ];
    for (rest, q, chave) in casos {
        assert_eq!(
            arquivo(Casa::Camara, rest, q).as_deref(),
            Some(chave),
            "{rest}"
        );
    }
}

#[test]
fn listas_camara_escolhem_variante_e_paginam() {
    let l = lista("deputados", "idLegislatura=57&itens=100&pagina=2");
    assert_eq!(l.chaves, ["camara/deputados@idLegislatura=57.json"]);
    assert_eq!((l.itens, l.pagina), (100, 2));
    assert!(l.filtros.is_empty());
    assert_eq!(l.base, format!("{CAM}/deputados?idLegislatura=57"));

    let l = lista("deputados", "ordem=ASC&ordenarPor=nome");
    assert_eq!(l.chaves, ["camara/deputados.json"]);
    assert_eq!(l.itens, 1000);
    assert_eq!(l.ordem, Some(("nome".into(), false)));

    let l = lista("deputados", "siglaSexo=F&idLegislatura=56");
    assert_eq!(
        l.chaves,
        ["camara/deputados@idLegislatura=56,siglaSexo=F.json"]
    );

    let l = lista("deputados", "siglaUf=sp&ordem=ASC&ordenarPor=nome");
    assert_eq!(l.chaves, ["camara/deputados.json"]);
    assert_eq!(l.filtros, [Filtro::Igual("siglaUf", "sp".into())]);

    let l = lista("deputados", "nome=Jos%C3%A9+Silva&itens=5");
    assert_eq!(l.filtros, [Filtro::Contem("nome", "José Silva".into())]);
    assert_eq!(l.itens, 5);

    let l = lista(
        "partidos",
        "idLegislatura=57&itens=100&ordem=ASC&ordenarPor=sigla",
    );
    assert_eq!(l.chaves, ["camara/partidos@idLegislatura=57.json"]);
    let l = lista("partidos", "sigla=PT&itens=100");
    assert_eq!(l.chaves, ["camara/partidos.json"]);
    assert_eq!(l.filtros, [Filtro::Igual("sigla", "PT".into())]);
    let l = lista("partidos/36844/membros", "itens=100");
    assert_eq!(l.chaves, ["camara/partidos/36844/membros.json"]);
    let l = lista("legislaturas", "itens=100");
    assert_eq!(l.chaves, ["camara/legislaturas.json"]);
    let l = lista("frentes", "idLegislatura=57");
    assert_eq!(l.chaves, ["camara/frentes@idLegislatura=57.json"]);
    let l = lista(
        "orgaos",
        "codTipoOrgao=4&dataInicio=2023-02-01&itens=100&ordem=ASC&ordenarPor=sigla",
    );
    assert_eq!(
        l.chaves,
        ["camara/orgaos@codTipoOrgao=4,dataInicio=2023-02-01.json"]
    );
    let l = lista("orgaos/2003/membros", "itens=100");
    assert_eq!(l.chaves, ["camara/orgaos/2003/membros.json"]);
    let l = lista(
        "deputados/204501/orgaos",
        "itens=100&ordem=DESC&ordenarPor=dataInicio",
    );
    assert_eq!(l.chaves, ["camara/deputados/204501/orgaos.json"]);
    assert_eq!(l.ordem, Some(("dataInicio".into(), true)));
}

#[test]
fn proposicoes_por_autor_e_por_tipo_usam_indices() {
    let l = lista(
        "proposicoes",
        "idDeputadoAutor=204501&ano=2025&ano=2026&ordem=DESC&ordenarPor=id&pagina=1&itens=50",
    );
    assert_eq!(
        l.chaves,
        [
            "camara/indices/proposicoes/autor/204501/2025.json",
            "camara/indices/proposicoes/autor/204501/2026.json"
        ]
    );
    assert_eq!(l.ordem, Some(("id".into(), true)));
    let l = lista(
        "proposicoes",
        "idDeputadoAutor=1&siglaTipo=PL%2CPEC&ano=2024",
    );
    assert_eq!(
        l.filtros,
        [Filtro::Em("siglaTipo", vec!["PL".into(), "PEC".into()])]
    );
    assert_eq!(l.ordem, Some(("id".into(), false)), "padrão da API: id ASC");

    let l = lista("proposicoes", "siglaTipo=PL&numero=2338&ano=2023");
    assert_eq!(l.chaves, ["camara/indices/proposicoes/tipo/PL/2023.json"]);
    assert_eq!(l.filtros, [Filtro::Igual("numero", "2338".into())]);
}

#[test]
fn votacoes_e_eventos_por_periodo() {
    let l = lista(
        "votacoes",
        "idOrgao=180&dataInicio=2026-08-01&dataFim=2026-10-27&itens=200&ordem=DESC&ordenarPor=dataHoraRegistro",
    );
    assert_eq!(
        l.chaves,
        [
            "camara/indices/votacoes/2026-08.json",
            "camara/indices/votacoes/2026-09.json",
            "camara/indices/votacoes/2026-10.json"
        ]
    );
    assert_eq!(
        l.filtros,
        [
            Filtro::Data("data", "2026-08-01".into(), "2026-10-27".into()),
            Filtro::UriFim("uriOrgao", "/180".into())
        ]
    );
    let l = lista(
        "eventos",
        "dataInicio=2026-09-26&dataFim=2026-10-28&ordem=ASC&ordenarPor=dataHoraInicio&itens=100&pagina=1",
    );
    assert_eq!(
        l.chaves,
        [
            "camara/eventos/mes/2026-09.json",
            "camara/eventos/mes/2026-10.json"
        ]
    );
    assert_eq!(
        l.filtros,
        [Filtro::Data(
            "dataHoraInicio",
            "2026-09-26".into(),
            "2026-10-28".into()
        )]
    );
    let l = lista(
        "orgaos/2003/eventos",
        "dataInicio=2026-10-27&dataFim=2026-10-27&itens=100",
    );
    assert_eq!(l.filtros.last(), Some(&Filtro::Orgao("2003".into())));
}

#[test]
fn sensivel_quando_o_periodo_alcanca_hoje() {
    let s = |rest: &str, q: &str| {
        resolver(Casa::Camara, rest, Some(q), HOJE)
            .unwrap()
            .sensivel
    };
    assert!(s("eventos", "dataInicio=2026-10-26&dataFim=2026-11-01"));
    assert!(!s("eventos", "dataInicio=2026-10-01&dataFim=2026-10-07"));
    assert!(s("votacoes", "dataInicio=2026-10-01&dataFim=2026-10-28"));
    assert!(!s("votacoes", "dataInicio=2026-07-01&dataFim=2026-09-30"));
    assert!(
        !resolver(Casa::Camara, "deputados/1", None, HOJE)
            .unwrap()
            .sensivel
    );
    let sen = |rest: &str| resolver(Casa::Senado, rest, None, HOJE).unwrap().sensivel;
    assert!(sen("plenario/agenda/mes/20261001.json"));
    assert!(!sen("plenario/agenda/mes/20260901.json"));
    assert!(sen("comissao/agenda/20261028/20261127.json"));
}

#[test]
fn nao_suportado_vai_ao_vivo() {
    let vivos = [
        ("deputados/1/despesas", "ano=2025"),
        ("deputados", "id=1&id=2"),
        ("deputados", "idLegislatura=56&idLegislatura=57"),
        ("deputados", "ordenarPor=siglaUf"),
        ("deputados/1", "x=1"),
        ("proposicoes", "keywords=saude&ano=2025"),
        ("proposicoes", "idDeputadoAutor=1"),
        ("proposicoes", "ano=2025"),
        ("proposicoes", "siglaTipo=REQ&ano=2025"),
        ("votacoes", ""),
        ("votacoes", "dataInicio=2020-01-01&dataFim=2026-01-01"),
        ("eventos", "dataInicio=2025-01-01&dataFim=2026-06-01"),
        ("eventos", "dataInicio=2026-13-01&dataFim=2026-13-02"),
        ("blocos", ""),
        ("deputados", "idLegislatura=../x"),
    ];
    for (rest, q) in vivos {
        assert!(
            plano(Casa::Camara, rest, q).is_none(),
            "{rest}?{q} deveria ir ao vivo"
        );
    }
    for rest in [
        "votacaoComissao/comissao/CAE",
        "senador/1/votacoes",
        "materia/1",
    ] {
        assert!(plano(Casa::Senado, rest, "").is_none(), "{rest}");
    }
}

#[test]
fn senado_mapeia_caminhos_e_consultas() {
    let casos = [
        ("senador/lista/atual", "", "senado/senador/lista/atual.json"),
        (
            "senador/lista/legislatura/45/58",
            "",
            "senado/senador/lista/legislatura/45/58.json",
        ),
        ("senador/5012", "", "senado/senador/5012.json"),
        (
            "senador/5012/mandatos",
            "",
            "senado/senador/5012/mandatos.json",
        ),
        (
            "senador/5012/comissoes",
            "",
            "senado/senador/5012/comissoes.json",
        ),
        ("senador/5012.json", "", "senado/senador/5012.json"),
        (
            "processo",
            "codigoParlamentarAutor=5012",
            "senado/processo@codigoParlamentarAutor=5012.json",
        ),
        (
            "votacao",
            "idProcesso=8664217",
            "senado/votacao@idProcesso=8664217.json",
        ),
        (
            "comissao/lista/permanente",
            "",
            "senado/comissao/lista/permanente.json",
        ),
        (
            "comissao/lista/mistas",
            "",
            "senado/comissao/lista/mistas.json",
        ),
        ("comissao/50", "", "senado/comissao/50.json"),
    ];
    for (rest, q, chave) in casos {
        assert_eq!(
            arquivo(Casa::Senado, rest, q).as_deref(),
            Some(chave),
            "{rest}?{q}"
        );
    }
    match plano(Casa::Senado, "processo", "sigla=PL&numero=1087&ano=2025") {
        Some(Plano::Senado(SenadoPlano::Itens { chaves, filtros })) => {
            assert_eq!(chaves, ["senado/indices/processo/PL/2025.json"]);
            assert_eq!(filtros, [SenFiltro::Identificacao("PL 1087/2025".into())]);
        }
        p => panic!("{p:?}"),
    }
    match plano(
        Casa::Senado,
        "votacao",
        "codigoParlamentar=5012&dataInicio=2025-03-01&dataFim=2026-02-01",
    ) {
        Some(Plano::Senado(SenadoPlano::Itens { chaves, filtros })) => {
            assert_eq!(
                chaves,
                [
                    "senado/votacao/ano/2025.json",
                    "senado/votacao/ano/2026.json"
                ]
            );
            assert_eq!(
                filtros,
                [
                    SenFiltro::Data("2025-03-01".into(), "2026-02-01".into()),
                    SenFiltro::Parlamentar("5012".into())
                ]
            );
        }
        p => panic!("{p:?}"),
    }
    match plano(Casa::Senado, "plenario/agenda/mes/20261015.json", "") {
        Some(Plano::Senado(SenadoPlano::Plenario { chave, desde })) => {
            assert_eq!(chave, "senado/plenario/agenda/mes/202610.json");
            assert_eq!(desde, "2026-10-15");
        }
        p => panic!("{p:?}"),
    }
    match plano(Casa::Senado, "comissao/agenda/20261027/20261029.json", "") {
        Some(Plano::Senado(SenadoPlano::Comissao { chaves, desde, ate })) => {
            assert_eq!(chaves, ["senado/comissao/agenda/mes/202610.json"]);
            assert_eq!((desde.as_str(), ate.as_str()), ("2026-10-27", "2026-10-29"));
        }
        p => panic!("{p:?}"),
    }
}

fn deps() -> Value {
    json!({"dados": [
        {"id": 1, "nome": "Ana", "siglaUf": "SP", "siglaPartido": "PT"},
        {"id": 2, "nome": "Bia", "siglaUf": "RJ", "siglaPartido": "PL"},
        {"id": 3, "nome": "Cássio", "siglaUf": "SP", "siglaPartido": "PL"},
        {"id": 4, "nome": "Davi", "siglaUf": "SP", "siglaPartido": "PT"},
    ]})
}

#[test]
fn montar_pagina_filtra_e_gera_links_como_a_api() {
    let p = plano(Casa::Camara, "deputados", "siglaUf=SP&itens=2&pagina=1").unwrap();
    let m = montar(&p, vec![deps()]).unwrap();
    assert_eq!(m.total, Some(3));
    assert_eq!(m.corpo["dados"].as_array().unwrap().len(), 2);
    assert_eq!(m.corpo["dados"][1]["nome"], "Cássio");
    let links = &m.corpo["links"];
    assert_eq!(
        links[0],
        json!({"rel": "self", "href": format!("{CAM}/deputados?siglaUf=SP&itens=2&pagina=1")})
    );
    assert_eq!(
        links[1],
        json!({"rel": "next", "href": format!("{CAM}/deputados?siglaUf=SP&pagina=2&itens=2")})
    );
    assert_eq!(
        links[2],
        json!({"rel": "first", "href": format!("{CAM}/deputados?siglaUf=SP&pagina=1&itens=2")})
    );
    assert_eq!(
        links[3],
        json!({"rel": "last", "href": format!("{CAM}/deputados?siglaUf=SP&pagina=2&itens=2")})
    );

    let p = plano(Casa::Camara, "deputados", "nome=cassio").unwrap();
    let m = montar(&p, vec![deps()]).unwrap();
    assert_eq!(m.corpo["dados"][0]["id"], 3, "nome sem acento/caixa");

    let p = plano(
        Casa::Camara,
        "deputados",
        "ordem=DESC&ordenarPor=nome&itens=1&pagina=2",
    )
    .unwrap();
    let m = montar(&p, vec![deps()]).unwrap();
    assert_eq!(m.corpo["dados"][0]["nome"], "Cássio");
    let rels: Vec<&str> = m.corpo["links"]
        .as_array()
        .unwrap()
        .iter()
        .map(|l| l["rel"].as_str().unwrap())
        .collect();
    assert_eq!(rels, ["self", "next", "previous", "first", "last"]);
}

#[test]
fn montar_concatena_periodos_e_filtra_orgao_e_data() {
    let p = plano(
        Casa::Camara,
        "votacoes",
        "idOrgao=180&dataInicio=2026-09-30&dataFim=2026-10-01&ordem=DESC&ordenarPor=dataHoraRegistro",
    )
    .unwrap();
    let set = json!({"dados": [
        {"id": "a", "data": "2026-09-29", "dataHoraRegistro": "2026-09-29T10:00:00", "uriOrgao": "x/orgaos/180"},
        {"id": "b", "data": "2026-09-30", "dataHoraRegistro": "2026-09-30T10:00:00", "uriOrgao": "x/orgaos/180"},
        {"id": "c", "data": "2026-09-30", "dataHoraRegistro": "2026-09-30T11:00:00", "uriOrgao": "x/orgaos/1180"},
    ]});
    let out = json!({"dados": [
        {"id": "d", "data": "2026-10-01", "dataHoraRegistro": "2026-10-01T09:00:00", "uriOrgao": "x/orgaos/180"},
    ]});
    let m = montar(&p, vec![set, out]).unwrap();
    let ids: Vec<&str> = m.corpo["dados"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v["id"].as_str().unwrap())
        .collect();
    assert_eq!(ids, ["d", "b"]);

    let p = plano(
        Casa::Camara,
        "orgaos/2003/eventos",
        "dataInicio=2026-10-27&dataFim=2026-10-27",
    )
    .unwrap();
    let dia = json!({"dados": [
        {"id": 0, "dataHoraInicio": "2026-10-26T10:00", "orgaos": [{"id": 2003}]},
        {"id": 1, "dataHoraInicio": "2026-10-27T10:00", "orgaos": [{"id": 2003}]},
        {"id": 2, "dataHoraInicio": "2026-10-27T11:00", "orgaos": [{"id": 180}]},
    ]});
    let m = montar(&p, vec![dia]).unwrap();
    assert_eq!(m.corpo["dados"].as_array().unwrap().len(), 1);
}

#[test]
fn montar_senado() {
    let p = plano(
        Casa::Senado,
        "votacao",
        "codigoParlamentar=5012&dataInicio=2025-03-01&dataFim=2025-03-31",
    )
    .unwrap();
    let ano = json!([
        {"codigoSessaoVotacao": 1, "dataSessao": "2025-02-28", "votos": [{"codigoParlamentar": 5012}]},
        {"codigoSessaoVotacao": 2, "dataSessao": "2025-03-11", "votos": [{"codigoParlamentar": 5012, "x": 1}, {"codigoParlamentar": 1}]},
        {"codigoSessaoVotacao": 3, "dataSessao": "2025-03-12", "votos": [{"codigoParlamentar": 1}]},
    ]);
    let m = montar(&p, vec![ano]).unwrap();
    assert_eq!(
        m.corpo,
        json!([{"codigoSessaoVotacao": 2, "dataSessao": "2025-03-11", "votos": [{"codigoParlamentar": 5012, "x": 1}]}])
    );

    let p = plano(Casa::Senado, "processo", "sigla=PL&numero=1087&ano=2025").unwrap();
    let idx = json!([{"identificacao": "PL 1087/2025", "id": 1}, {"identificacao": "PL 10870/2025", "id": 2}]);
    assert_eq!(
        montar(&p, vec![idx]).unwrap().corpo,
        json!([{"identificacao": "PL 1087/2025", "id": 1}])
    );

    let p = plano(Casa::Senado, "plenario/agenda/mes/20261015.json", "").unwrap();
    let mes = json!({"AgendaPlenario": {"Metadados": {"v": 1}, "Sessoes": {"Sessao": [{"Data": "2026-10-05"}, {"Data": "2026-10-20"}]}}});
    let m = montar(&p, vec![mes]).unwrap();
    assert_eq!(
        m.corpo["AgendaPlenario"]["Sessoes"]["Sessao"],
        json!([{"Data": "2026-10-20"}])
    );
    assert_eq!(m.corpo["AgendaPlenario"]["Metadados"], json!({"v": 1}));

    let p = plano(Casa::Senado, "comissao/agenda/20261030/20261102.json", "").unwrap();
    let d1 = json!({"AgendaReuniao": {"Metadados": {"v": 1}, "reunioes": {"reuniao": [
        {"codigo": "0", "dataInicio": "2026-10-29T10:00:00.000"},
        {"codigo": "1", "dataInicio": "2026-10-30T10:00:00.000"}]}}});
    let d2 = json!({"AgendaReuniao": {"Metadados": {"v": 1}, "reunioes": {"reuniao":
        {"codigo": "2", "dataInicio": "2026-11-02T09:00:00.000"}}}});
    let m = montar(&p, vec![d1, d2]).unwrap();
    let cods: Vec<&str> = m.corpo["AgendaReuniao"]["reunioes"]["reuniao"]
        .as_array()
        .unwrap()
        .iter()
        .map(|r| r["codigo"].as_str().unwrap())
        .collect();
    assert_eq!(cods, ["1", "2"]);
}

#[test]
fn arquivo_passa_intacto_e_documento_invalido_falha() {
    let p = Plano::Arquivo("camara/deputados/1.json".into());
    let doc = json!({"dados": {"id": 1}, "links": []});
    assert_eq!(montar(&p, vec![doc.clone()]).unwrap().corpo, doc);
    let p = plano(Casa::Camara, "deputados", "").unwrap();
    assert!(montar(&p, vec![json!({"erro": 1})]).is_none());
}

#[test]
fn frescor_so_importa_para_sensivel() {
    let agora = 1_761_696_000_000.0; // 2025-10-29T00:00Z
    let h = 3_600_000.0;
    let iso = |ms: f64| {
        // gerado = agora - ms
        let s = ((agora - ms) / 1000.0) as i64;
        let (d, r) = (s.div_euclid(86_400), s.rem_euclid(86_400));
        format!(
            "{}T{:02}:{:02}:00Z",
            emenda_worker::espelho::dia_civil(d),
            r / 3600,
            r % 3600 / 60
        )
    };
    assert!(!ao_vivo_primeiro(false, Some(&iso(100.0 * h)), agora));
    assert!(!ao_vivo_primeiro(true, Some(&iso(h)), agora));
    assert!(ao_vivo_primeiro(true, Some(&iso(4.0 * h)), agora));
    assert!(ao_vivo_primeiro(true, None, agora));
}
