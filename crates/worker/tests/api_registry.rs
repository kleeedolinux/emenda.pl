//! Registry-driven router: every `/v1` route, its validation, caps and canonical cache key.
use emenda_worker::api::registry::{resolve, OPS};
use emenda_worker::api::ApiError;

fn ok(path: &str, q: Option<&str>) -> (String, String) {
    let r = resolve(path, q).unwrap_or_else(|e| panic!("{path} {q:?}: {e:?}"));
    (r.op.id.to_string(), r.canonical())
}

fn bad(path: &str, q: Option<&str>) -> ApiError {
    match resolve(path, q) {
        Ok(r) => panic!("{path} {q:?} -> {}", r.op.id),
        Err(e) => e,
    }
}

#[test]
fn routes_and_canonical_keys() {
    let cases: &[(&str, Option<&str>, &str, &str)] = &[
        ("", None, "index", "/v1"),
        ("/", None, "index", "/v1"),
        ("/openapi.json", None, "openapi", "/v1/openapi.json"),
        ("/meta/", Some("x=1"), "meta", "/v1/meta"),
        ("/brasil", None, "brasil", "/v1/brasil"),
        ("/ufs", None, "ufs", "/v1/ufs?limit=50&offset=0"),
        ("/ufs/sp", None, "uf", "/v1/ufs/SP"),
        (
            "/municipios",
            Some("uf=sp&q=s%C3%A3o"),
            "municipios",
            "/v1/municipios?limit=100&offset=0&q=s%C3%A3o&uf=SP",
        ),
        (
            "/municipios/3550308",
            None,
            "municipio",
            "/v1/municipios/3550308",
        ),
        (
            "/municipios/3550308/emendas",
            Some("ano=2024&tipo=pix&ordem=-pago&zz=1"),
            "municipio_emendas",
            "/v1/municipios/3550308/emendas?ano=2024&limit=100&offset=0&ordem=-pago&tipo=pix",
        ),
        (
            "/municipios/3550308/favorecidos",
            None,
            "municipio_favorecidos",
            "/v1/municipios/3550308/favorecidos?limit=100&offset=0",
        ),
        (
            "/municipios/3550308/convenios",
            Some("formato=csv"),
            "municipio_convenios",
            "/v1/municipios/3550308/convenios?formato=csv&limit=100&offset=0",
        ),
        (
            "/municipios/3550308/prefeito",
            None,
            "municipio_prefeito",
            "/v1/municipios/3550308/prefeito",
        ),
        (
            "/autores",
            Some("offset=5&q=jo%C3%A3o&zz=1"),
            "autores",
            "/v1/autores?limit=50&offset=5&q=jo%C3%A3o",
        ),
        ("/autores/8100", None, "autor", "/v1/autores/8100"),
        (
            "/autores/8100/emendas",
            Some("uf=rj"),
            "autor_emendas",
            "/v1/autores/8100/emendas?limit=100&offset=0&uf=RJ",
        ),
        (
            "/autores/8100/favorecidos",
            None,
            "autor_favorecidos",
            "/v1/autores/8100/favorecidos?limit=100&offset=0",
        ),
        (
            "/emendas",
            Some("autor=8100&ano=2024"),
            "emendas",
            "/v1/emendas?ano=2024&autor=8100&limit=100&offset=0",
        ),
        ("/pix", None, "pix", "/v1/pix"),
        (
            "/pix/2024",
            Some("formato=csv"),
            "pix_ano",
            "/v1/pix/2024?formato=csv",
        ),
        ("/feed", None, "feed", "/v1/feed"),
        ("/feed/202410", None, "feed_mes", "/v1/feed/202410"),
        ("/abertas", None, "abertas", "/v1/abertas"),
        (
            "/rankings",
            Some("janela=3m"),
            "rankings",
            "/v1/rankings?janela=3m",
        ),
        (
            "/gastos/ranking",
            Some("casa=senado&ano=2024&ordem=-valorAno"),
            "gastos_ranking",
            "/v1/gastos/ranking?ano=2024&casa=senado&limit=100&offset=0&ordem=-valorAno",
        ),
        (
            "/gastos/deputados/204379",
            None,
            "gastos_deputado",
            "/v1/gastos/deputados/204379",
        ),
        (
            "/gastos/senadores/5012",
            None,
            "gastos_senador",
            "/v1/gastos/senadores/5012",
        ),
        (
            "/deputados",
            Some("uf=ap&partido=MDB"),
            "deputados",
            "/v1/deputados?limit=1000&offset=0&partido=MDB&uf=AP",
        ),
        (
            "/deputados/204379",
            None,
            "deputado",
            "/v1/deputados/204379",
        ),
        (
            "/deputados/204379/proposicoes",
            Some("limit=20&offset=40"),
            "deputado_proposicoes",
            "/v1/deputados/204379/proposicoes?limit=20&offset=40",
        ),
        (
            "/deputados/204379/votos",
            Some("de=2026-08-01&ate=2026-10-01"),
            "deputado_votos",
            "/v1/deputados/204379/votos?ate=2026-10-01&de=2026-08-01&limit=20&offset=0",
        ),
        (
            "/deputados/204379/despesas",
            Some("ano=2025"),
            "deputado_despesas",
            "/v1/deputados/204379/despesas?ano=2025&limit=100&offset=0",
        ),
        (
            "/deputados/204379/gastos",
            None,
            "deputado_gastos",
            "/v1/deputados/204379/gastos",
        ),
        (
            "/senadores/5012/comissoes",
            None,
            "senador_comissoes",
            "/v1/senadores/5012/comissoes?limit=200&offset=0",
        ),
        ("/partidos/PCdoB", None, "partido", "/v1/partidos/PCdoB"),
        (
            "/federacoes",
            None,
            "federacoes",
            "/v1/federacoes?limit=50&offset=0",
        ),
        (
            "/frentes/55703/membros",
            None,
            "frente_membros",
            "/v1/frentes/55703/membros?limit=1000&offset=0",
        ),
        (
            "/comissoes",
            Some("casa=senado"),
            "comissoes",
            "/v1/comissoes?casa=senado&limit=500&offset=0",
        ),
        (
            "/comissoes/38/membros",
            Some("casa=senado"),
            "comissao_membros",
            "/v1/comissoes/38/membros?casa=senado&limit=200&offset=0",
        ),
        (
            "/proposicoes",
            Some("tipo=pl,pec&ano=2024&q=sa%C3%BAde"),
            "proposicoes",
            "/v1/proposicoes?ano=2024&limit=20&offset=0&q=sa%C3%BAde&tipo=PL,PEC",
        ),
        (
            "/proposicoes/2270800/resultado",
            None,
            "proposicao_resultado",
            "/v1/proposicoes/2270800/resultado",
        ),
        (
            "/votacoes",
            None,
            "votacoes",
            "/v1/votacoes?limit=50&offset=0",
        ),
        (
            "/votacoes/2236186-60",
            None,
            "votacao",
            "/v1/votacoes/2236186-60",
        ),
        (
            "/agenda",
            Some("casa=camara&de=2026-10-26&ate=2026-11-01"),
            "agenda",
            "/v1/agenda?ate=2026-11-01&casa=camara&de=2026-10-26&limit=500&offset=0",
        ),
        ("/busca", Some("q=Recife"), "busca", "/v1/busca?q=Recife"),
    ];
    for (path, q, id, canon) in cases {
        assert_eq!(
            ok(path, *q),
            (id.to_string(), canon.to_string()),
            "{path} {q:?}"
        );
    }
}

