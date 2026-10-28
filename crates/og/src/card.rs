//! Card layout: OgCard -> SVG string (1200x630).

use std::fmt::Write as _;

use crate::brand::{mark_at, AMARELO, AZUL, VERDE};
use crate::text::{escape, fit, width, wrap, Font};
use crate::{OgCard, OgKind, HEIGHT, WIDTH};

const PAD: f32 = 64.0;
const W: f32 = WIDTH as f32;
const H: f32 = HEIGHT as f32;
const INK: &str = "#ffffff";
const MUTED: &str = "#a9b7d3";
const DIM: &str = "#6f82a8";

// Vertical rhythm.
const HEADER_Y: f32 = 50.0;
const CONTENT_TOP: f32 = 140.0;
const TILES_TOP: f32 = 404.0;
const TILE_H: f32 = 124.0;
const FOOTER_RULE: f32 = 562.0;
const FOOTER_BASE: f32 = 598.0;
const BAND_H: f32 = 8.0;

// Photo disc (right column).
const PHOTO_CX: f32 = 1012.0;
const PHOTO_CY: f32 = 264.0;
const PHOTO_R: f32 = 112.0;

const EYEBROW_SIZE: f32 = 21.0;
const EYEBROW_TRACK: f32 = 2.6;
const SUB_SIZE: f32 = 27.0;
const SUB_GAP: f32 = 22.0;
const TITLE_SIZES: [f32; 9] = [92.0, 84.0, 76.0, 68.0, 62.0, 56.0, 50.0, 46.0, 42.0];
const TITLE_LEADING: f32 = 1.04;

pub fn default_eyebrow(kind: OgKind) -> &'static str {
    match kind {
        OgKind::Default => "EMENDAS · PROPOSIÇÕES · VOTAÇÕES",
        OgKind::Deputado => "DEPUTADO FEDERAL",
        OgKind::Senador => "SENADOR",
        OgKind::Municipio => "MUNICÍPIO",
        OgKind::Uf => "ESTADO",
        OgKind::Autor => "AUTOR DE EMENDAS",
        OgKind::Proposicao => "PROPOSIÇÃO",
        OgKind::Votacao => "VOTAÇÃO",
        OgKind::Partido => "PARTIDO",
    }
}

/// Accepts `#rgb` / `#rrggbb` only; anything else falls back to amarelo.
fn accent(card: &OgCard) -> String {
    match card.accent.as_deref().map(str::trim) {
        Some(a)
            if (a.len() == 4 || a.len() == 7)
                && a.starts_with('#')
                && a[1..].chars().all(|c| c.is_ascii_hexdigit()) =>
        {
            a.to_ascii_lowercase()
        }
        _ => AMARELO.to_string(),
    }
}

fn rgb(hex: &str) -> (f32, f32, f32) {
    let h = &hex[1..];
    let (r, g, b) = if h.len() == 3 {
        let d = |i: usize| u8::from_str_radix(&h[i..i + 1].repeat(2), 16).unwrap_or(0);
        (d(0), d(1), d(2))
    } else {
        let d = |i: usize| u8::from_str_radix(&h[i..i + 2], 16).unwrap_or(0);
        (d(0), d(2), d(4))
    };
    (r as f32 / 255.0, g as f32 / 255.0, b as f32 / 255.0)
}

fn luma(hex: &str) -> f32 {
    let (r, g, b) = rgb(hex);
    0.2126 * r + 0.7152 * g + 0.0722 * b
}

/// `accent` if legible on the navy background, else amarelo.
fn readable(accent: &str) -> &str {
    if luma(accent) >= 0.3 {
        accent
    } else {
        AMARELO
    }
}

/// Readable text color on `bg`.
fn on(bg: &str) -> &'static str {
    if luma(bg) > 0.55 {
        "#001433"
    } else {
        INK
    }
}

pub(crate) fn photo_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("image/jpeg")
    } else if bytes.len() > 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else {
        None
    }
}

pub(crate) fn base64(data: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let b = [
            chunk[0],
            *chunk.get(1).unwrap_or(&0),
            *chunk.get(2).unwrap_or(&0),
        ];
        let n = (b[0] as u32) << 16 | (b[1] as u32) << 8 | b[2] as u32;
        for i in 0..4 {
            if i <= chunk.len() {
                out.push(T[(n >> (18 - 6 * i) & 63) as usize] as char);
            } else {
                out.push('=');
            }
        }
    }
    out
}

