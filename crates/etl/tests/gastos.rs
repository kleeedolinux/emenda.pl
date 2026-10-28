//! v1/gastos/** — CEAP (Câmara), CEAPS (Senado), pessoal de gabinete, subsídio, auxílios.
use etl::gastos;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

fn run() -> PathBuf {
    let fx = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/gastos");
    let out = std::env::temp_dir().join(format!("emenda-etl-gastos-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&out);
    gastos::run(&gastos::Opts {
        cache: fx,
        out: out.clone(),
        ano: 2026,
    })
    .unwrap();
    out.join("v1/gastos")
}

fn read(p: PathBuf) -> Value {
    serde_json::from_slice(&std::fs::read(&p).unwrap_or_else(|_| panic!("{p:?}"))).unwrap()
}

#[test]
fn documento_normalizado() {
    for (i, o) in [
        ("075.756.510/0015-9", "07575651000159"),
        ("000.109.811/01  -", "00010981101"),
        ("06.906.483/0001-74", "06906483000174"),
        ("000.000.000/0000-1", ""),
        ("", ""),
    ] {
        assert_eq!(gastos::doc(i), o, "{i}");
    }
}

#[test]
fn inicio_legislatura() {
    for (ano, o) in [
        (2023, 2023),
        (2026, 2023),
        (2027, 2027),
        (2030, 2027),
        (2019, 2019),
    ] {
        assert_eq!(gastos::inicio_legislatura(ano), o, "{ano}");
    }
}

#[test]
fn pagina_deputado() {
    let fx = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/gastos/camara/deputados/204379.html");
    let p = gastos::camara::pagina(&std::fs::read_to_string(fx).unwrap());
    assert_eq!(p.ano, Some(2026));
    assert_eq!(p.subsidio, Some(4636619));
    assert_eq!(p.cota_gasto, Some(42127179));
    assert_eq!(p.cota_nao_utilizado, Some(13802985));
    assert_eq!(p.verba_gasto, Some(107798895));
    assert_eq!(p.verba_nao_utilizado, Some(3020358));
    assert_eq!(
        p.verba_mes,
        vec![(1, 13315173), (2, 13833316), (7, 16496787)]
    );
    assert_eq!(
        p.imovel_funcional.as_deref(),
        Some("Faz uso desde 20/02/2019")
    );
    assert_eq!(p.auxilio_moradia.as_deref(), Some("Recebeu R$ 12.759,00"));
    assert_eq!(p.auxilio_moradia_valor, Some(1275900));
    assert_eq!(p.viagens_missao, Some(2));
}

#[test]
fn saidas_gastos() {
    let g = run();

    // ---- deputado ----
    let d = read(g.join("deputado/204379.json"));
    assert_eq!(d["casa"], "camara");
    assert_eq!(d["id"], "204379");
    assert_eq!(d["nome"], "Acácio Favacho");
    assert_eq!(d["partido"], "MDB");
    assert_eq!(d["uf"], "AP");
    assert_eq!(d["dadosAte"], "2025-06");
    assert_eq!(d["total"], 99900 + 1533025);
    assert_eq!(
        d["mandato"],
        json!({"inicio": "2023-02", "total": 1533025, "meses": 29, "mediaMensal": 52863})
    );
    assert_eq!(
        d["porAno"],
        json!([{"ano": 2022, "valor": 99900, "n": 1}, {"ano": 2025, "valor": 1533025, "n": 5}])
    );
    assert_eq!(
        d["porCategoria"][0]["categoria"],
        "DIVULGAÇÃO DA ATIVIDADE PARLAMENTAR."
    );
    assert_eq!(
        d["porCategoria"][1]["categoria"],
        "COMBUSTÍVEIS E LUBRIFICANTES."
    );
    assert_eq!(d["porCategoria"][1]["valor"], 129950);
    assert_eq!(d["porCategoria"][1]["n"], 3);
    assert!(d["porCategoriaAno"].as_array().unwrap().contains(
        &json!({"ano": 2022, "categoria": "COMBUSTÍVEIS E LUBRIFICANTES.", "valor": 99900})
    ));
    assert_eq!(
        d["topFornecedores"][0],
        json!({"cnpjCpf": "36678161000186", "nome": "MIL IDEIAS", "valor": 1500000, "n": 1})
    );
    assert_eq!(d["topFornecedores"][1]["cnpjCpf"], "07575651000159");
    assert_eq!(d["topFornecedores"][1]["valor"], 129950);
    assert_eq!(d["nItens"], 6);
    let it = d["itens"].as_array().unwrap();
    assert_eq!(it.len(), 6);
    assert_eq!(
        it[0],
        json!({"data": "2025-06-30", "categoria": "TELEFONIA", "fornecedor": "CELULAR FUNCIONAL",
               "cnpjCpf": "", "valor": 8000})
    );
    assert_eq!(it[1]["det"], "BSB/MCP");
    assert_eq!(it[1]["valor"], -5025);
    assert_eq!(
        it[4]["url"],
        "https://www.camara.leg.br/cota-parlamentar/documentos/publ/1/2025/1.pdf"
    );
    assert_eq!(it[5]["data"], "2022-12-01");
    assert_eq!(
        d["cota"],
        json!({"ano": 2026, "gasto": 42127179, "teto": 55930164})
    );
    assert_eq!(d["verbaGabinete"]["gasto"], 107798895);
    assert_eq!(
        d["verbaGabinete"]["porMes"][2],
        json!({"mes": 7, "gasto": 16496787})
    );
    assert_eq!(d["subsidio"], 4636619);
    assert_eq!(d["auxilios"]["imovelFuncional"], "Faz uso desde 20/02/2019");
    assert_eq!(d["auxilios"]["auxilioMoradiaValor"], 1275900);
    assert_eq!(d["auxilios"]["viagensMissao"], 2);
    assert_eq!(d["pessoal"]["n"], 2);
    assert_eq!(d["pessoal"]["custoMensal"], 16496787);
    assert_eq!(d["pessoal"]["referencia"], "2026-07");
    assert_eq!(
        d["pessoal"]["lista"][0],
        json!({"nome": "JOAO SOUZA", "cargo": "CNE12", "grupo": "Cargo de Natureza Especial",
               "desde": "2025-07-09"})
    );
    assert_eq!(d["pessoal"]["lista"][1]["desde"], "2026-02-18");
    assert!(d["fontes"].as_array().unwrap().len() >= 3);

    // deputado sem página (fora do cache) ainda tem CEAP
    let d2 = read(g.join("deputado/220714.json"));
    assert_eq!(d2["topFornecedores"][0]["cnpjCpf"], "00010981101");
    assert_eq!(d2["itens"][0]["data"], "2025-01");
    assert_eq!(d2["cota"], Value::Null);
    assert_eq!(d2["pessoal"]["n"], 1);
    assert_eq!(d2["pessoal"]["custoMensal"], Value::Null);
    // liderança (sem ideCadastro) não vira arquivo
    assert_eq!(std::fs::read_dir(g.join("deputado")).unwrap().count(), 2);

    // ---- senador ----
    let s = read(g.join("senador/5672.json"));
    assert_eq!(s["casa"], "senado");
    assert_eq!(s["id"], "5672");
    assert_eq!(s["nome"], "Alan Rick");
    assert_eq!(s["partido"], "REPUBLICANOS");
    assert_eq!(s["uf"], "AC");
    assert_eq!(s["dadosAte"], "2025-07");
    assert_eq!(
        s["mandato"],
        json!({"inicio": "2023-02", "total": 813007, "meses": 30, "mediaMensal": 27100})
    );
    assert_eq!(s["topFornecedores"][0]["cnpjCpf"], "06906483000174");
    assert_eq!(s["itens"][0]["det"], "Aluguel julho");
    assert_eq!(s["subsidio"], 4636619);
    assert_eq!(s["auxilios"]["imovelFuncional"], "Utiliza");
    assert_eq!(s["auxilios"]["auxilioMoradia"], "Não recebe");
    assert_eq!(s["pessoal"]["n"], 2);
    assert_eq!(s["pessoal"]["custoMensal"], 973918);
    assert_eq!(s["pessoal"]["referencia"], "2025-10");
    assert_eq!(
        s["pessoal"]["lista"][0],
        json!({"nome": "ALEX RODRIGUES MENDES", "cargo": "AUXILIAR PARLAMENTAR INTERMEDIÁRIO",
               "grupo": "Comissionado", "local": "Gabinete", "desde": "2025", "remuneracao": 973918})
    );
    assert_eq!(
        s["pessoal"]["lista"][1]["local"],
        "Escritório de Apoio nº 1"
    );
    assert_eq!(s["cota"], Value::Null);
    // lotação usa nome mais longo que o nome parlamentar
    let w = read(g.join("senador/5411.json"));
    assert_eq!(w["pessoal"]["n"], 1);
    assert_eq!(w["mandato"]["inicio"], "2019-02");
    assert_eq!(w["itens"], json!([]));

    // ---- ranking ----
    let r = read(g.join("ranking.json"));
    assert_eq!(r["anos"], json!([2022, 2025]));
    assert_eq!(
        r["dadosAte"],
        json!({"camara": "2025-06", "senado": "2025-07"})
    );
    let ps = r["parlamentares"].as_array().unwrap();
    assert_eq!(ps.len(), 4);
    assert_eq!(
        ps[0],
        json!({"casa": "camara", "id": "204379", "nome": "Acácio Favacho", "partido": "MDB",
               "uf": "AP", "emExercicio": true, "mandato": 1533025,
               "porAno": {"2022": 99900, "2025": 1533025}})
    );
    assert_eq!(ps[2]["casa"], "senado");
    assert_eq!(r["fornecedores"][0]["cnpjCpf"], "36678161000186");
    assert_eq!(r["fornecedores"][0]["parlamentares"], 1);
    let posto = r["fornecedores"]
        .as_array()
        .unwrap()
        .iter()
        .find(|f| f["cnpjCpf"] == "07575651000159")
        .unwrap();
    assert_eq!(posto["valor"], 129950);
    let comb = r["categorias"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| {
            c["casa"] == "camara"
                && c["ano"] == 2025
                && c["categoria"] == "COMBUSTÍVEIS E LUBRIFICANTES."
        })
        .unwrap();
    assert_eq!(comb["valor"], 130050);
    assert_eq!(comb["n"], 3);
    assert_eq!(comb["top"][0], json!({"id": "220714", "valor": 100000}));
}
