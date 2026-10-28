//! Handlers end to end (resolve -> run/need loop -> render) with upstream fixtures.
use emenda_worker::api::plan::{run, Ctx, Fetch, Now, Step};
use emenda_worker::api::registry::resolve;
use emenda_worker::api::render::render;
use emenda_worker::api::ApiError;
use serde_json::{json, Value};

type Fx = Vec<(Fetch, Result<Value, u16>)>;
type Out = Result<(String, String), ApiError>;

fn d(p: &str) -> Fetch {
    Fetch::Data(p.into())
}
fn c(p: &str) -> Fetch {
    Fetch::Camara(p.into())
}
fn s(p: &str) -> Fetch {
    Fetch::Senado(p.into())
}
fn meta() -> (Fetch, Result<Value, u16>) {
    (
        d("v1/meta.json"),
        Ok(json!({"generatedAt": "2026-10-28T20:31:24Z"})),
    )
}

/// Runs a request; returns (content-type, body) or the error, plus the fetch rounds.
fn exec(path: &str, q: &str, fx: &Fx) -> (Out, Vec<Vec<Fetch>>) {
    let req = resolve(path, Some(q)).unwrap_or_else(|e| panic!("{path}?{q}: {e:?}"));
    let mut ctx = Ctx::new(Now {
        iso: "2026-10-28T21:00:00Z".into(),
        today: "2026-10-28".into(),
    });
    let mut rounds = vec![];
    for _ in 0..10 {
        match run(&req, &ctx) {
            Step::Need(fs) => {
                for f in &fs {
                    let (_, r) = fx
                        .iter()
                        .find(|(k, _)| k == f)
                        .unwrap_or_else(|| panic!("{path}: unexpected fetch {f:?}"));
                    ctx.put(f.clone(), r.clone().map(|v| v.to_string().into_bytes()));
                }
                rounds.push(fs);
            }
            Step::Done(r) => {
                let out = r
                    .and_then(|done| render(&req, done))
                    .map(|x| (x.ctype.to_string(), String::from_utf8(x.bytes).unwrap()));
                return (out, rounds);
            }
        }
    }
    panic!("{path}: too many rounds");
}

fn ok(path: &str, q: &str, fx: &Fx) -> Value {
    let (r, _) = exec(path, q, fx);
    let (ct, body) = r.unwrap_or_else(|e| panic!("{path}?{q}: {e:?}"));
    assert!(ct.starts_with("application/json"), "{ct}");
    serde_json::from_str(&body).unwrap()
}

fn codes(v: &Value, key: &str) -> Vec<String> {
    v.as_array()
        .unwrap()
        .iter()
        .map(|x| {
            x[key]
                .as_str()
                .map(String::from)
                .unwrap_or_else(|| x[key].to_string())
        })
        .collect()
}

fn autores() -> Value {
    json!([
        {"codigo":"1","nome":"ACÁCIO FAVACHO","chave":"ACACIO FAVACHO","n":3,"pago":100,"empenhado":200},
        {"codigo":"2","nome":"RANDOLFE RODRIGUES","chave":"RANDOLFE RODRIGUES","n":5,"pago":50,"empenhado":70},
        {"codigo":"3","nome":"BANCADA DO CEARA","chave":"BANCADA DO CEARA","n":9,"pago":10,"empenhado":20}
    ])
}