#[test]
fn rejects_invalid_paths_and_params() {
    let long = format!("q={}", "a".repeat(600));
    let long_q = format!("q={}", "a".repeat(65));
    let nf: &[(&str, Option<&str>)] = &[
        ("/nada", None),
        ("/ufs/SP/x", None),
        ("/ufs/S1", None),
        ("/ufs/SPX", None),
        ("/municipios/123", None),
        ("/municipios/3550308/nada", None),
        ("/autores/../x", None),
        ("/pix/24", None),
        ("/pix/1999", None),
        ("/feed/202413", None),
        ("/deputados/abc", None),
        ("/votacoes/1-2-x", None),
        ("x", None),
    ];
    for (p, q) in nf {
        assert_eq!(bad(p, *q), ApiError::NotFound, "{p}");
    }
    let br: &[(&str, &str, &str)] = &[
        ("/meta", long.as_str(), "query muito longa"),
        ("/autores", long_q.as_str(), "q: máximo 64 caracteres"),
        ("/autores", "limit=0", "limit: 1..=500"),
        ("/autores", "limit=501", "limit: 1..=500"),
        ("/autores", "limit=x", "limit: 1..=500"),
        ("/autores", "offset=10001", "offset: 0..=10000"),
        (
            "/autores",
            "ordem=xyz",
            "ordem: use um de n, pago, empenhado, nome (prefixo - para decrescente)",
        ),
        (
            "/municipios/3550308/emendas",
            "ano=1990",
            "ano: inteiro entre 2000 e 2100",
        ),
        (
            "/municipios/3550308/emendas",
            "tipo=foo",
            "tipo: use um de individual, bancada, comissao, relator, pix, outra",
        ),
        (
            "/municipios/3550308/emendas",
            "campos=a;b",
            "campos: nomes separados por vírgula",
        ),
        ("/meta", "formato=csv", "formato=csv: só em listas"),
        (
            "/municipios/3550308/emendas",
            "formato=xml",
            "formato: use um de json, csv",
        ),
        ("/agenda", "de=2026-02-30", "de: data AAAA-MM-DD"),
        ("/busca", "", "q: obrigatório"),
        ("/busca", "q=a", "q: mínimo 2 caracteres"),
        (
            "/deputados/1/proposicoes",
            "limit=20&offset=30",
            "offset: múltiplo de limit",
        ),
        ("/deputados/1/proposicoes", "limit=101", "limit: 1..=100"),
        ("/gastos/ranking", "uf=S1", "uf: sigla de UF"),
    ];
    for (p, q, msg) in br {
        assert_eq!(
            bad(p, Some(q)),
            ApiError::BadRequest(msg.to_string()),
            "{p}?{q}"
        );
    }
}

