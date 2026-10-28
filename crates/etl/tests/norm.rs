use etl::norm::*;

#[test]
fn valor_br_em_centavos() {
    for (i, o) in [
        ("1450000,00", 145000000),
        ("", 0),
        ("  ", 0),
        ("-12,5", -1250),
        ("1.234,56", 123456),
        ("7", 700),
        ("abc", 0),
        ("3862,00", 386200),
    ] {
        assert_eq!(parse_valor_br(i), o, "{i}");
    }
}

#[test]
fn classifica_tipo() {
    for (i, o) in [
        ("Emenda Individual - Transferências Especiais", "pix"),
        (
            "Emenda Individual - Transferências com Finalidade Definida",
            "individual",
        ),
        ("Emenda de Bancada", "bancada"),
        ("Emenda de Comissão", "comissao"),
        ("Emenda de Relator", "relator"),
        ("Sem informação", "outra"),
    ] {
        assert_eq!(classificar_tipo(i).as_str(), o, "{i}");
    }
}

#[test]
fn chave_nome_igual_ao_ts() {
    for (i, o) in [
        ("José da Silva", "JOSE DA SILVA"),
        ("  Alta Floresta D'Oeste ", "ALTA FLORESTA D OESTE"),
        ("SÃO JOÃO-DEL REI", "SAO JOAO DEL REI"),
        ("Açaí 2º", "ACAI"),
    ] {
        assert_eq!(chave_nome(i), o);
    }
}

#[test]
fn uf_por_codigo_ibge() {
    assert_eq!(uf_de_codigo("3500000"), Some("SP"));
    assert_eq!(uf_de_codigo("53"), Some("DF"));
    assert_eq!(uf_de_codigo(""), None);
    assert_eq!(uf_de_codigo("99"), None);
    assert_eq!(uf_nome("SP"), Some("São Paulo"));
}

#[test]
fn chave_municipio_casa_variacoes() {
    assert_eq!(
        chave_municipio("Alta Floresta D'Oeste", "ro"),
        chave_municipio("ALTA FLORESTA DOESTE", "RO")
    );
    assert_ne!(
        chave_municipio("Bonito", "PA"),
        chave_municipio("Bonito", "MS")
    );
}

#[test]
fn alias_tse_para_ibge() {
    for (tse, ibge, uf) in [
        ("CAMACÃ", "Camacan", "BA"),
        ("ALVORADA DO OESTE", "Alvorada D'Oeste", "RO"),
        ("BOA SAÚDE", "Januário Cicco", "RN"),
    ] {
        assert_eq!(etl::read::chave_tse(tse, uf), chave_municipio(ibge, uf));
    }
    assert_eq!(
        etl::read::chave_tse("SÃO PAULO", "SP"),
        chave_municipio("São Paulo", "SP")
    );
}