#[test]
fn autores_keep_legacy_shape_with_paginacao() {
    let fx: Fx = vec![(d("v1/autores.json"), Ok(autores())), meta()];
    let cases: &[(&str, u64, &[&str])] = &[
        ("", 3, &["1", "2", "3"]),
        ("limit=1&offset=1", 3, &["2"]),
        ("limit=5&offset=9", 3, &[]),
        ("q=rodrigues", 1, &["2"]),
        ("q=Rodr%C3%ADgues", 1, &["2"]),
        ("q=3", 1, &["3"]),
        ("q=zzz", 0, &[]),
        ("ordem=-n", 3, &["3", "2", "1"]),
        ("ordem=nome", 3, &["1", "3", "2"]),
    ];
    for (q, total, want) in cases {
        let v = ok("/autores", q, &fx);
        assert_eq!(v["data"]["total"], *total, "{q}");
        assert_eq!(codes(&v["data"]["itens"], "codigo"), want.to_vec(), "{q}");
        assert_eq!(v["meta"]["paginacao"]["total"], *total, "{q}");
        assert_eq!(v["meta"]["atualizado"], "2026-10-28T20:31:24Z");
    }
    let v = ok("/autores", "limit=1", &fx);
    assert_eq!(v["data"]["itens"][0]["url"], "/v1/autores/1");
    assert_eq!(
        v["meta"]["paginacao"]["proximo"],
        "/v1/autores?limit=1&offset=1"
    );
    assert_eq!(
        v["meta"]["fonte"],
        json!(["https://portaldatransparencia.gov.br/download-de-dados/emendas-parlamentares"])
    );
}

fn municipio() -> Value {
    json!({
        "ibge": "3550308", "nome": "São Paulo", "uf": "SP",
        "prefeito": {"nome": "RICARDO NUNES", "partido": "MDB"},
        "emendas": [
            {"codigo": "a", "ano": 2024, "tipo": "pix", "autor": {"codigo": "1", "nome": "X"}, "uf": "SP", "ibge": "3550308", "funcao": "Saúde", "pago": 10, "empenhado": 30},
            {"codigo": "b", "ano": 2025, "tipo": "individual", "autor": {"codigo": "2", "nome": "Y"}, "uf": "SP", "ibge": "3550308", "funcao": "Educação", "pago": 50, "empenhado": 60},
            {"codigo": "c", "ano": 2024, "tipo": "individual", "autor": {"codigo": "2", "nome": "Y"}, "uf": "SP", "ibge": "3550308", "funcao": "Saúde, \"básica\"", "pago": 20, "empenhado": 20}
        ],
        "favorecidos": [{"nome": "A", "valor": 1}, {"nome": "B", "valor": 9}],
        "convenios": [{"numero": "1", "valor": 5, "data": "2020-01-01"}]
    })
}

#[test]
fn municipio_subresources_filter_sort_project_csv() {
    let fx: Fx = vec![(d("v1/municipio/3550308.json"), Ok(municipio())), meta()];
    let p = "/municipios/3550308/emendas";
    let cases: &[(&str, &[&str])] = &[
        ("", &["a", "b", "c"]),
        ("ano=2024", &["a", "c"]),
        ("tipo=individual&ordem=-pago", &["b", "c"]),
        ("autor=1", &["a"]),
        ("ordem=pago", &["a", "c", "b"]),
        ("limit=1&offset=2", &["c"]),
    ];
    for (q, want) in cases {
        assert_eq!(
            codes(&ok(p, q, &fx)["data"], "codigo"),
            want.to_vec(),
            "{q}"
        );
    }
    let v = ok(p, "campos=codigo,autor.nome&limit=1", &fx);
    assert_eq!(v["data"], json!([{"codigo": "a", "autor": {"nome": "X"}}]));
    assert_eq!(
        v["meta"]["paginacao"],
        json!({"total": 3, "limit": 1, "offset": 0, "proximo": "/v1/municipios/3550308/emendas?campos=codigo,autor.nome&limit=1&offset=1"})
    );
    let (r, _) = exec(
        p,
        "formato=csv&ano=2024&campos=codigo,funcao,autor.codigo",
        &fx,
    );
    let (ct, body) = r.unwrap();
    assert_eq!(ct, "text/csv; charset=utf-8");
    assert_eq!(
        body,
        "codigo,funcao,autor.codigo\r\na,Saúde,1\r\nc,\"Saúde, \"\"básica\"\"\",2\r\n"
    );
    assert_eq!(
        codes(
            &ok("/municipios/3550308/favorecidos", "ordem=-valor", &fx)["data"],
            "nome"
        ),
        vec!["B", "A"]
    );
    assert_eq!(
        ok("/municipios/3550308/prefeito", "", &fx)["data"]["nome"],
        "RICARDO NUNES"
    );
    assert_eq!(
        ok("/municipios/3550308/convenios", "", &fx)["data"][0]["numero"],
        "1"
    );
}

