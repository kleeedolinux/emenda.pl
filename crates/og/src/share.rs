//! Share cards (1200x630): "como votou" and "agenda do dia".

use std::fmt::Write as _;

use crate::brand::{AMARELO, VERDE};
use crate::card::{base64, close, header, open, photo_mime, text, VERDE_LIGHT};
use crate::text::{fit, width, wrap, Font};
use crate::{HEIGHT, WIDTH};

const PAD: f32 = 64.0;
const W: f32 = WIDTH as f32;
const INK: &str = "#ffffff";
const MUTED: &str = "#a9b7d3";
const NAVY: &str = "#001433";
const NAO: &str = "#d32f2f";
const TILE: &str = "#0a2152";

/// One deputy's vote in one roll call.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OgVoto {
    pub deputado: String,
    /// "PL-RJ".
    pub partido_uf: String,
    /// Raw vote: "Sim", "Não", "Abstenção", "Obstrução", "Artigo 17"...
    pub voto: String,
    /// Proposição / votação description.
    pub titulo: String,
    /// "07/07/2023".
    pub data: String,
    /// (sim, não, outros).
    pub placar: Option<(u32, u32, u32)>,
    /// PNG, JPEG or WebP.
    pub photo: Option<Vec<u8>>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OgAgendaItem {
    /// "13:55".
    pub hora: String,
    /// "PL 2630/2020" or órgão sigla.
    pub sigla: String,
    pub titulo: String,
}

/// What a house has on the agenda for one day.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OgAgenda {
    /// "quarta-feira, 28 de outubro".
    pub dia: String,
    /// "Plenário da Câmara".
    pub casa: String,
    /// Up to 4 are rendered; `total` drives the "+N itens" note.
    pub items: Vec<OgAgendaItem>,
    pub total: usize,
}

fn vote_style(v: &str) -> (&'static str, &'static str) {
    let k = v.trim().to_lowercase();
    if k.starts_with("sim") {
        (VERDE, INK)
    } else if k.starts_with("não") || k.starts_with("nao") {
        (NAO, INK)
    } else {
        (AMARELO, NAVY)
    }
}

fn eyebrow(s: &mut String, y: f32, label: &str) {
    let _ = write!(
        s,
        r#"<rect x="{PAD}" y="{}" width="16" height="4" rx="2" fill="{AMARELO}"/>"#,
        y - 7.0
    );
    let l = wrap(
        &label.to_uppercase(),
        Font::SemiBold,
        21.0,
        W - 2.0 * PAD - 120.0,
        1,
    )
    .join("");
    s.push_str(&text(
        PAD + 28.0,
        y,
        Font::SemiBold,
        21.0,
        AMARELO,
        r#" letter-spacing="2.6""#,
        &l,
    ));
}

fn initials(name: &str) -> String {
    name.split_whitespace()
        .filter_map(|w| w.chars().next())
        .filter(|c| c.is_alphabetic())
        .take(2)
        .flat_map(char::to_uppercase)
        .collect()
}

