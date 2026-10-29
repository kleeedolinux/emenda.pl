use etl::beneficiados::{classe, Classe};

#[test]
fn classifica_por_natureza_juridica() {
    let casos = [
        (
            "Pessoa Jurídica",
            "Sociedade Empresária Limitada",
            Some(Classe::Empresa),
        ),
        (
            "Pessoa Jurídica",
            "Sociedade Anônima Fechada",
            Some(Classe::Empresa),
        ),
        (
            "Pessoa Jurídica",
            "Empresário (Individual)",
            Some(Classe::Empresa),
        ),
        ("Pessoa Jurídica", "Cooperativa", Some(Classe::Empresa)),
        (
            "Pessoa Jurídica",
            "Associação Privada",
            Some(Classe::Entidade),
        ),
        (
            "Pessoa Jurídica",
            "Fundação Privada",
            Some(Classe::Entidade),
        ),
        (
            "Pessoa Jurídica",
            "Organização Social (OS)",
            Some(Classe::Entidade),
        ),
        (
            "Pessoa Jurídica",
            "Fundo Público da Administração Direta Municipal",
            Some(Classe::Fundo),
        ),
        (
            "Pessoa Jurídica",
            "Fundo Público da Administração Direta Estadual ou do Distrito Federal",
            Some(Classe::Fundo),
        ),
        // estatais (Caixa, BB), governos e órgãos ficam de fora
        ("Pessoa Jurídica", "Empresa Pública", None),
        ("Pessoa Jurídica", "Sociedade de Economia Mista", None),
        ("Pessoa Jurídica", "Município", None),
        ("Pessoa Jurídica", "Autarquia Federal", None),
        ("Pessoa Fisica", "Sem informação", None),
        ("Unidade Gestora", "Sociedade de Economia Mista", None),
    ];
    for (tipo, nat, esperado) in casos {
        assert_eq!(classe(tipo, nat), esperado, "{nat}");
    }
}

#[test]
fn ranking_separa_grupos_e_ordena_por_valor() {
    use etl::beneficiados::Ranking;
    let mut r = Ranking::default();
    let pj = "Pessoa Jurídica";
    r.somar(
        "1",
        "CONSTRUTORA Y LTDA",
        pj,
        "Sociedade Empresária Limitada",
        "SP",
        "CAMPINAS",
        1500,
    );
    r.somar(
        "1",
        "CONSTRUTORA Y LTDA",
        pj,
        "Sociedade Empresária Limitada",
        "SP",
        "CAMPINAS",
        500,
    );
    r.somar(
        "2",
        "ALFA SA",
        pj,
        "Sociedade Anônima Aberta",
        "RJ",
        "RIO DE JANEIRO",
        3000,
    );
    r.somar(
        "3",
        "FUNDO MUNICIPAL DE SAUDE",
        pj,
        "Fundo Público da Administração Direta Municipal",
        "SP",
        "CAMPINAS",
        1200,
    );
    r.somar(
        "4",
        "CAIXA ECONOMICA FEDERAL",
        pj,
        "Empresa Pública",
        "DF",
        "BRASÍLIA",
        9900,
    );
    let dir = std::env::temp_dir().join(format!("emenda-ben-{}", std::process::id()));
    r.escrever(&dir).unwrap();
    let b: serde_json::Value =
        serde_json::from_slice(&std::fs::read(dir.join("beneficiados.json")).unwrap()).unwrap();
    assert_eq!(
        b["totais"],
        serde_json::json!({"empresas":5000,"entidades":0,"fundos":1200})
    );
    assert_eq!(b["empresas"][0]["nome"], "ALFA SA");
    assert_eq!(
        b["empresas"][1],
        serde_json::json!({"documento":"1","nome":"CONSTRUTORA Y LTDA","tipo":"Pessoa Jurídica",
            "naturezaJuridica":"Sociedade Empresária Limitada","valor":2000,"uf":"SP","municipio":"CAMPINAS"})
    );
    assert_eq!(b["fundos"][0]["valor"], 1200);
    assert_eq!(b["entidades"], serde_json::json!([]));
}
