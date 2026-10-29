//! Asset mirror: pure planning, mapping, caps, manifest and image encoding. No network.
use etl::assets::fontes::{self, Alvo, Origem};
use etl::assets::imagem;
use etl::assets::manifesto::{orfaos, Item, Manifesto, Tipo};
use etl::assets::plano::{
    decidir, planejar, Condicional, Decisao, Modo, Orcamento, Plano, Resposta,
};
use serde_json::json;

fn item(chave: &str, sha: &str) -> Item {
    Item {
        chave: chave.into(),
        origem: format!("https://x/{chave}"),
        tipo: Tipo::Foto,
        bytes: 10,
        sha256: sha.into(),
        etag: Some("\"e1\"".into()),
        modificado: Some("Tue, 27 Mar 2018 19:59:15 GMT".into()),
        variantes: vec![format!("{chave}-160.webp")],
        licenca: None,
        autor: None,
        pagina: None,
    }
}

#[test]
fn chave_tipo_e_variantes() {
    let cases: Vec<(Alvo, &str, Tipo, bool, Vec<&str>)> = vec![
        (
            Alvo::Deputado(204554),
            "foto/deputado/204554",
            Tipo::Foto,
            false,
            vec![
                "foto/deputado/204554-160.webp",
                "foto/deputado/204554-512.webp",
                "foto/deputado/204554-512.jpg",
            ],
        ),
        (
            Alvo::Senador(5012),
            "foto/senador/5012",
            Tipo::Foto,
            false,
            vec![
                "foto/senador/5012-160.webp",
                "foto/senador/5012-512.webp",
                "foto/senador/5012-512.jpg",
            ],
        ),
        (
            Alvo::Partido("PT".into()),
            "logo/partido/PT",
            Tipo::Logo,
            false,
            vec!["logo/partido/PT.webp"],
        ),
        (
            Alvo::Partido("PSOL".into()),
            "logo/partido/PSOL",
            Tipo::Logo,
            true,
            vec!["logo/partido/PSOL.svg"],
        ),
        (
            Alvo::Proposicao(2196833),
            "pdf/proposicao/2196833",
            Tipo::Pdf,
            false,
            vec!["pdf/proposicao/2196833.pdf"],
        ),
        (
            Alvo::Frente(55703),
            "pdf/frente/55703",
            Tipo::Pdf,
            false,
            vec!["pdf/frente/55703.pdf"],
        ),
    ];
    for (alvo, chave, tipo, svg, variantes) in cases {
        assert_eq!(alvo.chave(), chave);
        assert_eq!(alvo.tipo(), tipo);
        assert_eq!(alvo.variantes(svg), variantes, "{chave}");
    }
}

#[test]
fn sigla_de_partido_invalida_e_descartada() {
    // Case kept: matches the official logo file name (PCdoB.gif).
    assert_eq!(Alvo::partido("PCdoB"), Some(Alvo::Partido("PCdoB".into())));
    for s in ["", "../x", "A B", "PT/1", &"X".repeat(40)] {
        assert!(Alvo::partido(s).is_none(), "{s}");
    }
}

#[test]
fn deputados_paginacao_e_dedupe() {
    let p1 = json!({"dados":[
        {"id":178957,"urlFoto":"https://www.camara.leg.br/internet/deputado/bandep/178957.jpg"},
        {"id":178957,"urlFoto":"https://www.camara.leg.br/internet/deputado/bandep/178957.jpg"},
        {"id":1,"urlFoto":null}],
        "links":[{"rel":"self","href":"a"},{"rel":"next","href":"https://n/2"}]});
    let deps = fontes::deputados(&p1);
    assert_eq!(deps.len(), 2);
    // Ordered by key.
    assert_eq!(deps[1].alvo, Alvo::Deputado(178957));
    assert_eq!(
        deps[1].origem,
        Origem::Url("https://www.camara.leg.br/internet/deputado/bandep/178957.jpg".into())
    );
    assert_eq!(
        deps[0].origem,
        Origem::Url("https://www.camara.leg.br/internet/deputado/bandep/1.jpg".into())
    );
    assert_eq!(fontes::proximo(&p1).as_deref(), Some("https://n/2"));
    assert_eq!(fontes::proximo(&json!({"links":[]})), None);
    let todos = fontes::dedupe([deps.clone(), deps].concat());
    assert_eq!(todos.len(), 2);
}