#[test]
fn raw_passthrough_and_rows_csv() {
    let feed = json!({"ultimoMes": 202610, "itens": [{"mes": 202610, "valor": 5, "favorecido": {"nome": "=cmd"}}]});
    let fx: Fx = vec![
        (d("v1/feed.json"), Ok(feed.clone())),
        meta(),
        (d("v1/meta.json"), Ok(json!({"generatedAt": "G"}))),
    ];
    let v = ok("/feed", "", &fx);
    assert_eq!(v["data"], feed);
    let (r, rounds) = exec("/feed", "formato=csv", &fx);
    assert_eq!(
        r.unwrap().1,
        "favorecido.nome,mes,valor\r\n'=cmd,202610,5\r\n"
    );
    assert_eq!(
        rounds,
        vec![vec![d("v1/feed.json")], vec![d("v1/meta.json")]]
    );
    let v = ok(
        "/meta",
        "",
        &vec![(d("v1/meta.json"), Ok(json!({"generatedAt": "X"})))],
    );
    assert_eq!(v["meta"]["atualizado"], "X");
    // upstream 404 -> 404; other failures -> 502
    let (r, _) = exec("/ufs/SP", "", &vec![(d("v1/uf/SP.json"), Err(404))]);
    assert_eq!(r.unwrap_err(), ApiError::UpstreamNotFound);
    let (r, _) = exec("/ufs/SP", "", &vec![(d("v1/uf/SP.json"), Err(500))]);
    assert_eq!(r.unwrap_err().status(), 502);
}

#[test]
fn emendas_search_needs_an_index() {
    let (r, rounds) = exec("/emendas", "uf=SP", &vec![]);
    assert!(matches!(r, Err(ApiError::BadRequest(_))));
    assert!(rounds.is_empty());
    let pix = json!({"ano": 2024, "itens": [{"codigo": "p1", "uf": "PI", "pago": 1}, {"codigo": "p2", "uf": "RO", "pago": 2}]});
    let fx: Fx = vec![(d("v1/pix/2024.json"), Ok(pix)), meta()];
    let v = ok("/emendas", "tipo=pix&ano=2024&uf=RO", &fx);
    assert_eq!(
        v["data"],
        json!([{"codigo": "p2", "uf": "RO", "pago": 2, "ano": 2024, "tipo": "pix"}])
    );
    let fx: Fx = vec![(d("v1/municipio/3550308.json"), Ok(municipio())), meta()];
    assert_eq!(
        codes(
            &ok("/emendas", "municipio=3550308&q=saude", &fx)["data"],
            "codigo"
        ),
        vec!["a", "c"]
    );
}

#[test]
fn deputado_emendas_crosses_name_in_rounds() {
    let dep = json!({"dados": {"id": 1, "nomeCivil": "Acácio da Silva Favacho Neto", "ultimoStatus": {"nome": "Acácio Favacho", "nomeEleitoral": "ACÁCIO FAVACHO"}}});
    let autor = json!({"emendas": [{"codigo": "e1", "ano": 2024, "tipo": "individual", "uf": "AP"}, {"codigo": "e2", "ano": 2023, "tipo": "individual", "uf": "AP"}]});
    let fx: Fx = vec![
        (c("deputados/1"), Ok(dep)),
        (d("v1/autores.json"), Ok(autores())),
        (d("v1/autor/1.json"), Ok(autor)),
        meta(),
    ];
    let (r, rounds) = exec("/deputados/1/emendas", "ano=2024", &fx);
    let v: Value = serde_json::from_str(&r.unwrap().1).unwrap();
    assert_eq!(codes(&v["data"], "codigo"), vec!["e1"]);
    assert_eq!(rounds.len(), 4, "{rounds:?}");
    assert!(v["meta"]["fonte"].as_array().unwrap().contains(&json!(
        "https://dadosabertos.camara.leg.br/api/v2/deputados/1"
    )));
}

