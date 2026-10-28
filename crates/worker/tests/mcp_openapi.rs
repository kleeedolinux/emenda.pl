//! MCP JSON-RPC handling, the route rule shared with WebMCP, and the generated OpenAPI spec.
use emenda_worker::api::openapi::spec;
use emenda_worker::api::registry::{resolve, OPS};
use emenda_worker::feeds::FEEDS;
use emenda_worker::mcp::{call_result, handle, rota_url, Action, Rota, TOOLS};
use serde_json::{json, Map, Value};

fn args(v: Value) -> Map<String, Value> {
    v.as_object().cloned().unwrap()
}

/// Same vectors as apps/web/src/features/webmcp/rota.test.ts.
#[test]
fn route_rule_matches_webmcp() {
    let gastos = Rota {
        path: "/v1/gastos/{casa}/{id}",
        omit: &[],
        map: &[("casa", &[("camara", "deputados"), ("senado", "senadores")])],
        query: &["ano", "mes"],
    };
    let comissao = Rota {
        path: "/v1/comissoes/{id}/membros",
        omit: &[],
        map: &[],
        query: &["casa"],
    };
    let deputado = Rota {
        path: "/v1/deputados/{id}/{secao}",
        omit: &[("secao", "perfil")],
        map: &[],
        query: &[],
    };
    let municipio = Rota {
        path: "/v1/municipios/{ibge}/{secao}",
        omit: &[("secao", "resumo")],
        map: &[],
        query: &["ano", "tipo", "limit", "offset"],
    };
    let buscar = Rota {
        path: "/v1/busca",
        omit: &[],
        map: &[],
        query: &["q", "limit"],
    };
    let cases: Vec<(&Rota, Value, &str)> = vec![
        (
            &gastos,
            json!({"casa": "camara", "id": 204379}),
            "/v1/gastos/deputados/204379",
        ),
        (
            &gastos,
            json!({"casa": "outra", "id": 1}),
            "/v1/gastos/outra/1",
        ),
        (
            &gastos,
            json!({"casa": "senado", "id": 5012, "mes": 3, "ano": 2024}),
            "/v1/gastos/senadores/5012?ano=2024&mes=3",
        ),
        (&comissao, json!({}), "/v1/comissoes"),
        (
            &comissao,
            json!({"casa": "senado"}),
            "/v1/comissoes?casa=senado",
        ),
        (&comissao, json!({"id": 2003}), "/v1/comissoes/2003/membros"),
        (
            &deputado,
            json!({"id": 1, "secao": "perfil"}),
            "/v1/deputados/1",
        ),
        (&deputado, json!({"id": 1, "secao": ""}), "/v1/deputados/1"),
        (
            &deputado,
            json!({"id": 1, "secao": "votos"}),
            "/v1/deputados/1/votos",
        ),
        (&deputado, json!({"secao": "votos"}), "/v1/deputados"),
        (
            &municipio,
            json!({"ibge": "3550308", "secao": "resumo", "ano": 2024, "limit": 5}),
            "/v1/municipios/3550308?ano=2024&limit=5",
        ),
        (
            &municipio,
            json!({"ibge": 3550308, "secao": "emendas", "ano": "", "tipo": null, "offset": 0}),
            "/v1/municipios/3550308/emendas?offset=0",
        ),
        (&deputado, json!({"id": "a/b c"}), "/v1/deputados/a%2Fb%20c"),
        (
            &buscar,
            json!({"q": "São Paulo & cia"}),
            "/v1/busca?q=S%C3%A3o%20Paulo%20%26%20cia",
        ),
        (&buscar, json!({"q": true}), "/v1/busca?q=true"),
        (&buscar, json!({"x": 1}), "/v1/busca"),
    ];
    for (r, a, want) in cases {
        assert_eq!(rota_url(r, &args(a.clone())), want, "{a}");
    }
}