#[test]
fn senadores_lista_atual_e_legislatura() {
    let atual = json!({"ListaParlamentarEmExercicio":{"Parlamentares":{"Parlamentar":[
        {"IdentificacaoParlamentar":{"CodigoParlamentar":"5672"}},
        {"IdentificacaoParlamentar":{"CodigoParlamentar":"70"}}]}}});
    let leg = json!({"ListaParlamentarLegislatura":{"Parlamentares":{"Parlamentar":
        {"IdentificacaoParlamentar":{"CodigoParlamentar":"5573"}}}}});
    let a = fontes::senadores(&atual);
    assert_eq!(
        a.iter().map(|f| f.alvo.clone()).collect::<Vec<_>>(),
        vec![Alvo::Senador(5672), Alvo::Senador(70)]
    );
    assert_eq!(
        a[1].origem,
        Origem::Url("https://www.senado.leg.br/senadores/img/fotos-oficiais/senador70.jpg".into())
    );
    assert_eq!(fontes::senadores(&leg)[0].alvo, Alvo::Senador(5573));
    assert!(fontes::senadores(&json!({})).is_empty());
}

#[test]
fn partidos_votacoes_frentes_pautas() {
    let p = json!({"dados":[{"id":36844,"sigla":"PT"},{"id":1,"sigla":"../x"}]});
    let ps = fontes::partidos(&p);
    assert_eq!(ps.len(), 1);
    assert_eq!(ps[0].alvo, Alvo::Partido("PT".into()));
    assert_eq!(ps[0].origem, Origem::Camara("partidos/36844".into()));

    let v = json!({"dados":[{"id":"2442848-52"},{"id":"2442848-50"},{"id":"777-1"},{"id":"x"}]});
    let pr = fontes::proposicoes_votadas(&v);
    assert_eq!(pr, vec![2442848, 777]);

    let f = json!({"dados":[{"id":55703},{"id":55685}]});
    let fs = fontes::frentes(&f);
    assert_eq!(fs[0].alvo, Alvo::Frente(55703));
    assert_eq!(fs[0].origem, Origem::Camara("frentes/55703".into()));

    let ts = "export const PAUTAS = [\n { camaraId: 2196833, sigla: \"PEC\" },\n {\n camaraId:2430143 }, { camaraId: 2196833 }];";
    assert_eq!(fontes::pautas(ts), vec![2196833, 2430143]);
    assert_eq!(
        fontes::proposicao(1).origem,
        Origem::Camara("proposicoes/1".into())
    );
}

#[test]
fn url_resolvida_do_detalhe() {
    let cases = [
        (
            Alvo::Proposicao(1),
            json!({"dados":{"urlInteiroTeor":"https://c/teor?codteor=9"}}),
            Some("https://c/teor?codteor=9"),
        ),
        (
            Alvo::Proposicao(1),
            json!({"dados":{"urlInteiroTeor":null}}),
            None,
        ),
        (
            Alvo::Frente(2),
            json!({"dados":{"urlDocumento":"https://c/f.pdf"}}),
            Some("https://c/f.pdf"),
        ),
        (
            Alvo::Partido("PT".into()),
            json!({"dados":{"urlLogo":"http://c/PT.gif"}}),
            Some("https://c/PT.gif"),
        ),
        (
            Alvo::Partido("PT".into()),
            json!({"dados":{"urlLogo":""}}),
            None,
        ),
    ];
    for (alvo, v, want) in cases {
        assert_eq!(fontes::resolver(&alvo, &v).as_deref(), want, "{alvo:?}");
    }
}

#[test]
fn janelas_de_tres_meses() {
    let j = fontes::janelas((2026, 10, 28), 24);
    assert_eq!(j.len(), 8);
    assert_eq!(j[0], ("2024-11-01".to_string(), "2025-01-31".to_string()));
    assert_eq!(j[7], ("2026-08-01".to_string(), "2026-10-31".to_string()));
    let fev = fontes::janelas((2024, 4, 1), 3);
    assert_eq!(
        fev,
        vec![("2024-02-01".to_string(), "2024-04-30".to_string())]
    );
    assert_eq!(fontes::janelas((2023, 3, 5), 3)[0].1, "2023-03-31");
    assert_eq!(fontes::janelas((2024, 2, 5), 1)[0].1, "2024-02-29");
}

#[test]
fn planejamento_por_modo() {
    let prev = item("foto/deputado/1", "aa");
    let o = "https://x/foto/deputado/1";
    let cond = Condicional {
        etag: prev.etag.clone(),
        modificado: prev.modificado.clone(),
    };
    type Caso<'a> = (Modo, Option<&'a str>, Option<&'a Item>, bool, Plano);
    let cases: Vec<Caso> = vec![
        (Modo::Incremental, Some(o), None, false, Plano::Baixar(None)),
        (Modo::Completo, Some(o), None, false, Plano::Baixar(None)),
        (Modo::Incremental, Some(o), Some(&prev), true, Plano::Manter),
        (Modo::Incremental, None, Some(&prev), true, Plano::Manter),
        (
            Modo::Incremental,
            Some(o),
            Some(&prev),
            false,
            Plano::Baixar(None),
        ),
        (
            Modo::Incremental,
            Some("https://outra"),
            Some(&prev),
            true,
            Plano::Baixar(None),
        ),
        (
            Modo::Completo,
            Some(o),
            Some(&prev),
            true,
            Plano::Baixar(Some(cond.clone())),
        ),
        (
            Modo::Completo,
            Some("https://outra"),
            Some(&prev),
            true,
            Plano::Baixar(None),
        ),
        (
            Modo::Completo,
            Some(o),
            Some(&prev),
            false,
            Plano::Baixar(None),
        ),
    ];
    for (i, (modo, origem, ant, ok, want)) in cases.into_iter().enumerate() {
        assert_eq!(planejar(modo, origem, ant, ok), want, "caso {i}");
    }
    assert_eq!("incremental".parse::<Modo>().unwrap(), Modo::Incremental);
    assert_eq!("completo".parse::<Modo>().unwrap(), Modo::Completo);
    assert!("x".parse::<Modo>().is_err());
}

