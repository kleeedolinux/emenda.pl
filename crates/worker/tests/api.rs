use emenda_worker::api::map;
use emenda_worker::api::{
    self, cache_control, envelope, envelope_raw, error_body, etag, etag_matches, parse, scope,
    ApiError, AutoresQuery, Endpoint, Meta, Scope,
};
use serde_json::{json, Value};

fn aq(q: Option<&str>, limit: usize, offset: usize) -> Endpoint {
    Endpoint::Autores(AutoresQuery {
        q: q.map(Into::into),
        limit,
        offset,
    })
}

#[test]
fn scopes() {
    let cases = [
        ("api.emenda.online", "/", Scope::Api("")),
        ("api.emenda.online", "/v1", Scope::Api("")),
        ("api.emenda.online", "/v1/", Scope::Api("")),
        ("api.emenda.online", "/v1/meta", Scope::Api("/meta")),
        ("api.emenda.online", "/meta", Scope::ApiUnknown),
        ("api.emenda.online", "/v2/meta", Scope::ApiUnknown),
        (
            "emenda-pl.x.workers.dev",
            "/v1/ufs/SP",
            Scope::Api("/ufs/SP"),
        ),
        ("localhost:8787", "/v1", Scope::Api("")),
        ("emenda.online", "/v1x", Scope::Site),
        ("emenda.online", "/api", Scope::Site),
        ("emenda.online", "/", Scope::Site),
    ];
    for (host, path, want) in cases {
        assert_eq!(scope(host, path), want, "{host}{path}");
    }
}

#[test]
fn parses_endpoints() {
    let ok: Vec<(&str, Option<&str>, Endpoint)> = vec![
        ("", None, Endpoint::Index),
        ("/meta", None, Endpoint::Meta),
        ("/meta/", Some("x=1"), Endpoint::Meta),
        ("/brasil", None, Endpoint::Brasil),
        ("/ufs", None, Endpoint::Ufs),
        ("/ufs/sp", None, Endpoint::Uf("SP".into())),
        (
            "/municipios/3550308",
            None,
            Endpoint::Municipio("3550308".into()),
        ),
        ("/autores", None, aq(None, 50, 0)),
        (
            "/autores",
            Some("q=Silva&limit=10&offset=20&foo=bar"),
            aq(Some("SILVA"), 10, 20),
        ),
        (
            "/autores",
            Some("q=Jo%C3%A3o+da%20Silva"),
            aq(Some("JOAO DA SILVA"), 50, 0),
        ),
        ("/autores", Some("q=8100"), aq(Some("8100"), 50, 0)),
        ("/autores", Some("q=%20%21"), aq(None, 50, 0)),
        ("/autores/8100", None, Endpoint::Autor("8100".into())),
        ("/pix", None, Endpoint::Pix),
        ("/pix/2024", None, Endpoint::PixAno(2024)),
        ("/feed", None, Endpoint::Feed),
        ("/feed/202410", None, Endpoint::FeedMes("202410".into())),
        ("/abertas", None, Endpoint::Abertas),
        ("/deputados", None, Endpoint::Deputados),
        ("/deputados/204379", None, Endpoint::Deputado(204379)),
        ("/senadores", None, Endpoint::Senadores),
        ("/senadores/5012", None, Endpoint::Senador("5012".into())),
        ("/proposicoes/2270800", None, Endpoint::Proposicao(2270800)),
        (
            "/votacoes/2236186-60",
            None,
            Endpoint::Votacao("2236186-60".into()),
        ),
    ];
    for (path, q, want) in ok {
        assert_eq!(parse(path, q), Ok(want), "{path} {q:?}");
    }
    let long_q = format!("q={}", "a".repeat(600));
    let long_name = format!("q={}", "a".repeat(65));
    let err: Vec<(&str, Option<&str>, ApiError)> = vec![
        ("/nada", None, ApiError::NotFound),
        ("/ufs/SP/x", None, ApiError::NotFound),
        ("/ufs/S1", None, ApiError::NotFound),
        ("/ufs/SPX", None, ApiError::NotFound),
        ("/municipios/123", None, ApiError::NotFound),
        ("/autores/../x", None, ApiError::NotFound),
        ("/pix/24", None, ApiError::NotFound),
        ("/feed/202413", None, ApiError::NotFound),
        ("/deputados/abc", None, ApiError::NotFound),
        ("/votacoes/1-2-x", None, ApiError::NotFound),
        (
            "/meta",
            Some(long_q.as_str()),
            ApiError::BadRequest("query muito longa"),
        ),
        (
            "/autores",
            Some(long_name.as_str()),
            ApiError::BadRequest("q: máximo 64 caracteres"),
        ),
        (
            "/autores",
            Some("limit=0"),
            ApiError::BadRequest("limit: 1..=500"),
        ),
        (
            "/autores",
            Some("limit=501"),
            ApiError::BadRequest("limit: 1..=500"),
        ),
        (
            "/autores",
            Some("limit=x"),
            ApiError::BadRequest("limit: 1..=500"),
        ),
        (
            "/autores",
            Some("offset=10001"),
            ApiError::BadRequest("offset: 0..=10000"),
        ),
    ];
    for (path, q, want) in err {
        assert_eq!(parse(path, q), Err(want), "{path} {q:?}");
    }
    assert_eq!(ApiError::NotFound.status(), 404);
    assert_eq!(ApiError::BadRequest("x").status(), 400);
}