fn call(method: &str, params: Value) -> Action {
    handle(&json!({"jsonrpc": "2.0", "id": 7, "method": method, "params": params}))
}

#[test]
fn jsonrpc_lifecycle() {
    let Action::Reply(r) = call(
        "initialize",
        json!({"protocolVersion": "2025-03-26", "capabilities": {}, "clientInfo": {"name": "t", "version": "1"}}),
    ) else {
        panic!()
    };
    assert_eq!(r["id"], 7);
    assert_eq!(r["result"]["protocolVersion"], "2025-03-26");
    assert_eq!(r["result"]["capabilities"]["tools"]["listChanged"], false);
    let Action::Reply(r) = call("initialize", json!({"protocolVersion": "1999-01-01"})) else {
        panic!()
    };
    assert_eq!(r["result"]["protocolVersion"], "2025-06-18");
    assert_eq!(
        handle(&json!({"jsonrpc": "2.0", "method": "notifications/initialized"})),
        Action::None
    );
    assert_eq!(
        handle(&json!({"jsonrpc": "2.0", "id": 1, "result": {}})),
        Action::None
    );
    assert_eq!(
        call("ping", json!({})),
        Action::Reply(json!({"jsonrpc": "2.0", "id": 7, "result": {}}))
    );
    let Action::Reply(r) = call("nada", json!({})) else {
        panic!()
    };
    assert_eq!(r["error"]["code"], -32601);
    let Action::Reply(r) = handle(&json!([1])) else {
        panic!()
    };
    assert_eq!(r["error"]["code"], -32600);
    let Action::Reply(r) = handle(&json!({"id": 1, "method": "ping"})) else {
        panic!()
    };
    assert_eq!(r["error"]["code"], -32600, "jsonrpc 2.0 required");
    let Action::Reply(r) = call("tools/list", json!({})) else {
        panic!()
    };
    let names: Vec<&str> = r["result"]["tools"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t["name"].as_str().unwrap())
        .collect();
    for n in [
        "buscar",
        "municipio",
        "autor_emendas",
        "emendas_pix",
        "ultimas_emendas",
        "deputado",
        "senador",
        "gastos_parlamentar",
        "proposicao",
        "votacao",
        "agenda",
        "comissao",
        "frente",
        "partido",
    ] {
        assert!(names.contains(&n), "{n}");
    }
    assert_eq!(r["result"]["tools"][0]["inputSchema"]["type"], "object");
}

#[test]
fn tools_call_maps_to_api_and_validates() {
    let cases = [
        ("buscar", json!({"q": "Recife"}), "/v1/busca?q=Recife"),
        (
            "municipio",
            json!({"ibge": "3550308", "secao": "emendas", "ano": 2024}),
            "/v1/municipios/3550308/emendas?ano=2024",
        ),
        ("deputado", json!({"id": 204379}), "/v1/deputados/204379"),
        (
            "gastos_parlamentar",
            json!({"casa": "senado", "id": "5012"}),
            "/v1/gastos/senadores/5012",
        ),
        (
            "votacao",
            json!({"nominais": true}),
            "/v1/votacoes?nominais=true",
        ),
        ("emendas_pix", json!({}), "/v1/pix"),
    ];
    for (name, a, want) in cases {
        match call("tools/call", json!({"name": name, "arguments": a})) {
            Action::Call { id, url } => assert_eq!((id, url.as_str()), (json!(7), want)),
            x => panic!("{name}: {x:?}"),
        }
    }
    for (name, a) in [
        ("buscar", json!({})),
        ("municipio", json!({"ibge": "1", "secao": "x"})),
        ("buscar", json!({"q": "a", "zz": 1})),
        ("nada", json!({})),
    ] {
        let Action::Reply(r) = call("tools/call", json!({"name": name, "arguments": a})) else {
            panic!("{name}")
        };
        assert_eq!(r["error"]["code"], -32602, "{name}");
    }
    let env = json!({"data": (0..80).collect::<Vec<_>>(), "meta": {}});
    let r = call_result(json!(1), "/v1/x", Ok(env));
    assert_eq!(r["result"]["isError"], false);
    assert_eq!(
        r["result"]["structuredContent"]["data"]
            .as_array()
            .unwrap()
            .len(),
        50
    );
    assert!(r["result"]["content"][0]["text"]
        .as_str()
        .unwrap()
        .starts_with("[listas cortadas"));
    let r = call_result(json!(1), "/v1/x", Err((404, "não encontrado".into())));
    assert_eq!(r["result"]["isError"], true);
}

