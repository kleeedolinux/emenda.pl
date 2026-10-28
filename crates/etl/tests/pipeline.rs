use serde_json::{json, Value};
use std::path::{Path, PathBuf};

fn run() -> (PathBuf, etl::Relatorio) {
    let fx = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures");
    let out = std::env::temp_dir().join(format!("emenda-etl-test-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&out);
    let rel = etl::run(&etl::Opts {
        input: fx.clone(),
        out: out.clone(),
        tse: Some(fx.join("tse")),
        ibge: Some(fx.join("ibge.json")),
    })
    .unwrap();
    (out.join("v1"), rel)
}

fn read(p: PathBuf) -> Value {
    serde_json::from_slice(&std::fs::read(&p).unwrap_or_else(|_| panic!("{p:?}"))).unwrap()
}

#[test]
fn pipeline_completo() {
    let (v1, rel) = run();
    assert_eq!(rel.prefeitos_sem_ibge, 1);

    let meta = read(v1.join("meta.json"));
    assert_eq!(meta["version"], "v1");
    assert_eq!(meta["anos"], json!([2023, 2024]));
    assert_eq!(
        meta["totais"],
        json!({"n":3,"empenhado":125000,"liquidado":60000,"pago":50050,"rapPago":1000})
    );

    let br = read(v1.join("brasil.json"));
    assert_eq!(br["porUf"][0]["uf"], "SP");
    assert_eq!(br["porUf"][0]["nome"], "São Paulo");
    assert_eq!(br["porTipo"][0]["tipo"], "pix");
    assert!(br["fluxo"]
        .as_array()
        .unwrap()
        .iter()
        .any(|f| f == &json!({"tipo":"pix","funcao":"Encargos especiais","uf":"SP","pago":40050})));

    let sp = read(v1.join("uf/SP.json"));
    assert_eq!(sp["totais"]["n"], 3);
    assert_eq!(sp["municipios"][0]["ibge"], "3550308");
    assert_eq!(sp["municipios"][0]["n"], 2);

    let m = read(v1.join("municipio/3550308.json"));
    assert_eq!(m["nome"], "São Paulo");
    assert_eq!(m["uf"], "SP");
    assert_eq!(
        m["prefeito"],
        json!({"nome":"RICARDO NUNES","partido":"MDB","eleicao":2024,"situacao":"ELEITO","vice":{"nome":"CORONEL MELLO","partido":"PL"}})
    );
    assert_eq!(m["totais"]["n"], 2);
    let em = m["emendas"].as_array().unwrap();
    assert_eq!(em[0]["codigo"], "202412340001");
    assert_eq!(em[0]["tipo"], "pix");
    assert_eq!(
        em[0]["autor"],
        json!({"codigo":"1234","nome":"JOSÉ DA SILVA"})
    );
    assert_eq!(em[0]["ibge"], "3550308");
    assert_eq!(em[0]["rapPago"], 1000);
    assert_eq!(
        m["favorecidos"][0],
        json!({"documento":"***123456**","nome":"FULANO","tipo":"Pessoa Física","valor":50000})
    );
    assert_eq!(
        m["favorecidos"][1],
        json!({"documento":"46395000000139","nome":"MUNICIPIO DE SAO PAULO","tipo":"Pessoa Jurídica","naturezaJuridica":"Município","valor":40050})
    );
    assert_eq!(
        m["convenios"],
        json!([{"numero":"825378","objeto":"AQUISIÇÃO DE EQUIPAMENTO","convenente":"SANTA CASA","data":"2024-01-06","valor":145000000,"emenda":"202312340002"}])
    );
    assert_eq!(m["autores"][0]["chave"], "JOSE DA SILVA");

    // município sem emendas também é emitido
    let c = read(v1.join("municipio/3509502.json"));
    assert_eq!(c["totais"]["n"], 0);
    assert_eq!(c["prefeito"], Value::Null);
    assert_eq!(c["favorecidos"][0]["valor"], 2000);
    assert_eq!(
        read(v1.join("municipio/1100015.json"))["prefeito"]["nome"],
        "FULANO"
    );

    let a = read(v1.join("autor/1234.json"));
    assert_eq!(a["chave"], "JOSE DA SILVA");
    assert_eq!(a["emendas"].as_array().unwrap().len(), 2);
    assert_eq!(a["porUf"][0]["uf"], "SP");
    assert_eq!(a["favorecidos"][0]["valor"], 50000);

    let autores = read(v1.join("autores.json"));
    assert_eq!(autores[0]["codigo"], "1234");
    assert_eq!(autores[0]["pago"], 50050);
}