#[test]
fn canonical_paths_drop_unknown_and_sort() {
    let cases = [
        ("/meta", Some("z=1"), "/v1/meta"),
        ("", None, "/v1"),
        ("/ufs/rj", None, "/v1/ufs/RJ"),
        (
            "/autores",
            Some("offset=5&q=jo%C3%A3o&zz=1"),
            "/v1/autores?limit=50&offset=5&q=JOAO",
        ),
        (
            "/autores",
            Some("q=maria+silva"),
            "/v1/autores?limit=50&offset=0&q=MARIA%20SILVA",
        ),
        ("/autores", None, "/v1/autores?limit=50&offset=0"),
        ("/feed/202401", None, "/v1/feed/202401"),
        ("/votacoes/1-2", None, "/v1/votacoes/1-2"),
    ];
    for (path, q, want) in cases {
        assert_eq!(parse(path, q).unwrap().canonical(), want, "{path}");
    }
}

#[test]
fn data_files_and_ttls() {
    let cases: Vec<(Endpoint, Option<&str>, u32)> = vec![
        (Endpoint::Index, None, 86400),
        (Endpoint::Meta, Some("v1/meta.json"), 6 * 3600),
        (Endpoint::Brasil, Some("v1/brasil.json"), 12 * 3600),
        (Endpoint::Ufs, None, 12 * 3600),
        (Endpoint::Uf("SP".into()), Some("v1/uf/SP.json"), 12 * 3600),
        (
            Endpoint::Municipio("3550308".into()),
            Some("v1/municipio/3550308.json"),
            12 * 3600,
        ),
        (aq(None, 50, 0), None, 12 * 3600),
        (
            Endpoint::Autor("8100".into()),
            Some("v1/autor/8100.json"),
            12 * 3600,
        ),
        (Endpoint::Pix, Some("v1/pix.json"), 6 * 3600),
        (Endpoint::PixAno(2024), Some("v1/pix/2024.json"), 6 * 3600),
        (Endpoint::Feed, Some("v1/feed.json"), 6 * 3600),
        (
            Endpoint::FeedMes("202410".into()),
            Some("v1/feed/202410.json"),
            6 * 3600,
        ),
        (Endpoint::Abertas, Some("v1/abertas.json"), 6 * 3600),
        (Endpoint::Deputados, None, 12 * 3600),
        (Endpoint::Deputado(1), None, 12 * 3600),
        (Endpoint::Senadores, None, 12 * 3600),
        (Endpoint::Senador("1".into()), None, 12 * 3600),
        (Endpoint::Proposicao(1), None, 3600),
        (Endpoint::Votacao("1-2".into()), None, 3600),
    ];
    for (e, file, ttl) in cases {
        assert_eq!(e.data_file().as_deref(), file, "{e:?}");
        assert_eq!(e.ttl(), ttl, "{e:?}");
        assert!((600..=86400).contains(&e.ttl()));
    }
    assert_eq!(
        cache_control(3600),
        "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400, stale-if-error=86400"
    );
}

