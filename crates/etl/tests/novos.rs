//! v1/pix, v1/feed, v1/abertas, v1/rankings.
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

fn run() -> PathBuf {
    let fx = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures");
    let out = std::env::temp_dir().join(format!("emenda-etl-novos-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&out);
    etl::run(&etl::Opts {
        input: fx.clone(),
        out: out.clone(),
        tse: Some(fx.join("tse")),
        ibge: Some(fx.join("ibge.json")),
    })
    .unwrap();
    out.join("v1")
}

fn read(p: PathBuf) -> Value {
    serde_json::from_slice(&std::fs::read(&p).unwrap_or_else(|_| panic!("{p:?}"))).unwrap()
}

#[test]
fn saidas_novas() {
    let v1 = run();

    // ---- pix ----
    let pix = read(v1.join("pix.json"));
    assert_eq!(pix["totais"]["n"], 1);
    assert_eq!(pix["totais"]["pago"], 40050);
    assert_eq!(pix["anos"], json!([2024]));
    assert_eq!(pix["porAno"][0]["ano"], 2024);
    assert_eq!(pix["porUf"][0]["uf"], "SP");
    assert_eq!(pix["municipios"][0]["ibge"], "3550308");
    assert_eq!(pix["municipios"][0]["uf"], "SP");
    assert_eq!(pix["autores"][0]["codigo"], "1234");
    let p24 = read(v1.join("pix/2024.json"));
    assert_eq!(p24["ano"], 2024);
    assert_eq!(
        p24["itens"],
        json!([{"codigo":"202412340001","numero":"0001","autor":{"codigo":"1234","nome":"JOSÉ DA SILVA"},
            "localidade":"SÃO PAULO - SP","ibge":"3550308","uf":"SP","funcao":"Encargos especiais",
            "empenhado":100000,"pago":40050,"rapPago":1000}])
    );

    // ---- feed ----
    let feed = read(v1.join("feed.json"));
    assert_eq!(feed["ultimoMes"], 202404);
    assert_eq!(
        feed["meses"],
        json!([{"mes":202404,"n":1,"valor":10050},{"mes":202403,"n":1,"valor":30000},{"mes":202311,"n":2,"valor":52000}])
    );
    let it = feed["itens"].as_array().unwrap();
    assert_eq!(it.len(), 4);
    assert_eq!(
        it[0],
        json!({"mes":202404,"codigoEmenda":"202412340001","autor":{"codigo":"1234","nome":"JOSÉ DA SILVA"},
            "tipo":"pix","favorecido":{"nome":"MUNICIPIO DE SAO PAULO","documento":"46395000000139","tipo":"Pessoa Jurídica"},
            "municipio":{"ibge":"3550308","nome":"São Paulo","uf":"SP"},"valor":10050})
    );
    assert_eq!(it[2]["valor"], 50000);
    assert_eq!(it[3]["municipio"]["ibge"], "3509502");
    let m = read(v1.join("feed/202311.json"));
    assert_eq!(m["mes"], 202311);
    assert_eq!(m["valor"], 52000);
    assert_eq!(m["truncado"], false);
    assert_eq!(m["itens"].as_array().unwrap().len(), 2);

    // ---- abertas ----
    let ab = read(v1.join("abertas.json"));
    assert_eq!(
        ab["totais"],
        json!({"n":3,"empenhado":125000,"pago":50050,"rapPago":1000,"rapCancelado":0,"aberto":73950})
    );
    assert_eq!(ab["porTipo"][0], json!({"tipo":"pix","n":1,"aberto":58950}));
    assert_eq!(
        ab["porAno"],
        json!([{"ano":2023,"n":1,"aberto":10000},{"ano":2024,"n":2,"aberto":63950}])
    );
    assert_eq!(
        ab["porUf"][0],
        json!({"uf":"SP","nome":"São Paulo","n":3,"aberto":73950})
    );
    assert_eq!(ab["top"][0]["codigo"], "202412340001");
    assert_eq!(ab["top"][0]["aberto"], 58950);
    assert_eq!(ab["top"][0]["tipo"], "pix");

    // ---- rankings ----
    let r = read(v1.join("rankings.json"));
    assert_eq!(r["ultimoMes"], 202404);
    let j: Vec<&Value> = r["janelas"].as_array().unwrap().iter().collect();
    assert_eq!(
        j.iter().map(|x| x["janela"].clone()).collect::<Vec<_>>(),
        vec![json!("1m"), json!("3m"), json!("6m"), json!("12m")]
    );
    assert_eq!(j[0]["desde"], 202404);
    assert_eq!(
        j[0]["autores"][0],
        json!({"codigo":"1234","nome":"JOSÉ DA SILVA","chave":"JOSE DA SILVA","valor":10050,"pagamentos":1})
    );
    assert_eq!(j[1]["autores"][0]["valor"], 40050);
    assert_eq!(j[2]["desde"], 202311);
    assert_eq!(j[2]["valor"], 92050);
    assert_eq!(
        j[2]["ufs"][0],
        json!({"uf":"SP","nome":"São Paulo","valor":92050,"pagamentos":4})
    );
    assert_eq!(
        j[2]["municipios"][0],
        json!({"ibge":"3550308","nome":"São Paulo","uf":"SP","valor":90050,"pagamentos":3})
    );
    assert_eq!(
        j[2]["tipos"][0],
        json!({"tipo":"bancada","valor":52000,"pagamentos":2})
    );
}