#[test]
fn decisao_por_sha_e_etag() {
    let prev = item("foto/deputado/1", &imagem::sha256_hex(b"igual"));
    // 304 -> reaproveita, atualizando validadores quando vierem.
    match decidir(
        Some(&prev),
        &Resposta::NaoModificado {
            etag: Some("\"e2\"".into()),
            modificado: None,
        },
    ) {
        Decisao::Reaproveitar(i) => {
            assert_eq!(i.etag.as_deref(), Some("\"e2\""));
            assert_eq!(i.modificado, prev.modificado);
            assert_eq!(i.sha256, prev.sha256);
        }
        d => panic!("{d:?}"),
    }
    // 200 com o mesmo sha -> reaproveita (sem reencode).
    let corpo = |b: &[u8]| Resposta::Corpo {
        dados: b.to_vec(),
        etag: Some("\"e3\"".into()),
        modificado: None,
    };
    match decidir(Some(&prev), &corpo(b"igual")) {
        Decisao::Reaproveitar(i) => assert_eq!(i.etag.as_deref(), Some("\"e3\"")),
        d => panic!("{d:?}"),
    }
    // 200 com sha diferente -> gerar.
    assert!(matches!(
        decidir(Some(&prev), &corpo(b"novo")),
        Decisao::Gerar
    ));
    assert!(matches!(decidir(None, &corpo(b"novo")), Decisao::Gerar));
    // 304 sem anterior é inválido -> gerar não é possível; trata como falha.
    assert!(matches!(
        decidir(
            None,
            &Resposta::NaoModificado {
                etag: None,
                modificado: None
            }
        ),
        Decisao::Falha
    ));
}

#[test]
fn limites_de_tamanho() {
    let mut o = Orcamento::new(100, 40);
    assert!(o.arquivo_ok(40));
    assert!(!o.arquivo_ok(41));
    assert!(o.reservar(40));
    assert!(o.reservar(40));
    assert!(!o.reservar(30), "passaria do total");
    assert!(o.reservar(20));
    assert_eq!(o.usado(), 100);
    o.contar(5); // itens mantidos sempre contam
    assert_eq!(o.usado(), 105);
    assert!(!o.reservar(1));
}

#[test]
fn manifesto_ordenado_e_gerado_estavel() {
    let a = item("foto/deputado/2", "bb");
    let b = item("foto/deputado/1", "aa");
    let m1 = Manifesto::finalizar(None, vec![a.clone(), b.clone()], "2026-10-01T10:00:00Z");
    assert_eq!(m1.itens[0].chave, "foto/deputado/1");
    assert_eq!(m1.gerado, "2026-10-01T10:00:00Z");
    // Mesmos itens -> mesmo `gerado` -> JSON idêntico (sem churn).
    let m2 = Manifesto::finalizar(
        Some(&m1),
        vec![b.clone(), a.clone()],
        "2026-11-01T10:00:00Z",
    );
    assert_eq!(m2.to_json(), m1.to_json());
    assert!(!m1.mudou_de(Some(&m2)));
    // Item alterado -> novo `gerado`.
    let mut c = a.clone();
    c.sha256 = "cc".into();
    let m3 = Manifesto::finalizar(Some(&m1), vec![b, c], "2026-11-01T10:00:00Z");
    assert_eq!(m3.gerado, "2026-11-01T10:00:00Z");
    assert!(m3.mudou_de(Some(&m1)));
    assert!(m1.mudou_de(None));
    // Ida e volta.
    let back: Manifesto = serde_json::from_str(&m3.to_json()).unwrap();
    assert_eq!(back, m3);
    let v: serde_json::Value = serde_json::from_str(&m3.to_json()).unwrap();
    assert_eq!(v["itens"][0]["tipo"], "foto");
    assert!(v["itens"][0]["variantes"].is_array());
}