pub fn voto_svg(v: &OgVoto) -> String {
    let mut s = String::with_capacity(16 * 1024);
    open(&mut s);
    header(&mut s);
    let col = 760.0 - PAD;
    let date = if v.data.trim().is_empty() {
        String::new()
    } else {
        format!(" · {}", v.data.trim())
    };
    eyebrow(&mut s, 172.0, &format!("Como votou{date}"));

    let (nsize, name) = fit(
        v.deputado.trim(),
        Font::Bold,
        &[64.0, 56.0, 48.0, 42.0, 36.0],
        col,
        1,
    );
    s.push_str(&text(
        PAD - 2.0,
        244.0,
        Font::Bold,
        nsize,
        INK,
        r#" letter-spacing="-1""#,
        &name.join(""),
    ));
    s.push_str(&text(
        PAD,
        284.0,
        Font::SemiBold,
        26.0,
        MUTED,
        "",
        v.partido_uf.trim(),
    ));

    // Badge: "VOTOU" + palavra grande.
    let word = v.voto.trim().to_uppercase();
    let (bg, fg) = vote_style(&v.voto);
    let (wsize, wl) = fit(
        &word,
        Font::Figure,
        &[96.0, 84.0, 72.0, 60.0],
        col - 210.0,
        1,
    );
    let ww = width(&wl.join(""), Font::Figure, wsize);
    let bw = 210.0 + ww;
    let _ = write!(
        s,
        r#"<rect id="voto" fill="{bg}" x="{PAD}" y="312" width="{bw}" height="120" rx="24"/>"#
    );
    s.push_str(&text(
        PAD + 32.0,
        384.0,
        Font::SemiBold,
        30.0,
        fg,
        r#" letter-spacing="2""#,
        "VOTOU",
    ));
    s.push_str(&text(
        PAD + 178.0,
        372.0 + wsize * 0.36,
        Font::Figure,
        wsize,
        fg,
        r#" letter-spacing="-1""#,
        &wl.join(""),
    ));

    for (i, line) in wrap(v.titulo.trim(), Font::SemiBold, 26.0, col, 2)
        .iter()
        .enumerate()
    {
        s.push_str(&text(
            PAD,
            482.0 + i as f32 * 34.0,
            Font::SemiBold,
            26.0,
            INK,
            "",
            line,
        ));
    }

    // Foto (ou iniciais) à direita + placar.
    let (cx, cy, r) = (1012.0, 264.0, 112.0); // = clip "pc" em card::open
    let _ = write!(
        s,
        r##"<circle cx="{cx}" cy="{cy}" r="{}" fill="none" stroke="{bg}" stroke-width="4"/><circle cx="{cx}" cy="{cy}" r="{r}" fill="#0b2a63"/>"##,
        r + 12.0
    );
    match v
        .photo
        .as_deref()
        .and_then(|p| photo_mime(p).map(|m| (m, p)))
    {
        Some((mime, bytes)) => {
            let _ = write!(
                s,
                r#"<image href="data:{mime};base64,{}" x="{}" y="{}" width="{d}" height="{d}" preserveAspectRatio="xMidYMin slice" clip-path="url(#pc)"/>"#,
                base64(bytes),
                cx - r,
                cy - r,
                d = 2.0 * r
            );
        }
        None => s.push_str(&text(
            cx,
            cy + 22.0,
            Font::Bold,
            64.0,
            MUTED,
            r#" text-anchor="middle""#,
            &initials(&v.deputado),
        )),
    }
    if let Some((sim, nao, outros)) = v.placar {
        let total = (sim + nao + outros).max(1) as f32;
        let (bx, by, bw) = (cx - 140.0, 430.0, 280.0);
        let ws = bw * sim as f32 / total;
        let wn = bw * nao as f32 / total;
        let _ = write!(
            s,
            r##"<g id="placar"><rect x="{bx}" y="{by}" width="{bw}" height="14" rx="7" fill="#ffffff" fill-opacity="0.15"/><rect x="{bx}" y="{by}" width="{ws}" height="14" rx="7" fill="{VERDE_LIGHT}"/><rect x="{}" y="{by}" width="{wn}" height="14" rx="7" fill="{NAO}"/></g>"##,
            bx + bw - wn
        );
        s.push_str(&text(
            bx,
            by - 14.0,
            Font::SemiBold,
            24.0,
            VERDE_LIGHT,
            "",
            &format!("{sim} Sim"),
        ));
        s.push_str(&text(
            bx + bw,
            by - 14.0,
            Font::SemiBold,
            24.0,
            "#ff6b6b",
            r#" text-anchor="end""#,
            &format!("{nao} Não"),
        ));
        s.push_str(&text(
            cx,
            by + 46.0,
            Font::Regular,
            19.0,
            MUTED,
            r#" text-anchor="middle""#,
            "placar da votação",
        ));
    }
    close(&mut s);
    s
}

pub fn agenda_svg(a: &OgAgenda) -> String {
    let mut s = String::with_capacity(16 * 1024);
    open(&mut s);
    header(&mut s);
    eyebrow(
        &mut s,
        162.0,
        &format!("Agenda do Congresso · {}", a.casa.trim()),
    );
    let (tsize, t) = fit(
        a.dia.trim(),
        Font::Bold,
        &[60.0, 52.0, 46.0, 40.0],
        W - 2.0 * PAD,
        1,
    );
    s.push_str(&text(
        PAD - 2.0,
        228.0,
        Font::Bold,
        tsize,
        INK,
        r#" letter-spacing="-1""#,
        &t.join(""),
    ));
    let shown = a.items.len().min(4);
    let sub = match (a.total, a.total.saturating_sub(shown)) {
        (0, _) => "Pauta ainda não publicada — acompanhe em emenda.online".to_string(),
        (n, 0) => format!("{n} {} em pauta", if n == 1 { "item" } else { "itens" }),
        (n, more) => format!("{n} itens em pauta · +{more} itens no site"),
    };
    s.push_str(&text(PAD, 268.0, Font::Regular, 26.0, MUTED, "", &sub));

    let (top, h, gap) = (292.0, 56.0, 10.0);
    for (i, it) in a.items.iter().take(4).enumerate() {
        let y = top + i as f32 * (h + gap);
        let hora_w = 92.0;
        let sx = PAD + 20.0 + hora_w;
        let sigla = wrap(it.sigla.trim(), Font::Bold, 26.0, 300.0, 1).join("");
        let sw = width(&sigla, Font::Bold, 26.0);
        let tx = sx + sw + 18.0;
        let titulo = wrap(
            it.titulo.trim(),
            Font::Regular,
            22.0,
            (W - PAD - 20.0 - tx).max(0.0),
            1,
        )
        .join("");
        let _ = write!(
            s,
            r##"<g class="item"><rect x="{PAD}" y="{y}" width="{}" height="{h}" rx="14" fill="{TILE}" fill-opacity="0.94" stroke="#ffffff" stroke-opacity="0.12"/>{}{}{}</g>"##,
            W - 2.0 * PAD,
            text(
                PAD + 20.0,
                y + 37.0,
                Font::Figure,
                24.0,
                AMARELO,
                "",
                it.hora.trim()
            ),
            text(sx, y + 37.0, Font::Bold, 26.0, INK, "", &sigla),
            text(tx, y + 36.0, Font::Regular, 22.0, MUTED, "", &titulo),
        );
    }
    close(&mut s);
    s
}

pub fn voto_png(v: &OgVoto) -> Result<Vec<u8>, crate::OgError> {
    crate::render_png(&voto_svg(v), WIDTH, HEIGHT)
}

pub fn agenda_png(a: &OgAgenda) -> Result<Vec<u8>, crate::OgError> {
    crate::render_png(&agenda_svg(a), WIDTH, HEIGHT)
}