pub(crate) fn text(
    x: f32,
    y: f32,
    font: Font,
    size: f32,
    fill: &str,
    extra: &str,
    body: &str,
) -> String {
    let weight = match font {
        Font::Regular => 400,
        Font::SemiBold => 600,
        Font::Figure | Font::Bold => 700,
    };
    let fallback = match font {
        Font::Regular | Font::SemiBold | Font::Figure => "Inter, sans-serif",
        Font::Bold => "'Space Grotesk', Inter, sans-serif",
    };
    format!(
        r#"<text x="{x}" y="{y}" font-family="'{}', {fallback}" font-weight="{weight}" font-size="{size}" fill="{fill}"{extra}>{}</text>"#,
        font.family(),
        escape(body)
    )
}

/// Width of tracked (letter-spaced) text.
fn tracked_width(s: &str, font: Font, size: f32, track: f32) -> f32 {
    width(s, font, size) + track * s.chars().count() as f32
}

pub fn render(card: &OgCard) -> String {
    let badge_bg = accent(card);
    let accent = readable(&badge_bg).to_string();
    let photo = card
        .photo
        .as_deref()
        .and_then(|p| photo_mime(p).map(|m| (m, p)));
    let text_right = if photo.is_some() {
        PHOTO_CX - PHOTO_R - 48.0
    } else {
        W - PAD
    };
    let text_w = text_right - PAD;
    let stats: Vec<_> = card.stats.iter().take(3).collect();

    let mut s = String::with_capacity(16 * 1024);
    open(&mut s);

    // Geometric motif: nested losangos around the photo/glow center.
    for (half, color, op) in [
        (250.0, AMARELO, 0.10),
        (196.0, VERDE, 0.22),
        (142.0, INK, 0.06),
    ] {
        let (cx, cy) = (PHOTO_CX, PHOTO_CY);
        let _ = write!(
            s,
            r#"<path d="M{cx} {t}L{r} {cy}L{cx} {b}L{l} {cy}Z" fill="none" stroke="{color}" stroke-opacity="{op}" stroke-width="2"/>"#,
            t = cy - half,
            b = cy + half,
            l = cx - half,
            r = cx + half
        );
    }

    header(&mut s);

    if let Some(badge) = card
        .badge
        .as_deref()
        .map(str::trim)
        .filter(|b| !b.is_empty())
    {
        let label = wrap(&badge.to_uppercase(), Font::Bold, 22.0, 300.0, 1).join("");
        let bw = width(&label, Font::Bold, 22.0) + 44.0;
        let (bx, by, bh) = (W - PAD - bw, HEADER_Y + 2.0, 44.0);
        let _ = write!(
            s,
            r#"<g id="badge"><rect x="{bx}" y="{by}" width="{bw}" height="{bh}" rx="22" fill="{badge_bg}"/>{}</g>"#,
            text(
                bx + 22.0,
                by + 30.0,
                Font::Bold,
                22.0,
                on(&badge_bg),
                r#" letter-spacing="0.5""#,
                &label
            )
        );
    }

    // Content block: eyebrow, title, subtitle — vertically centered.
    let eyebrow_src = if card.eyebrow.trim().is_empty() {
        default_eyebrow(card.kind).to_string()
    } else {
        card.eyebrow.trim().to_uppercase()
    };
    let eyebrow = fit_tracked(&eyebrow_src, text_w - 28.0);
    let subtitle = wrap(card.subtitle.trim(), Font::Regular, SUB_SIZE, text_w, 2);
    let bottom = if stats.is_empty() {
        FOOTER_RULE - 40.0
    } else {
        TILES_TOP - 30.0
    };
    let sub_h = if subtitle.is_empty() {
        0.0
    } else {
        SUB_GAP + subtitle.len() as f32 * SUB_SIZE * 1.3
    };
    let eyebrow_h = 44.0;
    let avail = bottom - CONTENT_TOP - eyebrow_h - sub_h;
    let (tsize, tlines) = fit_title(card.title.trim(), text_w, avail);
    let title_h = tlines.len() as f32 * tsize * TITLE_LEADING;
    let block_h = eyebrow_h + title_h + sub_h;
    let top = CONTENT_TOP + ((bottom - CONTENT_TOP - block_h) / 2.0).max(0.0);

    let ey = top + 16.0;
    let _ = write!(
        s,
        r#"<rect x="{PAD}" y="{}" width="16" height="4" rx="2" fill="{accent}"/>"#,
        ey - 7.0
    );
    s.push_str(&text(
        PAD + 28.0,
        ey,
        Font::SemiBold,
        EYEBROW_SIZE,
        &accent,
        &format!(r#" letter-spacing="{EYEBROW_TRACK}""#),
        &eyebrow,
    ));

    let mut y = top + eyebrow_h;
    for line in &tlines {
        y += tsize * TITLE_LEADING;
        s.push_str(&text(
            PAD - tsize * 0.04,
            y - tsize * 0.22,
            Font::Bold,
            tsize,
            INK,
            r#" letter-spacing="-1""#,
            line,
        ));
    }
    y += SUB_GAP - 12.0;
    for line in &subtitle {
        y += SUB_SIZE * 1.3;
        s.push_str(&text(PAD, y, Font::Regular, SUB_SIZE, MUTED, "", line));
    }

    // Photo disc with double ring.
    if let Some((mime, bytes)) = photo {
        let (cx, cy, r) = (PHOTO_CX, PHOTO_CY, PHOTO_R);
        let _ = write!(
            s,
            concat!(
                r##"<circle cx="{cx}" cy="{cy}" r="{r2}" fill="none" stroke="#009c3b" stroke-width="3" stroke-opacity="0.7"/>"##,
                r##"<circle cx="{cx}" cy="{cy}" r="{r}" fill="#0b2a63"/>"##,
                r##"<image href="data:{mime};base64,{b64}" x="{x}" y="{y}" width="{d}" height="{d}" preserveAspectRatio="xMidYMin slice" clip-path="url(#pc)"/>"##,
                r##"<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{accent}" stroke-width="5"/>"##
            ),
            cx = cx,
            cy = cy,
            r = r,
            r2 = r + 14.0,
            mime = mime,
            b64 = base64(bytes),
            x = cx - r,
            y = cy - r,
            d = 2.0 * r,
            accent = accent
        );
    }

    // Stat tiles.
    if !stats.is_empty() {
        let gap = 20.0;
        let n = stats.len() as f32;
        // One stat takes half the row: a lone full-width tile reads empty.
        let cols = n.max(2.0);
        let tw = (W - 2.0 * PAD - gap * (cols - 1.0)) / cols;
        let bars = [accent.as_str(), VERDE_LIGHT, "#4f86ff"];
        for (i, st) in stats.iter().enumerate() {
            let x = PAD + i as f32 * (tw + gap);
            let inner = tw - 52.0;
            let value = money(st.value.trim(), inner);
            let label = wrap(st.label.trim(), Font::Regular, 20.0, inner, 1).join("");
            let _ = write!(
                s,
                r##"<g class="stat"><rect x="{x}" y="{TILES_TOP}" width="{tw}" height="{TILE_H}" rx="16" fill="#0a2152" fill-opacity="0.94" stroke="#ffffff" stroke-opacity="0.13"/><rect x="{x}" y="{by}" width="5" height="{bh}" rx="2.5" fill="{bar}"/>{v}{l}</g>"##,
                by = TILES_TOP + 24.0,
                bh = TILE_H - 48.0,
                bar = bars[i],
                v = value.svg(x + 28.0, TILES_TOP + 70.0),
                l = text(
                    x + 28.0,
                    TILES_TOP + 102.0,
                    Font::Regular,
                    20.0,
                    MUTED,
                    "",
                    &label
                ),
            );
        }
    }

    close(&mut s);
    s
}

/// SVG root, defs (background, glow at the photo center, grid, fade, photo clip) and background layers.
pub(crate) fn open(s: &mut String) {
    let _ = write!(
        *s,
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}">"#
    );

    // Defs: background gradient, ledger grid, glow, photo clip.
    let _ = write!(
        *s,
        concat!(
            "<defs>",
            r##"<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">"##,
            r##"<stop offset="0" stop-color="#001a4f"/><stop offset="1" stop-color="#000c26"/></linearGradient>"##,
            r##"<radialGradient id="glow" cx="{gx}" cy="{gy}" r="520" gradientUnits="userSpaceOnUse">"##,
            r##"<stop offset="0" stop-color="#009c3b" stop-opacity="0.30"/>"##,
            r##"<stop offset="0.55" stop-color="#002776" stop-opacity="0.18"/>"##,
            r##"<stop offset="1" stop-color="#002776" stop-opacity="0"/></radialGradient>"##,
            r##"<pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">"##,
            r##"<path d="M40 0H0V40" fill="none" stroke="#ffffff" stroke-opacity="0.045" stroke-width="1"/></pattern>"##,
            r##"<linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">"##,
            r##"<stop offset="0" stop-color="#000c26" stop-opacity="0.85"/>"##,
            r##"<stop offset="0.6" stop-color="#000c26" stop-opacity="0"/></linearGradient>"##,
            r##"<clipPath id="pc"><circle cx="{cx}" cy="{cy}" r="{r}"/></clipPath>"##,
            "</defs>"
        ),
        gx = PHOTO_CX,
        gy = PHOTO_CY,
        cx = PHOTO_CX,
        cy = PHOTO_CY,
        r = PHOTO_R
    );
    let _ = write!(
        *s,
        r#"<rect width="{W}" height="{H}" fill="url(#bg)"/><rect width="{W}" height="{H}" fill="url(#glow)"/><rect width="{W}" height="{H}" fill="url(#grid)"/><rect width="{W}" height="{H}" fill="url(#fade)"/>"#
    );
}