#[test]
fn gastos_ranking_valor_ano() {
    let rk = json!({"parlamentares": [
        {"casa": "camara", "id": "1", "nome": "A", "uf": "SP", "partido": "PT", "emExercicio": true, "mandato": 5, "porAno": {"2024": 10}},
        {"casa": "senado", "id": "2", "nome": "B", "uf": "RJ", "partido": "PL", "emExercicio": true, "mandato": 9, "porAno": {"2024": 30}},
        {"casa": "camara", "id": "3", "nome": "C", "uf": "SP", "partido": "pt", "emExercicio": false, "mandato": 1, "porAno": {}}
    ]});
    let fx: Fx = vec![(d("v1/gastos/ranking.json"), Ok(rk)), meta()];
    let v = ok("/gastos/ranking", "ano=2024&ordem=-valorAno", &fx);
    assert_eq!(codes(&v["data"], "id"), vec!["2", "1", "3"]);
    assert_eq!(v["data"][0]["url"], "/v1/gastos/senadores/2");
    assert_eq!(v["data"][2]["valorAno"], 0);
    assert_eq!(
        codes(&ok("/gastos/ranking", "partido=PT", &fx)["data"], "id"),
        vec!["1", "3"]
    );
    assert_eq!(
        codes(
            &ok("/gastos/ranking", "casa=camara&exercicio=true", &fx)["data"],
            "id"
        ),
        vec!["1"]
    );
}

#[test]
fn municipios_list_from_asset() {
    let all = json!([
        [1100015, "Alta Floresta D'Oeste", "RO"],
        [3550308, "São Paulo", "SP"],
        [3304557, "Rio de Janeiro", "RJ"]
    ]);
    let fx: Fx = vec![(Fetch::Asset("/geo/municipios.json".into()), Ok(all))];
    let v = ok("/municipios", "q=sao%20paulo", &fx);
    assert_eq!(
        v["data"],
        json!([{"ibge": "3550308", "nome": "São Paulo", "uf": "SP", "url": "/v1/municipios/3550308"}])
    );
    assert_eq!(
        v["meta"]["fonte"],
        json!(["https://servicodados.ibge.gov.br/api/v1/localidades/municipios"])
    );
    assert_eq!(
        codes(&ok("/municipios", "uf=RO", &fx)["data"], "ibge"),
        vec!["1100015"]
    );
    assert_eq!(v["meta"]["atualizado"], "2026-10-28T21:00:00Z");
}

#[test]
fn proposicao_resultado_lei_com_veto() {
    let p = json!({"dados": {"id": 9, "siglaTipo": "PL", "numero": 914, "ano": 2024, "statusProposicao": {"descricaoSituacao": "Transformado em Norma Jurídica"}}});
    let t = json!({"dados": [
        {"dataHora": "2024-06-27T00:00", "descricaoTramitacao": "Transformado em Norma Jurídica com Veto Parcial", "despacho": "Transformado na Lei Ordinária 14902/2024. Vetado parcialmente."}
    ]});
    let fx: Fx = vec![
        (c("proposicoes/9"), Ok(p)),
        (c("proposicoes/9/tramitacoes"), Ok(t)),
    ];
    let v = ok("/proposicoes/9/resultado", "", &fx)["data"].clone();
    assert_eq!(v["tipo"], "lei");
    assert_eq!(v["veto"], "parcial");
    assert_eq!(v["norma"]["numero"], 14902);
    assert_eq!(
        v["norma"]["links"]["planalto"],
        "https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2024/lei/l14902.htm"
    );
    assert_eq!(v["presidente"]["nome"], "Luiz Inácio Lula da Silva");
    assert_eq!(v["proposicao"]["sigla"], "PL 914/2024");
}