#[test]
fn orfaos_entre_manifestos() {
    let a = item("foto/deputado/1", "aa");
    let b = item("foto/deputado/2", "bb");
    let ant = Manifesto::finalizar(None, vec![a.clone(), b], "t");
    let novo = Manifesto::finalizar(None, vec![a], "t");
    assert_eq!(
        orfaos(&ant, &novo),
        vec!["foto/deputado/2-160.webp".to_string()]
    );
    assert!(orfaos(&novo, &novo).is_empty());
}

fn foto_teste(w: u32, h: u32) -> Vec<u8> {
    let img = image::RgbImage::from_fn(w, h, |x, y| {
        image::Rgb([(x % 256) as u8, (y % 256) as u8, 128])
    });
    let mut out = std::io::Cursor::new(Vec::new());
    image::DynamicImage::ImageRgb8(img)
        .write_to(&mut out, image::ImageFormat::Png)
        .unwrap();
    out.into_inner()
}

#[test]
fn variantes_de_foto_deterministicas() {
    let src = foto_teste(800, 1000);
    let v1 = imagem::foto(&src, "foto/deputado/1").unwrap();
    let v2 = imagem::foto(&src, "foto/deputado/1").unwrap();
    assert_eq!(v1, v2, "saída determinística");
    let nomes: Vec<&str> = v1.iter().map(|(p, _)| p.as_str()).collect();
    assert_eq!(nomes, Alvo::Deputado(1).variantes(false));
    let dims: Vec<(u32, u32)> = v1
        .iter()
        .map(|(_, b)| {
            let i = image::load_from_memory(b).unwrap();
            (i.width(), i.height())
        })
        .collect();
    assert_eq!(dims, vec![(160, 200), (512, 640), (512, 640)]);
    assert_eq!(&v1[0].1[..4], b"RIFF");
    assert_eq!(&v1[2].1[..3], &[0xFF, 0xD8, 0xFF]);
}

#[test]
fn foto_pequena_nao_amplia() {
    let v = imagem::foto(&foto_teste(120, 150), "foto/senador/9").unwrap();
    let i = image::load_from_memory(&v[1].1).unwrap();
    assert_eq!((i.width(), i.height()), (120, 150));
}

#[test]
fn logo_raster_vira_webp_e_svg_passa() {
    let v = imagem::logo(&foto_teste(40, 20), "logo/partido/PT").unwrap();
    assert_eq!(v.len(), 1);
    assert_eq!(v[0].0, "logo/partido/PT.webp");
    let svg = b"<?xml version=\"1.0\"?><svg xmlns=\"http://www.w3.org/2000/svg\"/>";
    assert!(imagem::eh_svg(svg));
    let v = imagem::logo(svg, "logo/partido/PSOL").unwrap();
    assert_eq!(v, vec![("logo/partido/PSOL.svg".to_string(), svg.to_vec())]);
    assert!(imagem::foto(b"not an image", "foto/deputado/1").is_err());
}

#[test]
fn pdf_valida_assinatura() {
    assert!(imagem::eh_pdf(b"%PDF-1.7 ..."));
    assert!(!imagem::eh_pdf(b"<html>"));
}

#[test]
fn novos_alvos() {
    let foto = |c: &str| {
        vec![
            format!("{c}-160.webp"),
            format!("{c}-512.webp"),
            format!("{c}-512.jpg"),
        ]
    };
    let cases: Vec<(Alvo, &str, Tipo, Vec<String>)> = vec![
        (
            Alvo::Prefeito("3550308".into()),
            "foto/prefeito/3550308",
            Tipo::Foto,
            foto("foto/prefeito/3550308"),
        ),
        (
            Alvo::VicePrefeito("3550308".into()),
            "foto/vice-prefeito/3550308",
            Tipo::Foto,
            foto("foto/vice-prefeito/3550308"),
        ),
        (
            Alvo::BandeiraUf("SP".into()),
            "bandeira/uf/SP",
            Tipo::Bandeira,
            vec!["bandeira/uf/SP.svg".into(), "bandeira/uf/SP-64.webp".into()],
        ),
        (
            Alvo::BandeiraBrasil,
            "bandeira/pais/BR",
            Tipo::Bandeira,
            vec![
                "bandeira/pais/BR.svg".into(),
                "bandeira/pais/BR-64.webp".into(),
            ],
        ),
    ];
    for (alvo, chave, tipo, variantes) in cases {
        assert_eq!(alvo.chave(), chave);
        assert_eq!(alvo.tipo(), tipo);
        assert_eq!(alvo.variantes(true), variantes, "{chave}");
    }
}