/// Mark + wordmark.
pub(crate) fn header(s: &mut String) {
    // Header: mark + wordmark, optional badge on the right.
    s.push_str(&mark_at(PAD, HEADER_Y, 48.0));
    let wm_x = PAD + 64.0;
    let wm_y = HEADER_Y + 35.0;
    let wm = width("emenda", Font::Bold, 34.0);
    s.push_str(&text(wm_x, wm_y, Font::Bold, 34.0, INK, "", "emenda"));
    s.push_str(&text(
        wm_x + wm,
        wm_y,
        Font::Bold,
        34.0,
        VERDE_LIGHT,
        "",
        ".online",
    ));
}

/// Footer rule, signature, tricolor band, and `</svg>`.
pub(crate) fn close(s: &mut String) {
    // Footer: rule, signature, tricolor band (symmetric).
    let _ = write!(
        s,
        r##"<rect x="{PAD}" y="{FOOTER_RULE}" width="{rw}" height="1" fill="#ffffff" fill-opacity="0.12"/>"##,
        rw = W - 2.0 * PAD
    );
    s.push_str(&text(
        PAD,
        FOOTER_BASE,
        Font::SemiBold,
        19.0,
        INK,
        "",
        "emenda.online",
    ));
    let sig_x = PAD + width("emenda.online ", Font::SemiBold, 19.0);
    s.push_str(&text(
        sig_x,
        FOOTER_BASE,
        Font::Regular,
        19.0,
        MUTED,
        "",
        "· transparência das emendas parlamentares",
    ));
    s.push_str(&text(
        W - PAD,
        FOOTER_BASE,
        Font::SemiBold,
        15.0,
        DIM,
        r#" text-anchor="end" letter-spacing="2.4""#,
        "SIGA O DINHEIRO PÚBLICO",
    ));
    let third = W / 3.0;
    let _ = write!(
        s,
        r#"<rect x="0" y="{by}" width="{W}" height="{BAND_H}" fill="{VERDE}"/><rect x="{third}" y="{by}" width="{third}" height="{BAND_H}" fill="{AMARELO}"/><rect x="{c}" y="{by}" width="80" height="{BAND_H}" fill="{AZUL}"/>"#,
        by = H - BAND_H,
        c = W / 2.0 - 40.0
    );

    s.push_str("</svg>");
}