#[test]
fn envelopes() {
    let m = Meta {
        fonte: vec!["https://a".into()],
        atualizado: "2026-10-28T20:01:50Z".into(),
    };
    let want_meta = json!({
        "fonte": ["https://a"],
        "atualizado": "2026-10-28T20:01:50Z",
        "licenca": "GPL-3.0 (código) / dados públicos",
        "docs": "https://emenda.online/api",
    });
    let e = envelope(&json!([1]), &m);
    assert_eq!(e, json!({ "data": [1], "meta": want_meta }));
    let raw = envelope_raw(b"  {\"a\":1}\n", &m).unwrap();
    let v: Value = serde_json::from_slice(&raw).unwrap();
    assert_eq!(v, json!({ "data": {"a": 1}, "meta": want_meta }));
    assert!(envelope_raw(b"<!doctype html>", &m).is_none());
    assert!(envelope_raw(b"", &m).is_none());
    assert_eq!(
        error_body(404, "não encontrado"),
        json!({"error": "não encontrado", "status": 404, "docs": "https://emenda.online/api"})
    );
}

#[test]
fn etags() {
    let a = etag(b"hello");
    assert!(a.starts_with('"') && a.ends_with('"') && a.len() == 34);
    assert_eq!(a, etag(b"hello"));
    assert_ne!(a, etag(b"hello!"));
    let weak = format!("W/{a}");
    let list = format!("\"x\", {a}");
    for (h, want) in [
        (a.as_str(), true),
        (weak.as_str(), true),
        (list.as_str(), true),
        ("*", true),
        ("\"x\"", false),
        ("", false),
    ] {
        assert_eq!(etag_matches(h, &a), want, "{h}");
    }
}

#[test]
fn rate_keys_and_limits() {
    assert_eq!(api::rl_key(Some("1.2.3.4")), "1.2.3.4");
    assert_eq!(api::rl_key(Some(" 2001:db8::1 ")), "2001:db8::1");
    assert_eq!(api::rl_key(None), "anon");
    assert_eq!(api::rl_key(Some("")), "anon");
    assert_eq!(api::LIMIT_ALL, ("API_RL", 300, 60));
    assert_eq!(api::LIMIT_MISS, ("API_RL_MISS", 60, 10));
}

#[test]
fn index_lists_every_endpoint() {
    let v = api::index();
    let paths: Vec<&str> = v["endpoints"]
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["path"].as_str().unwrap())
        .collect();
    for p in [
        "/v1/meta",
        "/v1/brasil",
        "/v1/ufs",
        "/v1/ufs/{UF}",
        "/v1/municipios/{ibge}",
        "/v1/autores",
        "/v1/autores/{codigo}",
        "/v1/pix",
        "/v1/pix/{ano}",
        "/v1/feed",
        "/v1/feed/{YYYYMM}",
        "/v1/abertas",
        "/v1/deputados",
        "/v1/deputados/{id}",
        "/v1/senadores",
        "/v1/senadores/{codigo}",
        "/v1/proposicoes/{id}",
        "/v1/votacoes/{id}",
    ] {
        assert!(paths.contains(&p), "{p}");
    }
    assert_eq!(v["versao"], "v1");
}

// ---------- mappers ----------

fn autores() -> Value {
    json!([
        {"codigo":"1","nome":"ACÁCIO FAVACHO","chave":"ACACIO FAVACHO","n":3,"pago":100,"empenhado":200},
        {"codigo":"2","nome":"RANDOLFE RODRIGUES","chave":"RANDOLFE RODRIGUES","n":5,"pago":50,"empenhado":70},
        {"codigo":"3","nome":"BANCADA DO CEARA","chave":"BANCADA DO CEARA","n":9,"pago":10,"empenhado":20}
    ])
}

