//! Viral card (1200x630): faces first, one huge number, a curiosity hook.
//!
//! Left: label, number, phrase, hook. Right (first that applies): big portrait,
//! hemicycle (`placar`), or up to 3 faces. Top right: party badge/logo and state flag.

use std::fmt::Write as _;

use crate::brand::AMARELO;
use crate::card::{base64, close, header, open, photo_mime, text, VERDE_LIGHT};
use crate::text::{fit, width, Font};
use crate::{HEIGHT, WIDTH};

const PAD: f32 = 64.0;
const W: f32 = WIDTH as f32;
const INK: &str = "#ffffff";
const MUTED: &str = "#a9b7d3";
const DIM: &str = "#6f82a8";
const NAVY: &str = "#001433";
const NAO: &str = "#ff5a5a";
const OUTROS: &str = "#8fa3c8";
const PANEL_X: f32 = 724.0;
const PANEL_W: f32 = W - PAD - PANEL_X;

/// One politician in the faces strip.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct OgFace {
    pub nome: String,
    /// "PP-AL · R$ 1,2 mi".
    pub detalhe: String,
    /// PNG, JPEG or WebP; None -> initials.
    pub photo: Option<Vec<u8>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct OgViral {
    /// Plain-language label, e.g. "Dinheiro mandado por políticos". Rendered uppercase.
    pub rotulo: String,
    /// Small technical note, e.g. "emendas parlamentares · 2015–2026".
    pub secundario: String,
    /// The one big number: "R$ 2,6 mi".
    pub numero: String,
    /// What the number means: "chegaram em Iraquara (BA)".
    pub frase: String,
    /// Curiosity hook, highlighted: "40% sem dizer para quê. Quem mandou?".
    pub gancho: String,
    /// Up to 3 are rendered (ignored when `retrato` or `placar` is set).
    pub faces: Vec<OgFace>,
    /// Big portrait on the right (PNG, JPEG or WebP).
    pub retrato: Option<Vec<u8>>,
    /// Party sigla (or other short badge).
    pub selo: Option<String>,
    /// Party logo (PNG, JPEG or WebP).
    pub logo: Option<Vec<u8>>,
    /// State flag (SVG, PNG, JPEG or WebP).
    pub bandeira: Option<Vec<u8>>,
    /// (sim, não, outros) -> hemicycle.
    pub placar: Option<(u32, u32, u32)>,
}

fn image_mime(bytes: &[u8]) -> Option<&'static str> {
    photo_mime(bytes).or_else(|| {
        let head = String::from_utf8_lossy(&bytes[..bytes.len().min(256)]);
        let t = head.trim_start_matches('\u{feff}').trim_start();
        (t.starts_with("<svg") || t.starts_with("<?xml")).then_some("image/svg+xml")
    })
}

fn href(bytes: &[u8]) -> Option<String> {
    image_mime(bytes).map(|m| format!("data:{m};base64,{}", base64(bytes)))
}

pub(crate) fn initials(name: &str) -> String {
    name.split_whitespace()
        .filter_map(|w| w.chars().find(|c| c.is_alphanumeric()))
        .take(2)
        .flat_map(char::to_uppercase)
        .collect()
}

/// Seat centers of a hemicycle, left to right (by angle). Pure geometry.
pub(crate) fn hemicycle(n: usize, cx: f32, cy: f32, r0: f32, r1: f32) -> (Vec<(f32, f32)>, f32) {
    if n == 0 {
        return (vec![], 0.0);
    }
    // Rows where radial spacing ~ spacing along the arc (dense, even seats).
    let mid = (r0 + r1) / 2.0;
    let rows = (1..=14usize)
        .min_by(|&a, &b| {
            let err = |k: usize| {
                let radial = if k > 1 {
                    (r1 - r0) / (k - 1) as f32
                } else {
                    r1 - r0
                };
                let arc = std::f32::consts::PI * mid * k as f32 / n as f32;
                (radial - arc).abs()
            };
            err(a).total_cmp(&err(b))
        })
        .unwrap_or(1)
        .min(n);
    let radii: Vec<f32> = (0..rows)
        .map(|k| {
            if rows == 1 {
                (r0 + r1) / 2.0
            } else {
                r0 + (r1 - r0) * k as f32 / (rows - 1) as f32
            }
        })
        .collect();
    let sum: f32 = radii.iter().sum();
    let mut counts: Vec<usize> = radii
        .iter()
        .map(|r| ((n as f32 * r / sum).round() as usize).max(1))
        .collect();
    // Fix rounding on the outer row.
    let assigned: usize = counts[..rows - 1].iter().sum();
    counts[rows - 1] = n.saturating_sub(assigned).max(1);
    let mut seats: Vec<(f32, f32, f32)> = Vec::with_capacity(n);
    for (r, &c) in radii.iter().zip(&counts) {
        for i in 0..c {
            let a = if c == 1 {
                std::f32::consts::FRAC_PI_2
            } else {
                std::f32::consts::PI * (1.0 - i as f32 / (c - 1) as f32)
            };
            seats.push((a, cx + r * a.cos(), cy - r * a.sin()));
        }
    }
    seats.truncate(n);
    seats.sort_by(|a, b| b.0.total_cmp(&a.0));
    let gap = if rows > 1 {
        (r1 - r0) / (rows - 1) as f32
    } else {
        r1 - r0
    };
    let arc = std::f32::consts::PI * radii[rows - 1] / counts[rows - 1].max(1) as f32;
    let seat_r = (gap.min(arc) * 0.44).clamp(1.5, 14.0);
    (seats.into_iter().map(|(_, x, y)| (x, y)).collect(), seat_r)
}