pub(crate) const VERDE_LIGHT: &str = "#1fc35f";
const FIGURE_SIZES: [f32; 6] = [56.0, 50.0, 44.0, 38.0, 32.0, 28.0];
const CURRENCY: &str = "R$";
const CURRENCY_SCALE: f32 = 0.56;

/// Stat value; a leading `R$` is set smaller and muted, ledger style.
struct Money {
    prefix: bool,
    size: f32,
    body: String,
}

impl Money {
    fn prefix_w(size: f32) -> f32 {
        width(CURRENCY, Font::Figure, size * CURRENCY_SCALE) + size * 0.2
    }

    fn svg(&self, x: f32, y: f32) -> String {
        let mut out = String::new();
        let mut bx = x;
        if self.prefix {
            out.push_str(&text(
                x,
                y,
                Font::Figure,
                self.size * CURRENCY_SCALE,
                MUTED,
                "",
                CURRENCY,
            ));
            bx += Self::prefix_w(self.size);
        }
        out + &text(
            bx,
            y,
            Font::Figure,
            self.size,
            INK,
            r#" letter-spacing="-1""#,
            &self.body,
        )
    }
}

fn money(value: &str, max_w: f32) -> Money {
    let (prefix, body) = match value.strip_prefix(CURRENCY) {
        Some(rest) if !rest.trim().is_empty() => (true, rest.trim()),
        _ => (false, value),
    };
    for &size in &FIGURE_SIZES {
        let avail = max_w - if prefix { Money::prefix_w(size) } else { 0.0 };
        let (got, lines) = fit(body, Font::Figure, &[size], avail, 1);
        if got == size && !lines.first().is_some_and(|l| l.ends_with('…'))
            || size == FIGURE_SIZES[5]
        {
            return Money {
                prefix,
                size,
                body: lines.join(""),
            };
        }
    }
    unreachable!("last size always returns")
}