#[test]
fn autores_filter_and_page() {
    let all = autores();
    let cases: Vec<(AutoresQuery, u64, Vec<&str>)> = vec![
        (
            AutoresQuery {
                q: None,
                limit: 50,
                offset: 0,
            },
            3,
            vec!["1", "2", "3"],
        ),
        (
            AutoresQuery {
                q: None,
                limit: 1,
                offset: 1,
            },
            3,
            vec!["2"],
        ),
        (
            AutoresQuery {
                q: None,
                limit: 5,
                offset: 9,
            },
            3,
            vec![],
        ),
        (
            AutoresQuery {
                q: Some("RODRIGUES".into()),
                limit: 50,
                offset: 0,
            },
            1,
            vec!["2"],
        ),
        (
            AutoresQuery {
                q: Some("3".into()),
                limit: 50,
                offset: 0,
            },
            1,
            vec!["3"],
        ),
        (
            AutoresQuery {
                q: Some("ZZZ".into()),
                limit: 50,
                offset: 0,
            },
            0,
            vec![],
        ),
    ];
    for (q, total, codes) in cases {
        let r = map::autores(&all, &q);
        assert_eq!(r["total"], total, "{q:?}");
        assert_eq!(r["limit"], q.limit as u64);
        assert_eq!(r["offset"], q.offset as u64);
        let got: Vec<&str> = r["itens"]
            .as_array()
            .unwrap()
            .iter()
            .map(|a| a["codigo"].as_str().unwrap())
            .collect();
        assert_eq!(got, codes, "{q:?}");
    }
    let first = &map::autores(
        &all,
        &AutoresQuery {
            q: None,
            limit: 1,
            offset: 0,
        },
    )["itens"][0];
    assert_eq!(first["url"], "/v1/autores/1");
}

#[test]
fn ufs_from_brasil() {
    let b = json!({"porUf":[{"uf":"SP","nome":"São Paulo","n":2,"pago":10}]});
    assert_eq!(
        map::ufs(&b),
        json!([{"uf":"SP","nome":"São Paulo","n":2,"pago":10,"url":"/v1/ufs/SP"}])
    );
    assert_eq!(map::ufs(&json!({})), json!([]));
}

#[test]
fn deputados_cross_emendas_by_name() {
    let list = json!({"dados":[
        {"id":204379,"nome":"Acácio Favacho","siglaPartido":"MDB","siglaUf":"AP","urlFoto":"https://f/1.jpg","email":"a@x"},
        {"id":9,"nome":"Sem Emenda","siglaPartido":"PT","siglaUf":"SP","urlFoto":null,"email":null}
    ]});
    let v = map::deputados(&list, Some(&autores()));
    assert_eq!(
        v[0],
        json!({"id":204379,"nome":"Acácio Favacho","partido":"MDB","uf":"AP","foto":"https://f/1.jpg","email":"a@x",
               "emendas":{"codigo":"1","n":3,"pago":100,"empenhado":200,"url":"/v1/autores/1"},
               "url":"/v1/deputados/204379"})
    );
    assert_eq!(v[1]["emendas"], Value::Null);
    assert_eq!(v[1]["foto"], Value::Null);
    assert_eq!(map::deputados(&list, None)[0]["emendas"], Value::Null);

    let det = json!({"dados":{"id":204379,"nomeCivil":"ACÁCIO DA SILVA FAVACHO NETO","sexo":"M",
        "dataNascimento":"1983-09-28","municipioNascimento":"Macapá","ufNascimento":"AP","escolaridade":"Superior",
        "redeSocial":["https://twitter.com/x"],
        "ultimoStatus":{"nome":"Acácio Favacho","nomeEleitoral":"Acácio Favacho","siglaPartido":"MDB","siglaUf":"AP",
          "urlFoto":"https://f/1.jpg","email":null,"situacao":"Exercício","condicaoEleitoral":"Titular",
          "gabinete":{"email":"dep@x","telefone":"3215-5414"}}}});
    let d = map::deputado(&det, Some(&autores())).unwrap();
    assert_eq!(d["id"], 204379);
    assert_eq!(d["nome"], "Acácio Favacho");
    assert_eq!(d["nomeCivil"], "ACÁCIO DA SILVA FAVACHO NETO");
    assert_eq!(d["email"], "dep@x");
    assert_eq!(d["telefone"], "3215-5414");
    assert_eq!(d["situacao"], "Exercício");
    assert_eq!(
        d["nascimento"],
        json!({"data":"1983-09-28","municipio":"Macapá","uf":"AP"})
    );
    assert_eq!(d["redesSociais"], json!(["https://twitter.com/x"]));
    assert_eq!(d["emendas"]["codigo"], "1");
    assert_eq!(
        d["links"]["camara"],
        "https://www.camara.leg.br/deputados/204379"
    );
    assert_eq!(d["links"]["site"], "https://emenda.online/deputado/204379");
    assert!(map::deputado(&json!({}), None).is_none());
}