#[test]
fn bandeiras_das_27_ufs_e_do_brasil() {
    let b = fontes::bandeiras();
    assert_eq!(b.len(), 28);
    let ufs: std::collections::BTreeSet<_> = b
        .iter()
        .filter_map(|f| match &f.alvo {
            Alvo::BandeiraUf(u) => Some(u.clone()),
            _ => None,
        })
        .collect();
    assert_eq!(ufs.len(), 27);
    assert!(b.iter().any(|f| f.alvo == Alvo::BandeiraBrasil
        && f.origem == Origem::Commons("Flag of Brazil.svg".into())));
    let v = json!({"query":{"pages":{"1":{"title":"File:Flag of Brazil.svg","imageinfo":[{
        "url":"https://upload.wikimedia.org/wikipedia/commons/0/05/Flag_of_Brazil.svg?utm_source=x",
        "extmetadata":{"LicenseShortName":{"value":"Public domain"}}}]}}}});
    assert_eq!(
        fontes::commons(&v),
        Some((
            "https://upload.wikimedia.org/wikipedia/commons/0/05/Flag_of_Brazil.svg".to_string(),
            Some("Public domain".to_string())
        ))
    );
    assert_eq!(
        fontes::commons(&json!({"query":{"pages":{"-1":{"missing":""}}}})),
        None
    );
    assert!(
        fontes::commons_api("Flag of Brazil.svg").contains("titles=File%3AFlag%20of%20Brazil.svg")
    );
}