fn tracked(s: &mut String, x: f32, y: f32, size: f32, fill: &str, body: &str, max_w: f32) {
    let (_, l) = fit(&body.to_uppercase(), Font::SemiBold, &[size], max_w, 1);
    s.push_str(&text(
        x,
        y,
        Font::SemiBold,
        size,
        fill,
        r#" letter-spacing="2.4""#,
        &l.join(""),
    ));
}

/// Party badge, logo and flag, right-aligned in the header row.
fn top_right(s: &mut String, v: &OgViral) {
    let mut x = W - PAD;
    let y = 50.0;
    if let Some(h) = v.bandeira.as_deref().and_then(href) {
        let (fw, fh) = (72.0, 50.0);
        x -= fw;
        let _ = write!(
            s,
            r##"<clipPath id="flagc"><rect x="{x}" y="{y}" width="{fw}" height="{fh}" rx="6"/></clipPath><image id="bandeira" href="{h}" x="{x}" y="{y}" width="{fw}" height="{fh}" preserveAspectRatio="xMidYMid slice" clip-path="url(#flagc)"/><rect x="{x}" y="{y}" width="{fw}" height="{fh}" rx="6" fill="none" stroke="#ffffff" stroke-opacity="0.35"/>"##
        );
        x -= 14.0;
    }
    if let Some(sel) = v.selo.as_deref().map(str::trim).filter(|t| !t.is_empty()) {
        let (_, l) = fit(sel, Font::Bold, &[28.0], 220.0, 1);
        let label = l.join("");
        let tw = width(&label, Font::Bold, 28.0);
        let logo = v.logo.as_deref().and_then(href);
        let bw = tw + 36.0 + if logo.is_some() { 46.0 } else { 0.0 };
        x -= bw;
        let _ = write!(
            s,
            r#"<rect id="selo" x="{x}" y="{y}" width="{bw}" height="50" rx="25" fill="{AMARELO}"/>"#
        );
        let mut tx = x + 18.0;
        if let Some(h) = logo {
            let _ = write!(
                s,
                r##"<circle cx="{}" cy="{}" r="18" fill="#ffffff"/><clipPath id="logoc"><circle cx="{}" cy="{}" r="16"/></clipPath><image href="{h}" x="{}" y="{}" width="32" height="32" preserveAspectRatio="xMidYMid meet" clip-path="url(#logoc)"/>"##,
                x + 25.0,
                y + 25.0,
                x + 25.0,
                y + 25.0,
                x + 9.0,
                y + 9.0
            );
            tx += 40.0;
        }
        s.push_str(&text(tx, y + 35.0, Font::Bold, 28.0, NAVY, "", &label));
    }
}