#[test]
fn openapi_covers_every_route_tool_and_feed() {
    let s = spec();
    assert_eq!(s["openapi"], "3.1.0");
    let tags: Vec<&str> = s["tags"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t["name"].as_str().unwrap())
        .collect();
    for op in OPS {
        let o = &s["paths"][op.path]["get"];
        assert_eq!(o["operationId"], op.id, "{}", op.path);
        assert!(tags.contains(&op.tag), "{}", op.tag);
        assert_eq!(o["x-exemplo"], op.example);
        let names: Vec<&str> = o["parameters"]
            .as_array()
            .unwrap()
            .iter()
            .map(|p| p["name"].as_str().unwrap())
            .collect();
        for p in op.params {
            assert!(names.contains(&p.name), "{}: {}", op.id, p.name);
        }
        if op.list.is_some() {
            assert!(
                names.contains(&"limit") && names.contains(&"offset"),
                "{}",
                op.id
            );
            assert_eq!(o["x-lista"], true);
        }
        for p in o["parameters"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|p| p["in"] == "path")
        {
            assert!(op
                .path
                .contains(&format!("{{{}}}", p["name"].as_str().unwrap())));
        }
    }
    // Every documented path is routed (or is /mcp, or a feed).
    for (path, _) in s["paths"].as_object().unwrap() {
        let known = OPS.iter().any(|o| o.path == path)
            || path == "/mcp"
            || FEEDS.iter().any(|f| f.path == path);
        assert!(known, "{path}");
    }
    assert_eq!(s["x-mcp"]["tools"].as_array().unwrap().len(), TOOLS.len());
    assert_eq!(s["x-rss"].as_array().unwrap().len(), FEEDS.len());
    // Every MCP tool lands on a routed endpoint for its documented-ish example.
    for t in TOOLS {
        let mut a = Map::new();
        for (n, ty, _, e) in t.args.iter() {
            if t.required.contains(n) || *n == "id" || *n == "codigo" {
                let v = match (*n, *ty) {
                    ("ibge", _) => json!("3550308"),
                    ("casa", _) => json!("camara"),
                    ("q", _) => json!("Recife"),
                    ("id", _) if t.name == "votacao" => json!("2236186-60"),
                    (_, "integer") => json!(204379),
                    (_, _) if !e.is_empty() => json!(e[0]),
                    _ => json!("5012"),
                };
                a.insert(n.to_string(), v);
            }
        }
        let url = rota_url(&t.rota, &a);
        let (p, q) = url
            .split_once('?')
            .map_or((url.as_str(), None), |(p, q)| (p, Some(q)));
        assert!(
            resolve(p.strip_prefix("/v1").unwrap(), q).is_ok(),
            "{}: {url}",
            t.name
        );
        // and every listed query arg is a parameter of some op reachable by the tool
        for (n, _, _, e) in t.args.iter().filter(|a| !a.3.is_empty() && a.0 == "secao") {
            let _ = n;
            for sec in e.iter() {
                let mut a2 = a.clone();
                a2.insert("secao".into(), json!(sec));
                let u = rota_url(&t.rota, &a2);
                assert!(
                    resolve(u.strip_prefix("/v1").unwrap(), None).is_ok(),
                    "{}: {u}",
                    t.name
                );
            }
        }
    }
}