#[test]
fn agenda_merges_houses_in_window() {
    let cam = json!({"dados": [
        {"id": 1, "dataHoraInicio": "2026-10-29T10:00", "situacao": "Convocada", "descricaoTipo": "Sessão Deliberativa", "orgaos": [{"sigla": "PLEN", "nome": "Plenário"}]},
        {"id": 2, "dataHoraInicio": "2026-11-20T10:00", "descricaoTipo": "Reunião", "orgaos": [{"sigla": "CCJC", "nome": "CCJ"}]}
    ], "links": []});
    let plen = json!({"AgendaPlenario": {"Sessoes": {"Sessao": {"Data": "2026-10-28", "Hora": "14:00", "CodigoSessao": "7", "TipoSessao": "SESSÃO NÃO DELIBERATIVA", "Casa": "SF",
        "Materias": {"Materia": {"CodigoMateria": "55", "DescricaoIdentificacaoMateria": "PL 1/2026", "Ementa": "Ementa"}}}}}});
    let com = json!({"AgendaReuniao": {"reunioes": {"reuniao": [{"codigo": "9", "dataInicio": "2026-10-30T09:00:00", "titulo": "Reunião CAE", "realizada": "false", "colegiadoCriador": {"sigla": "CAE", "nome": "Assuntos Econômicos"}}]}}});
    let fx: Fx = vec![
        (c("eventos?dataInicio=2026-10-28&dataFim=2026-11-03&ordem=ASC&ordenarPor=dataHoraInicio&itens=100&pagina=1"), Ok(cam)),
        (s("plenario/agenda/mes/20261028.json"), Ok(plen)),
        (s("plenario/agenda/mes/20261101.json"), Err(500)),
        (s("comissao/agenda/20261028/20261103.json"), Ok(com)),
    ];
    let v = ok("/agenda", "", &fx);
    assert_eq!(
        codes(&v["data"], "id"),
        vec!["senado-7", "camara-1", "senado-r9"]
    );
    assert_eq!(v["data"][0]["deliberativa"], false);
    assert_eq!(v["data"][0]["materias"][0]["sigla"], "PL 1/2026");
    assert_eq!(v["data"][1]["ambito"], "plenario");
    assert_eq!(v["data"][1]["deliberativa"], true);
    let v = ok("/agenda", "casa=senado", &fx);
    assert_eq!(codes(&v["data"], "casa"), vec!["senado", "senado"]);
    let (r, _) = exec("/agenda", "de=2026-10-01&ate=2026-12-01", &fx);
    assert_eq!(
        r.unwrap_err(),
        ApiError::BadRequest("período: máximo 31 dias".into())
    );
}

#[test]
fn deputado_votos_reads_each_nominal_vote() {
    let lista = json!({"dados": [
        {"id": "10-1", "data": "2026-10-20", "descricao": "Aprovado. Sim: 300; Não: 100; Abstenção: 2; Total: 402"},
        {"id": "10-2", "data": "2026-10-19", "descricao": "Aprovada a redação final"},
        {"id": "10-3", "data": "2026-10-18", "descricao": "Rejeitado. Sim: 10; Não: 400; Total: 410"}
    ]});
    let fx: Fx = vec![
        (c("votacoes?idOrgao=180&dataInicio=2026-08-29&dataFim=2026-10-28&itens=200&ordem=DESC&ordenarPor=dataHoraRegistro"), Ok(lista)),
        (c("votacoes/10-1/votos"), Ok(json!({"dados": [{"tipoVoto": "Sim", "deputado_": {"id": 7, "siglaPartido": "PT"}}]}))),
        (c("votacoes/10-3/votos"), Ok(json!({"dados": []}))),
    ];
    let v = ok("/deputados/7/votos", "", &fx);
    assert_eq!(codes(&v["data"], "voto"), vec!["Sim", "Sem registro"]);
    assert_eq!(
        v["data"][0]["placar"],
        json!({"sim": 300, "nao": 100, "abstencao": 2, "total": 402})
    );
    assert_eq!(v["data"][0]["partidoNaData"], "PT");
    assert_eq!(v["meta"]["paginacao"]["total"], 2);
}