fn left(s: &mut String, v: &OgViral, col: f32) {
    let mut y = 170.0;
    if !v.rotulo.trim().is_empty() {
        let _ = write!(
            s,
            r#"<rect x="{PAD}" y="{}" width="16" height="4" rx="2" fill="{AMARELO}"/>"#,
            y - 7.0
        );
        tracked(s, PAD + 28.0, y, 22.0, AMARELO, v.rotulo.trim(), col - 28.0);
    }
    if !v.secundario.trim().is_empty() {
        y += 32.0;
        let (_, l) = fit(v.secundario.trim(), Font::Regular, &[19.0], col, 1);
        s.push_str(&text(PAD, y, Font::Regular, 19.0, DIM, "", &l.join("")));
    }
    // The number.
    let (nsize, nl) = fit(
        v.numero.trim(),
        Font::Figure,
        &[150.0, 132.0, 116.0, 100.0, 88.0, 76.0, 64.0],
        col,
        1,
    );
    let ny = y + 18.0 + nsize * 0.86;
    if !v.numero.trim().is_empty() {
        s.push_str(&text(
            PAD - 4.0,
            ny,
            Font::Figure,
            nsize,
            INK,
            r#" id="numero" letter-spacing="-3""#,
            &nl.join(""),
        ));
    }
    let mut y = if v.numero.trim().is_empty() {
        y + 30.0
    } else {
        ny + 14.0
    };
    // Phrase.
    let (fsize, fl) = fit(
        v.frase.trim(),
        Font::Bold,
        &[44.0, 40.0, 36.0, 32.0, 28.0],
        col,
        2,
    );
    for line in &fl {
        y += fsize * 1.12;
        s.push_str(&text(
            PAD - 1.0,
            y,
            Font::Bold,
            fsize,
            INK,
            r#" letter-spacing="-0.5""#,
            line,
        ));
    }
    // Hook, highlighted.
    if !v.gancho.trim().is_empty() {
        let lines_left = if y > 440.0 { 1 } else { 2 };
        let (gsize, gl) = fit(
            v.gancho.trim(),
            Font::SemiBold,
            &[28.0, 26.0, 24.0, 22.0],
            col - 36.0,
            lines_left,
        );
        let lh = gsize * 1.3;
        let top = (y + 22.0).min(542.0 - gl.len() as f32 * lh - 16.0);
        let gw = gl
            .iter()
            .map(|l| width(l, Font::SemiBold, gsize))
            .fold(0.0, f32::max)
            + 36.0;
        let gh = gl.len() as f32 * lh + 16.0;
        let _ = write!(
            s,
            r#"<rect id="gancho" x="{PAD}" y="{top}" width="{gw}" height="{gh}" rx="14" fill="{AMARELO}"/>"#
        );
        for (i, line) in gl.iter().enumerate() {
            s.push_str(&text(
                PAD + 18.0,
                top + 8.0 + lh * (i as f32 + 0.76),
                Font::SemiBold,
                gsize,
                NAVY,
                "",
                line,
            ));
        }
    }
}

fn portrait(s: &mut String, bytes: &[u8]) -> bool {
    let Some(h) = href(bytes) else { return false };
    let (x, y, w, hgt) = (PANEL_X + 40.0, 128.0, PANEL_W - 40.0, 414.0);
    let _ = write!(
        s,
        r##"<clipPath id="retc"><rect x="{x}" y="{y}" width="{w}" height="{hgt}" rx="32"/></clipPath><rect x="{}" y="{}" width="{}" height="{}" rx="38" fill="none" stroke="{AMARELO}" stroke-width="5"/><image id="retrato" href="{h}" x="{x}" y="{y}" width="{w}" height="{hgt}" preserveAspectRatio="xMidYMin slice" clip-path="url(#retc)"/>"##,
        x - 7.0,
        y - 7.0,
        w + 14.0,
        hgt + 14.0
    );
    true
}

fn faces(s: &mut String, list: &[OgFace]) {
    let list = &list[..list.len().min(3)];
    if list.is_empty() {
        return;
    }
    let r = 52.0;
    let x = PANEL_X + 16.0;
    tracked(s, x, 156.0, 18.0, MUTED, "Quem mandou", PANEL_W);
    for (i, f) in list.iter().enumerate() {
        let cy = 228.0 + i as f32 * 128.0;
        let cx = x + r;
        let _ = write!(
            s,
            r##"<g class="face"><circle cx="{cx}" cy="{cy}" r="{}" fill="{}"/><circle cx="{cx}" cy="{cy}" r="{r}" fill="#0b2a63"/>"##,
            r + 5.0,
            if i == 0 { AMARELO } else { "#ffffff" }
        );
        match f.photo.as_deref().and_then(href) {
            Some(h) => {
                let _ = write!(
                    s,
                    r#"<clipPath id="fc{i}"><circle cx="{cx}" cy="{cy}" r="{r}"/></clipPath><image href="{h}" x="{}" y="{}" width="{d}" height="{d}" preserveAspectRatio="xMidYMin slice" clip-path="url(#fc{i})"/>"#,
                    cx - r,
                    cy - r,
                    d = 2.0 * r
                );
            }
            None => s.push_str(&text(
                cx,
                cy + 14.0,
                Font::Bold,
                40.0,
                MUTED,
                r#" text-anchor="middle""#,
                &initials(&f.nome),
            )),
        }
        // Rank badge.
        let _ = write!(
            s,
            r#"<circle cx="{}" cy="{}" r="16" fill="{AMARELO}"/>"#,
            cx + r * 0.72,
            cy + r * 0.72
        );
        s.push_str(&text(
            cx + r * 0.72,
            cy + r * 0.72 + 7.0,
            Font::Bold,
            20.0,
            NAVY,
            r#" text-anchor="middle""#,
            &format!("{}", i + 1),
        ));
        let tx = cx + r + 28.0;
        let tw = W - PAD - tx;
        let (ns, nl) = fit(f.nome.trim(), Font::Bold, &[30.0, 27.0, 24.0, 21.0], tw, 1);
        s.push_str(&text(tx, cy - 2.0, Font::Bold, ns, INK, "", &nl.join("")));
        let (_, dl) = fit(f.detalhe.trim(), Font::SemiBold, &[23.0], tw, 1);
        s.push_str(&text(
            tx,
            cy + 30.0,
            Font::SemiBold,
            23.0,
            VERDE_LIGHT,
            "",
            &dl.join(""),
        ));
        s.push_str("</g>");
    }
}