#[test]
fn prefeitos_do_tse_com_sq() {
    let dir = std::env::temp_dir().join(format!("emenda-assets-tse-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(
        dir.join("consulta_cand_2024_SP.csv"),
        "\"NR_TURNO\";\"SG_UF\";\"SG_UE\";\"NM_UE\";\"DS_CARGO\";\"NR_CANDIDATO\";\"SQ_CANDIDATO\";\"NM_URNA_CANDIDATO\";\"SG_PARTIDO\";\"DS_SIT_TOT_TURNO\"\n\
\"2\";\"SP\";\"71072\";\"SAO PAULO\";\"PREFEITO\";\"15\";\"250002000001\";\"RICARDO NUNES\";\"MDB\";\"ELEITO\"\n\
\"2\";\"SP\";\"71072\";\"SAO PAULO\";\"VICE-PREFEITO\";\"15\";\"250002000002\";\"CORONEL MELLO\";\"PL\";\"ELEITO\"\n",
    )
    .unwrap();
    let mun = std::collections::HashMap::from([(
        etl::norm::chave_municipio("São Paulo", "SP"),
        "3550308".to_string(),
    )]);
    let tse = etl::read::tse(&dir, &mun).unwrap();
    let p = &tse.por_ibge["3550308"];
    assert_eq!(p.sq, "250002000001");
    assert_eq!(p.vice.as_ref().unwrap().sq, "250002000002");
    // Contract unchanged: sq is not serialized.
    assert!(!serde_json::to_string(p).unwrap().contains("2500020000"));
    let f = fontes::prefeitos(&tse);
    assert_eq!(
        f,
        vec![
            fontes::FotoTse {
                alvo: Alvo::Prefeito("3550308".into()),
                ano: 2024,
                uf: "SP".into(),
                sq: 250002000001
            },
            fontes::FotoTse {
                alvo: Alvo::VicePrefeito("3550308".into()),
                ano: 2024,
                uf: "SP".into(),
                sq: 250002000002
            },
        ]
    );
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn zip_de_fotos_do_tse() {
    assert_eq!(
        fontes::zip_tse(2024, "SP"),
        "https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2024/fotos/foto_cand2024_SP_div.zip"
    );
    let cases = [
        ("FAC10001954238_div.jpeg", Some(10001954238)),
        ("FSP250002000001_div.jpg", Some(250002000001)),
        ("leiame.pdf", None),
        ("FSPabc_div.jpeg", None),
    ];
    for (n, want) in cases {
        assert_eq!(fontes::sq_da_entrada(n), want, "{n}");
    }
}

#[test]
fn zip_remoto_le_por_faixas() {
    use std::io::{Read, Write};
    let mut buf = std::io::Cursor::new(Vec::new());
    {
        let mut z = zip::ZipWriter::new(&mut buf);
        let o = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored);
        for i in 0..50u32 {
            z.start_file(format!("FSP{i}_div.jpeg"), o).unwrap();
            z.write_all(&vec![i as u8; 3000]).unwrap();
        }
        z.finish().unwrap();
    }
    let dados = buf.into_inner();
    let chamadas = std::cell::Cell::new(0);
    let leitor = etl::assets::zipremoto::Faixas::new(dados.len() as u64, 4096, |ini, fim| {
        chamadas.set(chamadas.get() + 1);
        Ok(dados[ini as usize..=fim as usize].to_vec())
    });
    let mut z = zip::ZipArchive::new(leitor).unwrap();
    let mut out = Vec::new();
    z.by_name("FSP7_div.jpeg")
        .unwrap()
        .read_to_end(&mut out)
        .unwrap();
    assert_eq!(out, vec![7u8; 3000]);
    assert!(
        chamadas.get() < 20,
        "lê só o necessário: {}",
        chamadas.get()
    );
}

#[test]
fn bandeira_svg_mais_webp_64() {
    let svg = br##"<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="#090"/></svg>"##;
    let v = imagem::bandeira(svg, "bandeira/uf/SP").unwrap();
    assert_eq!(v[0], ("bandeira/uf/SP.svg".to_string(), svg.to_vec()));
    assert_eq!(v[1].0, "bandeira/uf/SP-64.webp");
    let i = image::load_from_memory(&v[1].1).unwrap();
    assert_eq!((i.width(), i.height()), (64, 43));
    assert_eq!(v, imagem::bandeira(svg, "bandeira/uf/SP").unwrap());
    assert!(imagem::bandeira(b"<html/>", "bandeira/uf/SP").is_err());
}

#[test]
fn licenca_no_manifesto() {
    let mut i = item("bandeira/uf/SP", "aa");
    i.tipo = Tipo::Bandeira;
    i.licenca = Some("Public domain".into());
    let m = Manifesto::finalizar(None, vec![i], "t");
    let v: serde_json::Value = serde_json::from_str(&m.to_json()).unwrap();
    assert_eq!(v["itens"][0]["licenca"], "Public domain");
    assert_eq!(v["itens"][0]["tipo"], "bandeira");
    let sem = Manifesto::finalizar(None, vec![item("foto/deputado/1", "aa")], "t");
    assert!(!sem.to_json().contains("licenca"));
}

#[test]
fn emblemas_municipais_do_wikidata() {
    let v = json!({"results":{"bindings":[
        {"ibge":{"value":"3500550"},
         "flag":{"value":"http://commons.wikimedia.org/wiki/Special:FilePath/Bandeira%20%C3%81guas%20de%20Santa%20B%C3%A1rbara.png"},
         "coa":{"value":"http://commons.wikimedia.org/wiki/Special:FilePath/Bras%C3%A3o.svg"}},
        {"ibge":{"value":"3500550"},
         "flag":{"value":"http://commons.wikimedia.org/wiki/Special:FilePath/Outra.png"}},
        {"ibge":{"value":"123"}},
        {"ibge":{"value":"1100015"}}]}});
    let e = fontes::wikidata_emblemas(&v);
    assert_eq!(
        e,
        vec![
            (
                Alvo::BandeiraMunicipio("3500550".into()),
                "Bandeira Águas de Santa Bárbara.png".to_string()
            ),
            (
                Alvo::BrasaoMunicipio("3500550".into()),
                "Brasão.svg".to_string()
            ),
        ]
    );
    assert_eq!(
        Alvo::BandeiraMunicipio("1".into()).chave(),
        "bandeira/municipio/1"
    );
    assert_eq!(
        Alvo::BrasaoMunicipio("1".into()).chave(),
        "brasao/municipio/1"
    );
    assert_eq!(Alvo::BrasaoMunicipio("1".into()).tipo(), Tipo::Bandeira);
    assert_eq!(
        Alvo::BandeiraMunicipio("1".into()).variantes(false),
        vec![
            "bandeira/municipio/1-64.webp",
            "bandeira/municipio/1-256.webp"
        ]
    );
}

#[test]
fn creditos_do_commons_em_lote() {
    let api = fontes::commons_lote_api(&["A b.png".to_string(), "Brasão.svg".to_string()], 256);
    assert!(api.contains("iiurlwidth=256"));
    assert!(api.contains("titles=File%3AA%20b.png%7CFile%3ABras%C3%A3o.svg"));
    let v = json!({"query":{
        "normalized":[{"from":"File:A b.png","to":"File:A b.png"}],
        "pages":{
            "1":{"title":"File:A b.png","imageinfo":[{
                "thumburl":"https://upload.wikimedia.org/thumb/a/ab/A_b.png/256px-A_b.png",
                "url":"https://upload.wikimedia.org/a/ab/A_b.png",
                "descriptionurl":"https://commons.wikimedia.org/wiki/File:A_b.png",
                "extmetadata":{"LicenseShortName":{"value":"CC BY-SA 4.0"},
                    "Artist":{"value":"<a href=\"//x\">Fulano</a> de Tal"},
                    "AttributionRequired":{"value":"true"}}}]},
            "-1":{"title":"File:Brasão.svg","missing":""}}}});
    let m = fontes::commons_lote(&v);
    assert_eq!(m.len(), 1);
    let c = &m["A b.png"];
    assert_eq!(
        c.url,
        "https://upload.wikimedia.org/thumb/a/ab/A_b.png/256px-A_b.png"
    );
    assert_eq!(c.licenca.as_deref(), Some("CC BY-SA 4.0"));
    assert_eq!(c.autor.as_deref(), Some("Fulano de Tal"));
    assert_eq!(
        c.pagina.as_deref(),
        Some("https://commons.wikimedia.org/wiki/File:A_b.png")
    );
    assert!(c.atribuicao);
}

#[test]
fn emblema_gera_webp_64_e_256() {
    let v = imagem::emblema(&foto_teste(300, 200), "bandeira/municipio/1").unwrap();
    let nomes: Vec<&str> = v.iter().map(|(p, _)| p.as_str()).collect();
    assert_eq!(
        nomes,
        vec![
            "bandeira/municipio/1-64.webp",
            "bandeira/municipio/1-256.webp"
        ]
    );
    let i = image::load_from_memory(&v[1].1).unwrap();
    assert_eq!((i.width(), i.height()), (256, 171));
    let svg = br##"<svg xmlns="http://www.w3.org/2000/svg" width="30" height="20"><rect width="30" height="20" fill="#090"/></svg>"##;
    let s = imagem::emblema(svg, "brasao/municipio/1").unwrap();
    assert_eq!(image::load_from_memory(&s[0].1).unwrap().width(), 64);
}

#[test]
fn credito_por_municipio() {
    let mut b = item("bandeira/municipio/3550308", "aa");
    b.licenca = Some("CC BY-SA 4.0".into());
    b.autor = Some("Fulano".into());
    let c = item("brasao/municipio/3550308", "bb");
    let m = Manifesto::finalizar(None, vec![b, c, item("foto/deputado/1", "x")], "t");
    let out = etl::assets::executar::creditos_municipio(&m);
    assert_eq!(out.len(), 1);
    assert_eq!(out[0].0, "credito/municipio/3550308.json");
    let v: serde_json::Value = serde_json::from_str(&out[0].1).unwrap();
    assert_eq!(v["bandeira"]["licenca"], "CC BY-SA 4.0");
    assert_eq!(v["bandeira"]["autor"], "Fulano");
    assert!(v["brasao"].is_object());
}

#[test]
fn eleitos_2022_do_tse() {
    let dir = std::env::temp_dir().join(format!("emenda-assets-tse22-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(
        dir.join("consulta_cand_2022_SP.csv"),
        "\"SG_UF\";\"DS_CARGO\";\"SQ_CANDIDATO\";\"NM_CANDIDATO\";\"NM_URNA_CANDIDATO\";\"DS_SIT_TOT_TURNO\"\n\
\"SP\";\"DEPUTADO ESTADUAL\";\"250001\";\"MARIA DA SILVA\";\"MARIA\";\"ELEITO POR QP\"\n\
\"SP\";\"DEPUTADO ESTADUAL\";\"250002\";\"JOSE\";\"ZE\";\"SUPLENTE\"\n\
\"SP\";\"1º SUPLENTE\";\"250003\";\"ANA\";\"ANA\";\"ELEITO\"\n\
\"BR\";\"PRESIDENTE\";\"1\";\"X\";\"X\";\"ELEITO\"\n\
\"SP\";\"DEPUTADO ESTADUAL\";\"250001\";\"MARIA DA SILVA\";\"MARIA\";\"ELEITO POR QP\"\n",
    )
    .unwrap();
    let e = etl::assets::tse::eleitos(&dir, 2022).unwrap();
    assert_eq!(e.len(), 2);
    assert_eq!(e[0].foto.alvo, Alvo::CandidatoTse(2022, 250001));
    assert_eq!(e[0].foto.uf, "SP");
    assert_eq!(
        e[0].nomes,
        vec!["MARIA DA SILVA".to_string(), "MARIA".to_string()]
    );
    assert_eq!(e[0].cargo, "DEPUTADO ESTADUAL");
    assert_eq!(e[1].foto.sq, 250003);
    assert_eq!(Alvo::CandidatoTse(2022, 1).chave(), "foto/tse/2022/1");
    assert_eq!(Alvo::CandidatoTse(2022, 1).tipo(), Tipo::Foto);
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn indice_por_nome() {
    use etl::assets::nomes::{indice, slug, Nome};
    assert_eq!(slug("Tabata Amaral"), "tabata-amaral");
    assert_eq!(slug("JOSÉ D'ÁVILA Jr."), "jose-d-avila-jr");
    let n = |nome: &str, uf: Option<&str>, chave: &str| Nome {
        nome: nome.into(),
        uf: uf.map(Into::into),
        chave: chave.into(),
    };
    let presentes: std::collections::BTreeSet<String> = ["foto/deputado/1", "foto/tse/2022/9"]
        .iter()
        .map(|s| s.to_string())
        .collect();
    let nomes = vec![
        n("Tabata Amaral", Some("SP"), "foto/deputado/1"),
        n("TABATA AMARAL", Some("SP"), "foto/tse/2022/9"),
        n("Tabata Amaral", Some("SP"), "foto/deputado/1"),
        n("Sem Foto", Some("RJ"), "foto/deputado/2"),
        n("Ana", None, "foto/tse/2022/9"),
    ];
    let idx = indice(&nomes, &presentes);
    assert_eq!(
        idx.keys().cloned().collect::<Vec<_>>(),
        vec!["indice/nomes/a.json", "indice/nomes/t.json"]
    );
    let t: serde_json::Value = serde_json::from_str(&idx["indice/nomes/t.json"]).unwrap();
    assert_eq!(
        t,
        json!({"tabata-amaral": [["SP", "foto/deputado/1"], ["SP", "foto/tse/2022/9"]]})
    );
    let a: serde_json::Value = serde_json::from_str(&idx["indice/nomes/a.json"]).unwrap();
    assert_eq!(a, json!({"ana": [["", "foto/tse/2022/9"]]}));
}

#[test]
fn nomes_de_deputados_e_senadores() {
    let d = json!({"dados":[{"id":1,"nome":"Tabata Amaral","siglaUf":"SP"}]});
    assert_eq!(
        fontes::nomes_deputados(&d),
        vec![(
            "Tabata Amaral".to_string(),
            Some("SP".to_string()),
            "foto/deputado/1".to_string()
        )]
    );
    let s = json!({"ListaParlamentarEmExercicio":{"Parlamentares":{"Parlamentar":[
        {"IdentificacaoParlamentar":{"CodigoParlamentar":"70","NomeParlamentar":"Renan","NomeCompletoParlamentar":"José Renan","UfParlamentar":"AL"}},
        {"IdentificacaoParlamentar":{"CodigoParlamentar":"5","NomeParlamentar":"Fulano"},"Mandatos":{"Mandato":{"UfParlamentar":"PE"}}}]}}});
    assert_eq!(
        fontes::nomes_senadores(&s),
        vec![
            (
                "Renan".to_string(),
                Some("AL".to_string()),
                "foto/senador/70".to_string()
            ),
            (
                "José Renan".to_string(),
                Some("AL".to_string()),
                "foto/senador/70".to_string()
            ),
            (
                "Fulano".to_string(),
                Some("PE".to_string()),
                "foto/senador/5".to_string()
            ),
        ]
    );
}

#[test]
fn total_do_content_range() {
    use etl::assets::rede::total_content_range;
    assert_eq!(
        total_content_range("bytes 990904320-991378657/991394809"),
        Some(991394809)
    );
    assert_eq!(total_content_range("bytes 0-0/*"), None);
    assert_eq!(total_content_range("x"), None);
}

#[test]
fn cobertura_por_categoria() {
    use etl::assets::cobertura::{eh_pessoa, medir, Pessoa};
    let p = |cat: &'static str, nome: &str, uf: Option<&str>, chave: Option<&str>, antes: bool| {
        Pessoa {
            categoria: cat,
            nome: nome.into(),
            uf: uf.map(Into::into),
            chave: chave.map(Into::into),
            antes,
        }
    };
    let presentes: std::collections::BTreeSet<String> =
        ["foto/deputado/1", "foto/tse/2022/9", "foto/senador/7"]
            .iter()
            .map(|s| s.to_string())
            .collect();
    let indice: std::collections::BTreeMap<String, Vec<(String, String)>> = [
        (
            "tabata-amaral".to_string(),
            vec![("SP".to_string(), "foto/deputado/1".to_string())],
        ),
        (
            "joao-silva".to_string(),
            vec![
                ("RJ".into(), "foto/tse/2022/9".into()),
                ("MG".into(), "foto/senador/7".into()),
            ],
        ),
    ]
    .into_iter()
    .collect();
    let pessoas = vec![
        p("deputados", "x", Some("SP"), Some("foto/deputado/1"), true),
        p("deputados", "y", Some("SP"), Some("foto/deputado/2"), false),
        p("autores", "Tabata Amaral", None, None, false),
        p("autores", "João Silva", None, None, false),
        p("estaduais", "João Silva", Some("MG"), None, false),
    ];
    let l = medir(&pessoas, &presentes, &indice);
    let get = |c: &str| l.iter().find(|x| x.categoria == c).unwrap();
    assert_eq!(
        (
            get("deputados").total,
            get("deputados").antes,
            get("deputados").depois
        ),
        (2, 1, 1)
    );
    assert_eq!((get("autores").total, get("autores").depois), (2, 1));
    assert_eq!(get("estaduais").depois, 1);
    assert!(eh_pessoa("TABATA AMARAL"));
    for n in [
        "BANCADA DE SP",
        "COMISSAO DE SAUDE",
        "COM. DA SAUDE",
        "RELATOR GERAL",
    ] {
        assert!(!eh_pessoa(n), "{n}");
    }
}