fn sen_ident(cod: &str, nome: &str) -> Value {
    json!({"IdentificacaoParlamentar":{"CodigoParlamentar":cod,"NomeParlamentar":nome,
      "NomeCompletoParlamentar":"Completo","SiglaPartidoParlamentar":"PT","UfParlamentar":"AP","SexoParlamentar":"Masculino",
      "UrlFotoParlamentar":"http://www.senado.leg.br/f.jpg","EmailParlamentar":"s@x"}})
}

#[test]
fn senadores_normalized() {
    let arr = json!({"ListaParlamentarEmExercicio":{"Parlamentares":{"Parlamentar":[sen_ident("5012","Randolfe Rodrigues"), sen_ident("1","Outro")]}}});
    let v = map::senadores(&arr, Some(&autores()));
    assert_eq!(
        v[0],
        json!({"codigo":"5012","nome":"Randolfe Rodrigues","nomeCompleto":"Completo","partido":"PT","uf":"AP",
               "sexo":"Masculino","foto":"https://www.senado.leg.br/f.jpg","email":"s@x",
               "emendas":{"codigo":"2","n":5,"pago":50,"empenhado":70,"url":"/v1/autores/2"},
               "url":"/v1/senadores/5012"})
    );
    assert_eq!(v[1]["emendas"], Value::Null);
    // single object instead of array
    let one =
        json!({"ListaParlamentarEmExercicio":{"Parlamentares":{"Parlamentar":sen_ident("7","X")}}});
    assert_eq!(map::senadores(&one, None).as_array().unwrap().len(), 1);
    assert_eq!(map::senadores(&json!({}), None), json!([]));

    let mut p = sen_ident("5012", "Randolfe Rodrigues");
    p["DadosBasicosParlamentar"] =
        json!({"DataNascimento":"1972-11-06","Naturalidade":"Garanhuns","UfNaturalidade":"PE"});
    let det = json!({"DetalheParlamentar":{"Parlamentar":p}});
    let d = map::senador(&det, Some(&autores())).unwrap();
    assert_eq!(d["codigo"], "5012");
    assert_eq!(
        d["nascimento"],
        json!({"data":"1972-11-06","municipio":"Garanhuns","uf":"PE"})
    );
    assert_eq!(d["emendas"]["codigo"], "2");
    assert_eq!(
        d["links"]["senado"],
        "https://www25.senado.leg.br/web/senadores/senador/-/perfil/5012"
    );
    assert!(map::senador(&json!({}), None).is_none());
}

#[test]
fn proposicao_normalized() {
    let p = json!({"dados":{"id":2270800,"siglaTipo":"PEC","numero":3,"ano":2021,"descricaoTipo":"Proposta de Emenda à Constituição",
      "ementa":"Altera.","dataApresentacao":"2021-02-24T11:47","urlInteiroTeor":"https://t","keywords":"A, B ,C",
      "statusProposicao":{"dataHora":"2025-09-17T00:00","siglaOrgao":"MESA","descricaoSituacao":"Arquivada",
        "descricaoTramitacao":"Recebimento","regime":"Especial","apreciacao":"Plenário","despacho":"D"}}});
    let autores = json!({"dados":[
        {"nome":"Fulano","tipo":"Deputado(a)","uri":"https://dadosabertos.camara.leg.br/api/v2/deputados/74537","proponente":1,"ordemAssinatura":1},
        {"nome":"Senado Federal","tipo":"Órgão","uri":"https://x/orgaos/1","proponente":0,"ordemAssinatura":2}
    ]});
    let v = map::proposicao(&p, Some(&autores)).unwrap();
    assert_eq!(v["id"], 2270800);
    assert_eq!(v["sigla"], "PEC 3/2021");
    assert_eq!(
        v["tipo"],
        json!({"sigla":"PEC","descricao":"Proposta de Emenda à Constituição"})
    );
    assert_eq!(v["apresentacao"], "2021-02-24T11:47");
    assert_eq!(v["situacao"]["descricao"], "Arquivada");
    assert_eq!(v["situacao"]["orgao"], "MESA");
    assert_eq!(v["keywords"], json!(["A", "B", "C"]));
    assert_eq!(v["inteiroTeor"], "https://t");
    assert_eq!(
        v["autores"][0],
        json!({"nome":"Fulano","tipo":"Deputado(a)","proponente":true,"deputadoId":74537})
    );
    assert_eq!(v["autores"][1]["deputadoId"], Value::Null);
    assert_eq!(
        v["links"]["camara"],
        "https://www.camara.leg.br/proposicoesWeb/fichadetramitacao?idProposicao=2270800"
    );
    assert_eq!(map::proposicao(&p, None).unwrap()["autores"], json!([]));
    assert!(map::proposicao(&json!({"dados":{}}), None).is_none());
}

