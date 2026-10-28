use og::{png, svg, OgCard, OgKind, OgStat, HEIGHT, WIDTH};

const KINDS: [OgKind; 9] = [
    OgKind::Default,
    OgKind::Deputado,
    OgKind::Senador,
    OgKind::Municipio,
    OgKind::Uf,
    OgKind::Autor,
    OgKind::Proposicao,
    OgKind::Votacao,
    OgKind::Partido,
];

fn stat(label: &str, value: &str) -> OgStat {
    OgStat {
        label: label.into(),
        value: value.into(),
    }
}

fn card(kind: OgKind) -> OgCard {
    OgCard {
        kind,
        eyebrow: "DEPUTADO FEDERAL · PL-SP".into(),
        title: "Fulana de Tal & Cia <teste>".into(),
        subtitle: "Emendas \"pagas\" em 2024 — São Paulo".into(),
        stats: vec![
            stat("pago em emendas", "R$ 32,4 mi"),
            stat("emendas", "128"),
            stat("municípios", "57"),
        ],
        badge: Some("PL".into()),
        accent: None,
        photo: None,
    }
}

fn parse(svg: &str) -> resvg::usvg::Tree {
    resvg::usvg::Tree::from_str(svg, &resvg::usvg::Options::default()).expect("valid svg")
}

fn png_dims(bytes: &[u8]) -> (u32, u32) {
    assert_eq!(&bytes[..8], b"\x89PNG\r\n\x1a\n", "png signature");
    let w = u32::from_be_bytes(bytes[16..20].try_into().unwrap());
    let h = u32::from_be_bytes(bytes[20..24].try_into().unwrap());
    (w, h)
}

// 1x1 transparent PNG.
const TINY_PNG: &[u8] = &[
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
    0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
    0x42, 0x60, 0x82,
];

#[test]
fn every_kind_renders_valid_1200x630_svg() {
    for kind in KINDS {
        let s = svg(&card(kind));
        assert!(s.starts_with("<svg"), "{kind:?}");
        assert!(
            s.contains(r#"width="1200""#) && s.contains(r#"height="630""#),
            "{kind:?}"
        );
        let tree = parse(&s);
        assert_eq!(
            (tree.size().width(), tree.size().height()),
            (WIDTH as f32, HEIGHT as f32)
        );
    }
}

#[test]
fn every_kind_renders_png_with_signature_and_dims() {
    for kind in KINDS {
        let bytes = png(&card(kind)).expect("png");
        assert_eq!(png_dims(&bytes), (WIDTH, HEIGHT), "{kind:?}");
    }
}

#[test]
fn user_text_is_xml_escaped() {
    let s = svg(&card(OgKind::Deputado));
    assert!(s.contains("&amp; Cia &lt;teste&gt;"));
    assert!(s.contains("&quot;pagas&quot;"));
    assert!(!s.contains("<teste>"));
}

#[test]
fn footer_brand_and_badge_are_present() {
    let s = svg(&card(OgKind::Partido));
    assert!(s.contains("transparência das emendas parlamentares"));
    assert!(s.contains(">PL<"));
    let mut c = card(OgKind::Partido);
    c.badge = None;
    assert!(!svg(&c).contains(r#"id="badge""#));
}

#[test]
fn long_title_is_truncated_with_ellipsis() {
    let mut c = card(OgKind::Proposicao);
    c.title = "Altera a Constituição Federal para dispor sobre a execução obrigatória das emendas \
               parlamentares individuais e de bancada ao orçamento da União e dá outras providências"
        .into();
    let s = svg(&c);
    assert!(s.contains('…'));
    parse(&s);
}

#[test]
fn stats_are_capped_at_three_and_optional() {
    let mut c = card(OgKind::Municipio);
    c.stats.push(stat("quarta", "999"));
    let s = svg(&c);
    assert_eq!(s.matches(r#"class="stat""#).count(), 3);
    assert!(!s.contains("quarta"));
    c.stats.clear();
    let s = svg(&c);
    assert_eq!(s.matches(r#"class="stat""#).count(), 0);
    parse(&s);
}

#[test]
fn photo_is_embedded_as_data_uri() {
    let mut c = card(OgKind::Deputado);
    c.photo = Some(TINY_PNG.to_vec());
    let s = svg(&c);
    assert!(s.contains("data:image/png;base64,iVBORw0KGgo"));
    let jpeg = [0xFF, 0xD8, 0xFF, 0xE0, 0, 0];
    c.photo = Some(jpeg.to_vec());
    assert!(svg(&c).contains("data:image/jpeg;base64,"));
    c.photo = Some(b"not an image".to_vec());
    assert!(!svg(&c).contains("<image"), "unknown formats are ignored");
    c.photo = Some(TINY_PNG.to_vec());
    assert_eq!(png_dims(&png(&c).unwrap()), (WIDTH, HEIGHT));
}

#[test]
fn accent_accepts_only_hex_colors() {
    let mut c = card(OgKind::Partido);
    c.accent = Some("#ff0066".into());
    assert!(svg(&c).contains("#ff0066"));
    c.accent = Some("red\"/><script>".into());
    let s = svg(&c);
    assert!(!s.contains("script"));
    parse(&s);
}

#[test]
fn rendering_is_deterministic() {
    let c = card(OgKind::Votacao);
    assert_eq!(svg(&c), svg(&c));
}

#[test]
fn footer_signature_keeps_separator_spacing() {
    let s = svg(&card(OgKind::Default));
    assert!(s.contains(">· transparência das emendas parlamentares<"));
}

#[test]
fn single_stat_tile_is_not_full_width() {
    let mut c = card(OgKind::Autor);
    c.stats.truncate(1);
    let s = svg(&c);
    assert!(!s.contains(r#"width="1072" height="124""#));
}

#[test]
fn brand_outline_converts_text_to_paths() {
    let src = r##"<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><text x="0" y="44" font-family="Space Grotesk" font-weight="700" font-size="44">emenda.online</text></svg>"##;
    let out = og::brand::outline(src).expect("outline");
    assert!(!out.contains("<text"));
    assert!(out.contains("<path"));
}

#[test]
fn brand_mark_is_valid_svg() {
    parse(&og::brand::mark_svg());
}

#[test]
fn site_default_card_is_generic_and_renders() {
    let c = OgCard::site_default();
    assert_eq!(c.kind, OgKind::Default);
    assert!(c.photo.is_none());
    parse(&svg(&c));
}

#[test]
fn brand_name_is_emenda_online() {
    for kind in [OgKind::Default, OgKind::Deputado, OgKind::Partido] {
        let s = svg(&card(kind));
        assert!(s.contains(">emenda.online<"), "footer signature");
        assert!(s.contains(">.online<"), "wordmark accent");
        assert!(!s.contains("emenda.pl"));
        assert!(!s.contains(">.pl<"));
    }
}
