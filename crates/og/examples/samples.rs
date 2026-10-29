//! Writes one PNG per OgKind: `cargo run -p og --example samples -- <out_dir>`.

use og::{png, OgCard, OgKind, OgStat};

fn st(label: &str, value: &str) -> OgStat {
    OgStat {
        label: label.into(),
        value: value.into(),
    }
}

/// Synthetic portrait (PNG) to exercise photo embedding without network.
fn portrait() -> Vec<u8> {
    let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="240" height="300" viewBox="0 0 240 300">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8aa0c8"/><stop offset="1" stop-color="#3b4f78"/></linearGradient></defs>
<rect width="240" height="300" fill="url(#g)"/><circle cx="120" cy="120" r="56" fill="#e2c3a6"/>
<path d="M30 300c0-70 40-110 90-110s90 40 90 110z" fill="#1d2b47"/><path d="M104 196l16 40 16-40z" fill="#fff"/></svg>"##;
    og::render_png(svg, 240, 300).expect("portrait")
}

fn main() {
    let out = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "target/og-samples".into());
    std::fs::create_dir_all(&out).expect("out dir");
    let photo = portrait();
    let cards = [
        ("default", OgCard {
            kind: OgKind::Default,
            eyebrow: String::new(),
            title: "Para onde vai o dinheiro das emendas parlamentares".into(),
            subtitle: "Quem indicou, quanto foi pago e quem recebeu — com dados oficiais.".into(),
            stats: vec![st("pagos em emendas desde 2015", "R$ 248,7 bi"), st("emendas rastreadas", "1,2 mi"), st("municípios beneficiados", "5.570")],
            badge: None, accent: None, photo: None,
        }),
        ("deputado", OgCard {
            kind: OgKind::Deputado,
            eyebrow: "Deputado federal · PL-SP".into(),
            title: "Fulano de Tal da Silva".into(),
            subtitle: "3º mandato · Comissão de Finanças e Tributação".into(),
            stats: vec![st("pago em emendas", "R$ 32,4 mi"), st("emendas indicadas", "128"), st("municípios", "57")],
            badge: Some("PL".into()), accent: Some("#1d3f8f".into()), photo: Some(photo.clone()),
        }),
        ("senador", OgCard {
            kind: OgKind::Senador,
            eyebrow: "Senadora · MDB-PA".into(),
            title: "Maria Aparecida Conceição".into(),
            subtitle: "Emendas individuais e de bancada, 2019–2025".into(),
            stats: vec![st("empenhado", "R$ 61,9 mi"), st("pago", "R$ 44,1 mi")],
            badge: Some("MDB".into()), accent: Some("#00a859".into()), photo: Some(photo.clone()),
        }),
        ("municipio", OgCard {
            kind: OgKind::Municipio,
            eyebrow: "Município · BA".into(),
            title: "Santo Antônio de Jesus".into(),
            subtitle: "Emendas recebidas por área: saúde lidera com 46%".into(),
            stats: vec![st("recebido em 2024", "R$ 18,3 mi"), st("por habitante", "R$ 179"), st("parlamentares autores", "23")],
            badge: None, accent: None, photo: None,
        }),
        ("uf", OgCard {
            kind: OgKind::Uf,
            eyebrow: "Estado · MG".into(),
            title: "Minas Gerais".into(),
            subtitle: "853 municípios · 53 deputados federais · 3 senadores".into(),
            stats: vec![st("pago em emendas", "R$ 4,82 bi"), st("Emendas Pix", "R$ 1,1 bi"), st("municípios", "853")],
            badge: Some("MG".into()), accent: None, photo: None,
        }),
        ("autor", OgCard {
            kind: OgKind::Autor,
            eyebrow: "Autor · Bancada".into(),
            title: "Bancada do Rio Grande do Sul".into(),
            subtitle: "Emendas de bancada estadual impositivas".into(),
            stats: vec![st("indicado", "R$ 287 mi")],
            badge: None, accent: None, photo: None,
        }),
        ("proposicao", OgCard {
            kind: OgKind::Proposicao,
            eyebrow: "Proposição · PEC 45/2019".into(),
            title: "Altera o Sistema Tributário Nacional e dá outras providências sobre a reforma tributária do consumo".into(),
            subtitle: "Autor: Baleia Rossi (MDB-SP) · Situação: transformada em norma jurídica".into(),
            stats: vec![st("votos sim", "382"), st("votos não", "118"), st("emendas apresentadas", "1.040")],
            badge: Some("Aprovada".into()), accent: Some("#009c3b".into()), photo: None,
        }),
        ("votacao", OgCard {
            kind: OgKind::Votacao,
            eyebrow: "Votação · Plenário · 07/07/2023".into(),
            title: "PEC 45/2019 — 1º turno".into(),
            subtitle: "Câmara dos Deputados".into(),
            stats: vec![st("sim", "382"), st("não", "118"), st("abstenções", "3")],
            badge: Some("Aprovada".into()), accent: Some("#009c3b".into()), photo: None,
        }),
        ("partido", OgCard {
            kind: OgKind::Partido,
            eyebrow: "Partido · 99 deputados".into(),
            title: "Partido Liberal".into(),
            subtitle: String::new(),
            stats: vec![st("pago em emendas", "R$ 2,13 bi"), st("parlamentares", "113"), st("média por parlamentar", "R$ 18,8 mi")],
            badge: Some("PL".into()), accent: Some("#ffdf00".into()), photo: None,
        }),
    ];
    for (name, card) in cards {
        let bytes = png(&card).expect("png");
        let path = format!("{out}/{name}.png");
        std::fs::write(&path, bytes).expect("write");
        println!("{path}");
    }
    let voto = og::OgVoto {
        deputado: "Fulana de Tal da Silva".into(),
        partido_uf: "PSB-SP".into(),
        voto: "Sim".into(),
        titulo: "PEC 45/2019 · Altera o Sistema Tributário Nacional.".into(),
        data: "07/07/2023".into(),
        placar: Some((382, 118, 3)),
        photo: Some(photo.clone()),
    };
    let nao = og::OgVoto {
        voto: "Não".into(),
        photo: None,
        deputado: "Beltrano Souza".into(),
        partido_uf: "PL-RJ".into(),
        ..voto.clone()
    };
    let item = |h: &str, s: &str, t: &str| og::OgAgendaItem {
        hora: h.into(),
        sigla: s.into(),
        titulo: t.into(),
    };
    let agenda = og::OgAgenda {
        dia: "quarta-feira, 28 de outubro".into(), casa: "Plenário da Câmara".into(), total: 6,
        items: vec![
            item("13:55", "PL 2630/2020", "Institui a Lei Brasileira de Liberdade, Responsabilidade e Transparência na Internet."),
            item("13:55", "PEC 45/2019", "Altera o Sistema Tributário Nacional."),
            item("13:55", "MPV 1300/2025", "Dispõe sobre a tarifa social de energia elétrica."),
            item("13:55", "REQ 12/2026", "Requer urgência para o PL 4/2025."),
        ],
    };
    for (name, bytes) in [
        ("voto-sim", og::voto_png(&voto)),
        ("voto-nao", og::voto_png(&nao)),
        ("agenda", og::agenda_png(&agenda)),
    ] {
        let path = format!("{out}/{name}.png");
        std::fs::write(&path, bytes.expect("png")).expect("write");
        println!("{path}");
    }

    // Viral cards. `OG_PHOTOS=dir` -> uses dir/{1,2,3}.{webp,jpg,png} and dir/flag.svg when present.
    let local = |name: &str| -> Option<Vec<u8>> {
        let dir = std::env::var("OG_PHOTOS").ok()?;
        ["webp", "jpg", "png", "svg"]
            .iter()
            .find_map(|e| std::fs::read(format!("{dir}/{name}.{e}")).ok())
    };
    let face = |i: &str, nome: &str, detalhe: &str| og::OgFace {
        nome: nome.into(),
        detalhe: detalhe.into(),
        photo: local(i).or_else(|| Some(photo.clone())),
    };
    let municipio = og::OgViral {
        rotulo: "Dinheiro mandado por políticos".into(),
        secundario: "emendas parlamentares · 2015–2026".into(),
        numero: "R$ 2,6 mi".into(),
        frase: "chegaram em Iraquara (BA)".into(),
        gancho: "40% sem dizer para quê. Quem mandou?".into(),
        faces: vec![
            face("1", "Paulo Magalhães", "PSD-BA · R$ 1,2 mi"),
            face("2", "Otto Alencar", "PSD-BA · R$ 800 mil"),
            og::OgFace {
                nome: "Bancada da Bahia".into(),
                detalhe: "R$ 300 mil".into(),
                photo: None,
            },
        ],
        bandeira: local("flag"),
        ..Default::default()
    };
    let deputado = og::OgViral {
        rotulo: "Dinheiro mandado por políticos".into(),
        secundario: "deputado federal · emendas parlamentares".into(),
        numero: "R$ 98,8 mi".into(),
        frase: "mandados por Arthur Lira para 214 cidades".into(),
        gancho: "R$ 21 mi sem dizer para quê. Veja onde caiu".into(),
        retrato: local("1").or_else(|| Some(photo.clone())),
        selo: Some("PP".into()),
        bandeira: local("flag"),
        ..Default::default()
    };
    let votacao = og::OgViral {
        rotulo: "Como a Câmara votou".into(),
        secundario: "Plenário · 07/07/2023".into(),
        numero: "382 x 118".into(),
        frase: "PEC 45/2019 · Reforma tributária".into(),
        gancho: "Aprovada. Veja como votou cada deputado".into(),
        placar: Some((382, 118, 13)),
        ..Default::default()
    };
    for (name, v) in [
        ("viral-municipio", municipio),
        ("viral-deputado", deputado),
        ("viral-votacao", votacao),
    ] {
        let path = format!("{out}/{name}.png");
        std::fs::write(&path, og::viral_png(&v).expect("png")).expect("write");
        println!("{path}");
    }
}