#[test]
fn votacao_normalized() {
    let v = json!({"dados":{"id":"2236186-60","data":"2026-10-14","dataHoraRegistro":"2026-10-14T20:55:00",
        "siglaOrgao":"PLEN","descricao":"Rejeitada a Subemenda.","aprovacao":0,
        "proposicoesAfetadas":[{"id":2236186,"siglaTipo":"PLP","numero":1,"ano":2020}]}});
    let dep = |id: u64, nome: &str, p: &str, uf: &str| json!({"id":id,"nome":nome,"siglaPartido":p,"siglaUf":uf});
    let votos = json!({"dados":[
        {"tipoVoto":"Sim","deputado_":dep(1,"A","PT","SP")},
        {"tipoVoto":"Não","deputado_":dep(2,"B","PL","RJ")},
        {"tipoVoto":"Não","deputado_":dep(3,"C","PL","RJ")},
        {"tipoVoto":"Abstenção","deputado_":dep(4,"D","PT","BA")},
        {"tipoVoto":"Obstrução","deputado_":dep(5,"E","NOVO","SP")},
        {"tipoVoto":"Artigo 17","deputado_":dep(6,"F","PP","PB")}
    ]});
    let ori = json!({"dados":[
        {"orientacaoVoto":"Não","siglaPartidoBloco":"Governo"},
        {"orientacaoVoto":"","siglaPartidoBloco":"Maioria"}
    ]});
    let r = map::votacao(&v, Some(&votos), Some(&ori)).unwrap();
    assert_eq!(r["id"], "2236186-60");
    assert_eq!(r["orgao"], "PLEN");
    assert_eq!(r["aprovada"], false);
    assert_eq!(
        r["placar"],
        json!({"sim":1,"nao":2,"abstencao":1,"obstrucao":1,"outros":1,"total":6})
    );
    assert_eq!(
        r["porPartido"],
        json!([
            {"partido":"PL","sim":0,"nao":2,"abstencao":0,"obstrucao":0,"outros":0,"total":2},
            {"partido":"PT","sim":1,"nao":0,"abstencao":1,"obstrucao":0,"outros":0,"total":2},
            {"partido":"NOVO","sim":0,"nao":0,"abstencao":0,"obstrucao":1,"outros":0,"total":1},
            {"partido":"PP","sim":0,"nao":0,"abstencao":0,"obstrucao":0,"outros":1,"total":1}
        ])
    );
    assert_eq!(
        r["votos"][1],
        json!({"deputadoId":2,"nome":"B","partido":"PL","uf":"RJ","voto":"Não"})
    );
    assert_eq!(
        r["orientacoes"],
        json!([{"bancada":"Governo","orientacao":"Não"}])
    );
    assert_eq!(
        r["proposicoes"],
        json!([{"id":2236186,"sigla":"PLP 1/2020","url":"/v1/proposicoes/2236186"}])
    );
    let empty = map::votacao(&v, None, None).unwrap();
    assert_eq!(empty["placar"]["total"], 0);
    assert_eq!(empty["votos"], json!([]));
    let aprov = json!({"dados":{"id":"1-1","aprovacao":1}});
    assert_eq!(map::votacao(&aprov, None, None).unwrap()["aprovada"], true);
    let unknown = json!({"dados":{"id":"1-1","aprovacao":null}});
    assert_eq!(
        map::votacao(&unknown, None, None).unwrap()["aprovada"],
        Value::Null
    );
    assert!(map::votacao(&json!({}), None, None).is_none());
}