fn plenario(s: &mut String, (sim, nao, outros): (u32, u32, u32)) {
    let n = (sim + nao + outros).min(600) as usize;
    let cx = PANEL_X + PANEL_W / 2.0 + 8.0;
    let cy = 420.0;
    let (seats, sr) = hemicycle(n, cx, cy, 92.0, 200.0);
    s.push_str(r#"<g id="plenario">"#);
    for (i, (x, y)) in seats.iter().enumerate() {
        let fill = if i < sim as usize {
            VERDE_LIGHT
        } else if i < (sim + outros) as usize {
            OUTROS
        } else {
            NAO
        };
        let _ = write!(
            s,
            r#"<circle class="seat" fill="{fill}" cx="{x:.1}" cy="{y:.1}" r="{sr:.1}"/>"#
        );
    }
    s.push_str("</g>");
    s.push_str(&text(
        cx - 200.0,
        cy + 62.0,
        Font::Figure,
        40.0,
        VERDE_LIGHT,
        "",
        &format!("{sim} SIM"),
    ));
    s.push_str(&text(
        cx + 200.0,
        cy + 62.0,
        Font::Figure,
        40.0,
        NAO,
        r#" text-anchor="end""#,
        &format!("{nao} NÃO"),
    ));
    if outros > 0 {
        s.push_str(&text(
            cx,
            cy + 104.0,
            Font::SemiBold,
            20.0,
            MUTED,
            r#" text-anchor="middle""#,
            &format!("{outros} outros"),
        ));
    }
}

pub fn viral_svg(v: &OgViral) -> String {
    let mut s = String::with_capacity(32 * 1024);
    open(&mut s);
    header(&mut s);
    top_right(&mut s, v);
    let has_portrait = v.retrato.as_deref().is_some_and(|p| portrait(&mut s, p));
    let panel = if has_portrait {
        true
    } else if let Some(p) = v.placar.filter(|(a, b, c)| a + b + c > 0) {
        plenario(&mut s, p);
        true
    } else if !v.faces.is_empty() {
        faces(&mut s, &v.faces);
        true
    } else {
        false
    };
    let col = if panel {
        PANEL_X - PAD - 24.0
    } else {
        W - 2.0 * PAD
    };
    left(&mut s, v, col);
    close(&mut s);
    s
}

pub fn viral_png(v: &OgViral) -> Result<Vec<u8>, crate::OgError> {
    crate::render_png(&viral_svg(v), WIDTH, HEIGHT)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hemicycle_counts_and_bounds() {
        for n in [1, 2, 7, 81, 513, 600] {
            let (seats, r) = hemicycle(n, 0.0, 0.0, 90.0, 200.0);
            assert_eq!(seats.len(), n, "n={n}");
            assert!(r > 0.0);
            assert!(seats
                .iter()
                .all(|(x, y)| x.hypot(*y) <= 200.5 && *y <= 0.01));
        }
        assert!(hemicycle(0, 0.0, 0.0, 1.0, 2.0).0.is_empty());
    }

    #[test]
    fn hemicycle_is_left_to_right() {
        let (seats, _) = hemicycle(100, 0.0, 0.0, 90.0, 200.0);
        let first = seats.first().unwrap();
        let last = seats.last().unwrap();
        assert!(first.0 < 0.0 && last.0 > 0.0);
    }

    #[test]
    fn initials_skip_symbols() {
        assert_eq!(initials("Bia <Lima>"), "BL");
        assert_eq!(initials("  "), "");
    }
}