#[test]
fn every_op_is_well_formed_and_unique() {
    let mut ids = std::collections::BTreeSet::new();
    let mut paths = std::collections::BTreeSet::new();
    for op in OPS {
        assert!(ids.insert(op.id), "duplicate id {}", op.id);
        assert!(paths.insert(op.path), "duplicate path {}", op.path);
        assert!(op.path.starts_with("/v1"), "{}", op.path);
        assert!((60..=7 * 86400).contains(&op.ttl), "{} ttl", op.id);
        assert!(!op.summary.is_empty() && !op.tag.is_empty(), "{}", op.id);
        // Path params are declared, and declared path params appear in the path.
        for seg in op.path.split('/').filter(|s| s.starts_with('{')) {
            let n = seg.trim_matches(|c| c == '{' || c == '}');
            assert!(
                op.params.iter().any(|p| p.path && p.name == n),
                "{}: {n}",
                op.id
            );
        }
        for p in op.params.iter().filter(|p| p.path) {
            assert!(
                op.path.contains(&format!("{{{}}}", p.name)),
                "{}: {}",
                op.id,
                p.name
            );
        }
        // The documented example resolves to this very op.
        let (path, q) = op
            .example
            .split_once('?')
            .map_or((op.example, None), |(a, b)| (a, Some(b)));
        let rest = path.strip_prefix("/v1").unwrap();
        let r = resolve(rest, q)
            .unwrap_or_else(|e| panic!("{}: example {} -> {e:?}", op.id, op.example));
        assert_eq!(r.op.id, op.id, "example {}", op.example);
    }
    assert!(OPS.len() >= 60, "{}", OPS.len());
}