#[test]
fn proposicoes_search_maps_to_camara() {
    let fx: Fx = vec![(
        c("proposicoes?siglaTipo=PL&keywords=sa%C3%BAde&ano=2025&ano=2026&ordem=DESC&ordenarPor=id&itens=20&pagina=2"),
        Ok(json!({"dados": [{"id": 5, "siglaTipo": "PL", "numero": 1, "ano": 2026, "ementa": "E"}], "links": [{"rel": "next", "href": "x"}]})),
    )];
    let v = ok("/proposicoes", "tipo=pl&q=sa%C3%BAde&offset=20", &fx);
    assert_eq!(v["data"][0]["sigla"], "PL 1/2026");
    assert_eq!(v["meta"]["paginacao"]["total"], Value::Null);
    let fx: Fx = vec![(
        c("proposicoes?siglaTipo=PL&numero=2630&ordem=ASC&ordenarPor=ano&itens=20&pagina=1"),
        Ok(json!({"dados": []})),
    )];
    assert_eq!(
        ok("/proposicoes", "tipo=PL&numero=2630&ordem=ano", &fx)["meta"]["paginacao"]["total"],
        0
    );
}

#[test]
fn busca_groups_results() {
    use emenda_worker::api::busca::sigla_proposicao;
    assert_eq!(
        sigla_proposicao("PL 2630/2020"),
        Some(("PL".into(), 2630, 2020))
    );
    assert_eq!(
        sigla_proposicao("pec 45 2019"),
        Some(("PEC".into(), 45, 2019))
    );
    assert_eq!(sigla_proposicao("Recife"), None);
    let fx: Fx = vec![
        (d("v1/autores.json"), Ok(autores())),
        (
            Fetch::Asset("/geo/municipios.json".into()),
            Ok(json!([[2611606, "Recife", "PE"]])),
        ),
        (
            c("deputados?ordem=ASC&ordenarPor=nome"),
            Ok(
                json!({"dados": [{"id": 1, "nome": "Túlio Gadêlha", "siglaPartido": "REDE", "siglaUf": "PE"}]}),
            ),
        ),
        (s("senador/lista/atual"), Err(500)),
        meta(),
    ];
    let v = ok("/busca", "q=recife", &fx)["data"].clone();
    assert_eq!(v["municipios"][0]["ibge"], "2611606");
    let v = ok("/busca", "q=rede", &fx)["data"].clone();
    assert_eq!(v["partidos"][0]["sigla"], "REDE");
    assert_eq!(v["federacoes"][0]["id"], "psol-rede");
    let mut fx2: Fx = fx
        .iter()
        .filter(|(f, _)| *f != d("v1/autores.json"))
        .cloned()
        .collect();
    fx2.push((
        d("v1/autores.json"),
        Ok(json!([{"codigo": "9", "nome": "PLINIO VALERIO", "chave": "PLINIO VALERIO"}])),
    ));
    fx2.push((c("proposicoes?siglaTipo=PL&numero=2630&ano=2020"), Ok(json!({"dados": [{"id": 2256735, "siglaTipo": "PL", "numero": 2630, "ano": 2020, "ementa": "E"}]}))));
    let v = ok("/busca", "q=PL%202630/2020", &fx2)["data"].clone();
    assert_eq!(v["proposicoes"][0]["sigla"], "PL 2630/2020");
    assert_eq!(v["autores"], json!([]), "a sigla is not a name search");
    let v = ok("/busca", "q=pernambuco", &fx)["data"].clone();
    assert_eq!(v["ufs"][0]["uf"], "PE");
}

#[test]
fn index_and_openapi_need_no_upstream() {
    let (r, rounds) = exec("", "", &vec![]);
    assert!(rounds.is_empty());
    let v: Value = serde_json::from_str(&r.unwrap().1).unwrap();
    assert_eq!(v["data"]["versao"], "v1");
    let (r, _) = exec("/openapi.json", "", &vec![]);
    let v: Value = serde_json::from_str(&r.unwrap().1).unwrap();
    assert_eq!(v["openapi"], "3.1.0", "bare document, no envelope");
}
