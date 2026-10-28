//! Share cards: voto (como votou) and agenda (pauta do dia).
use og::{
    agenda_png, agenda_svg, voto_png, voto_svg, OgAgenda, OgAgendaItem, OgVoto, HEIGHT, WIDTH,
};

fn png_dims(bytes: &[u8]) -> (u32, u32) {
    assert_eq!(&bytes[..8], b"\x89PNG\r\n\x1a\n");
    (
        u32::from_be_bytes(bytes[16..20].try_into().unwrap()),
        u32::from_be_bytes(bytes[20..24].try_into().unwrap()),
    )
}

fn voto(v: &str) -> OgVoto {
    OgVoto {
        deputado: "Bia Lima <& Cia>".into(),
        partido_uf: "PL-RJ".into(),
        voto: v.into(),
        titulo: "PEC 45/2019 · Altera o Sistema Tributário Nacional e dá outras providências com um texto bem comprido que certamente não cabe em duas linhas do cartão de compartilhamento".into(),
        data: "07/07/2023".into(),
        placar: Some((382, 118, 3)),
        photo: None,
    }
}

fn agenda(n: usize) -> OgAgenda {
    OgAgenda {
        dia: "quarta-feira, 28 de outubro".into(),
        casa: "Plenário da Câmara".into(),
        total: n,
        items: (0..n)
            .map(|i| OgAgendaItem {
                hora: "13:55".into(),
                sigla: format!("PL {i}/2026"),
                titulo: "Institui a Lei Brasileira de Liberdade, Responsabilidade e Transparência na Internet".into(),
            })
            .collect(),
    }
}

#[test]
fn voto_badge_word_and_color_follow_vote() {
    for (v, word, color) in [
        ("Sim", ">SIM<", "#009c3b"),
        ("Não", ">NÃO<", "#d32f2f"),
        ("Abstenção", ">ABSTENÇÃO<", "#ffdf00"),
        ("Obstrução", ">OBSTRUÇÃO<", "#ffdf00"),
    ] {
        let s = voto_svg(&voto(v));
        assert!(s.contains(word), "{v}");
        assert!(s.contains(&format!(r#"id="voto" fill="{color}""#)), "{v}");
    }
}

#[test]
fn voto_card_has_placar_escaped_text_and_brand() {
    let s = voto_svg(&voto("Sim"));
    assert!(s.contains("Bia Lima &lt;&amp; Cia&gt;"));
    assert!(s.contains(">382 Sim<"));
    assert!(s.contains(">118 Não<"));
    assert!(s.contains(">emenda.online<"));
    assert!(s.contains('…'), "long title truncated");
    let mut no = voto("Sim");
    no.placar = None;
    assert!(!voto_svg(&no).contains("Sim<tspan"));
    assert!(!voto_svg(&no).contains(">382 Sim<"));
}

#[test]
fn voto_png_dims_with_and_without_photo() {
    assert_eq!(png_dims(&voto_png(&voto("Não")).unwrap()), (WIDTH, HEIGHT));
    let mut p = voto("Sim");
    p.photo = Some(og::render_png(r##"<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="#f00"/></svg>"##, 4, 4).unwrap());
    let s = voto_svg(&p);
    assert!(s.contains("data:image/png;base64,"));
    assert!(
        !voto_svg(&voto("Sim")).contains("<image"),
        "initials fallback"
    );
    assert_eq!(png_dims(&voto_png(&p).unwrap()), (WIDTH, HEIGHT));
}

#[test]
fn agenda_lists_at_most_four_items() {
    let s = agenda_svg(&agenda(6));
    assert_eq!(s.matches(r#"class="item""#).count(), 4);
    assert!(s.contains("+2 itens"));
    assert!(s.contains("quarta-feira, 28 de outubro"));
    assert!(s.contains("PLENÁRIO DA CÂMARA"));
    assert_eq!(agenda_svg(&agenda(2)).matches(r#"class="item""#).count(), 2);
    let empty = agenda_svg(&agenda(0));
    assert!(empty.contains("Pauta ainda não publicada"));
    assert_eq!(png_dims(&agenda_png(&agenda(4)).unwrap()), (WIDTH, HEIGHT));
}

#[test]
fn share_cards_are_deterministic() {
    assert_eq!(voto_svg(&voto("Sim")), voto_svg(&voto("Sim")));
    assert_eq!(agenda_svg(&agenda(3)), agenda_svg(&agenda(3)));
}
