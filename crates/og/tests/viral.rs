//! Viral card: faces + one huge number + a curiosity hook.
use og::{viral_png, viral_svg, OgFace, OgViral, HEIGHT, WIDTH};

fn png_dims(bytes: &[u8]) -> (u32, u32) {
    assert_eq!(&bytes[..8], b"\x89PNG\r\n\x1a\n");
    (
        u32::from_be_bytes(bytes[16..20].try_into().unwrap()),
        u32::from_be_bytes(bytes[20..24].try_into().unwrap()),
    )
}

fn tiny_png() -> Vec<u8> {
    og::render_png(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#c96"/></svg>"##,
        8,
        8,
    )
    .unwrap()
}

fn face(nome: &str, photo: bool) -> OgFace {
    OgFace {
        nome: nome.into(),
        detalhe: "R$ 1,2 mi".into(),
        photo: photo.then(tiny_png),
    }
}

fn municipio() -> OgViral {
    OgViral {
        rotulo: "Dinheiro mandado por políticos".into(),
        secundario: "emendas parlamentares · 2015–2026".into(),
        numero: "R$ 2,6 mi".into(),
        frase: "chegaram em Iraquara (BA)".into(),
        gancho: "40% sem dizer para quê. Quem mandou?".into(),
        faces: vec![
            face("Paulo Magalhães", true),
            face("Bia <Lima>", false),
            face("Otto Alencar", true),
            face("Quarto Nome", true),
        ],
        ..OgViral::default()
    }
}

#[test]
fn viral_card_leads_with_number_phrase_and_hook() {
    let s = viral_svg(&municipio());
    for needle in [
        ">R$ 2,6 mi<",
        ">chegaram em Iraquara (BA)<",
        "40% sem dizer para quê.",
        ">DINHEIRO MANDADO POR POLÍTICOS<",
        "emendas parlamentares · 2015–2026",
    ] {
        assert!(s.contains(needle), "missing {needle}");
    }
}

#[test]
fn viral_faces_max_three_with_photo_or_initials() {
    let s = viral_svg(&municipio());
    assert!(s.contains("Paulo Magalhães"));
    assert!(s.contains("Bia &lt;Lima&gt;"));
    assert!(s.contains("Otto Alencar"));
    assert!(!s.contains("Quarto Nome"));
    assert_eq!(s.matches(r#"class="face""#).count(), 3);
    assert_eq!(s.matches("data:image/png;base64,").count(), 2);
    assert!(s.contains(">BL<"), "initials fallback");
    assert!(s.contains(">QUEM MANDOU<"));
    let v = OgViral {
        faces_titulo: "Alguns deputados".into(),
        ..municipio()
    };
    assert!(viral_svg(&v).contains(">ALGUNS DEPUTADOS<"));
}

#[test]
fn viral_portrait_party_and_flag() {
    let v = OgViral {
        retrato: Some(tiny_png()),
        selo: Some("PL".into()),
        bandeira: Some(
            br#"<svg xmlns="http://www.w3.org/2000/svg" width="10" height="7"/>"#.to_vec(),
        ),
        logo: Some(tiny_png()),
        ..municipio()
    };
    let s = viral_svg(&v);
    assert!(s.contains(r#"id="retrato""#));
    assert!(s.contains("data:image/svg+xml;base64,"), "flag");
    assert!(s.contains(">PL<"));
    // Portrait replaces the faces strip.
    assert_eq!(s.matches(r#"class="face""#).count(), 0);
}

#[test]
fn viral_hemicycle_one_seat_per_vote() {
    let v = OgViral {
        numero: "382 x 118".into(),
        placar: Some((382, 118, 13)),
        faces: vec![],
        ..municipio()
    };
    let s = viral_svg(&v);
    assert_eq!(s.matches(r#"class="seat""#).count(), 513);
    assert_eq!(s.matches(r##"class="seat" fill="#1fc35f""##).count(), 382);
    assert!(s.contains(">382 SIM<") && s.contains(">118 NÃO<"));
}

#[test]
fn viral_png_renders_with_and_without_extras() {
    for v in [
        municipio(),
        OgViral::default(),
        OgViral {
            retrato: Some(tiny_png()),
            selo: Some("MDB".into()),
            ..municipio()
        },
        OgViral {
            placar: Some((3, 2, 1)),
            ..municipio()
        },
    ] {
        let png = viral_png(&v).expect("png");
        assert_eq!(png_dims(&png), (WIDTH, HEIGHT));
    }
}

#[test]
fn viral_long_text_is_fitted_not_overflowing() {
    let v = OgViral {
        numero: "R$ 1.234.567.890,12 bi".into(),
        frase: "chegaram em Santo Antônio do Descoberto de Todos os Santos da Serra (GO)".repeat(3),
        gancho: "frase longa ".repeat(40),
        ..municipio()
    };
    let s = viral_svg(&v);
    assert!(s.contains('…'));
}

#[test]
fn viral_accepts_gif_logo() {
    // 1x1 GIF (Câmara party logos are GIFs).
    let gif: Vec<u8> = vec![
        0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0x80, 0, 0, 0xff, 0xff, 0xff, 0, 0, 0,
        0x21, 0xf9, 4, 1, 0, 0, 0, 0, 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x44, 1, 0, 0x3b,
    ];
    let v = OgViral {
        selo: Some("PP".into()),
        logo: Some(gif),
        ..municipio()
    };
    assert!(viral_svg(&v).contains("data:image/gif;base64,"));
    assert_eq!(png_dims(&viral_png(&v).unwrap()), (WIDTH, HEIGHT));
}