fn fit_tracked(s: &str, max_w: f32) -> String {
    if tracked_width(s, Font::SemiBold, EYEBROW_SIZE, EYEBROW_TRACK) <= max_w {
        return s.to_string();
    }
    let mut chars: Vec<char> = s.chars().collect();
    while !chars.is_empty() {
        chars.pop();
        let c: String = chars.iter().collect::<String>().trim_end().to_string() + "…";
        if tracked_width(&c, Font::SemiBold, EYEBROW_SIZE, EYEBROW_TRACK) <= max_w {
            return c;
        }
    }
    String::new()
}

/// Largest title size whose untruncated wrap fits the available height.
fn fit_title(title: &str, max_w: f32, avail_h: f32) -> (f32, Vec<String>) {
    let lines_for = |size: f32| ((avail_h / (size * TITLE_LEADING)).floor() as usize).clamp(1, 3);
    for &size in &TITLE_SIZES {
        let (got, lines) = fit(title, Font::Bold, &[size], max_w, lines_for(size));
        if got == size
            && !lines
                .last()
                .is_some_and(|l| l.ends_with('…') && !title.ends_with('…'))
        {
            return (size, lines);
        }
    }
    let size = *TITLE_SIZES.last().unwrap_or(&42.0);
    (size, wrap(title, Font::Bold, size, max_w, lines_for(size)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_table() {
        for (input, want) in [
            (&b""[..], ""),
            (b"f", "Zg=="),
            (b"fo", "Zm8="),
            (b"foo", "Zm9v"),
            (b"foobar", "Zm9vYmFy"),
        ] {
            assert_eq!(base64(input), want);
        }
    }

    #[test]
    fn photo_mime_table() {
        assert_eq!(photo_mime(b"\x89PNG\r\n\x1a\nxx"), Some("image/png"));
        assert_eq!(photo_mime(&[0xFF, 0xD8, 0xFF, 0xDB]), Some("image/jpeg"));
        assert_eq!(photo_mime(b"RIFF\0\0\0\0WEBPVP8 "), Some("image/webp"));
        assert_eq!(photo_mime(b"GIF89a"), None);
    }

    #[test]
    fn accent_and_contrast() {
        let mut c = OgCard {
            kind: OgKind::Default,
            eyebrow: String::new(),
            title: String::new(),
            subtitle: String::new(),
            stats: vec![],
            badge: None,
            accent: Some("#ABC".into()),
            photo: None,
        };
        assert_eq!(accent(&c), "#abc");
        c.accent = Some("#12345".into());
        assert_eq!(accent(&c), AMARELO);
        assert_eq!(on(AMARELO), "#001433");
        assert_eq!(on(AZUL), INK);
        assert_eq!(
            readable("#1d3f8f"),
            AMARELO,
            "dark accents are unreadable on navy"
        );
        assert_eq!(readable("#00a859"), "#00a859");
    }
}
