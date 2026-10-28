//! Open Graph cards for emenda.pl (1200x630). Pure Rust; native and wasm32.
//!
//! Fonts are embedded (Inter + Space Grotesk subsets, OFL); no system fonts,
//! no threads, no I/O.

pub mod brand;
mod card;
mod fonts;
mod text;

use std::sync::{Arc, OnceLock};

use resvg::{tiny_skia, usvg};

pub const WIDTH: u32 = 1200;
pub const HEIGHT: u32 = 630;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum OgKind {
    Default,
    Deputado,
    Senador,
    Municipio,
    Uf,
    Autor,
    Proposicao,
    Votacao,
    Partido,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OgStat {
    pub label: String,
    pub value: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OgCard {
    pub kind: OgKind,
    /// Empty -> default label for `kind`. Rendered uppercase.
    pub eyebrow: String,
    pub title: String,
    pub subtitle: String,
    /// Up to 3 are rendered.
    pub stats: Vec<OgStat>,
    pub badge: Option<String>,
    /// `#rgb` / `#rrggbb`; invalid values fall back to amarelo.
    pub accent: Option<String>,
    /// PNG, JPEG or WebP bytes; other formats are ignored.
    pub photo: Option<Vec<u8>>,
}

impl OgCard {
    /// Site-wide card (`/og/default.png`, `og-default.png`).
    pub fn site_default() -> Self {
        OgCard {
            kind: OgKind::Default,
            eyebrow: String::new(),
            title: "Para onde vai o dinheiro das emendas parlamentares".into(),
            subtitle: "Quem indicou, quanto foi pago e quem recebeu — deputados, senadores, \
                       municípios, proposições e votações, com dados oficiais."
                .into(),
            stats: Vec::new(),
            badge: None,
            accent: None,
            photo: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OgError {
    Svg(String),
    Pixmap,
    Encode(String),
}

impl std::fmt::Display for OgError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OgError::Svg(e) => write!(f, "og svg: {e}"),
            OgError::Pixmap => write!(f, "og: pixmap allocation failed"),
            OgError::Encode(e) => write!(f, "og png: {e}"),
        }
    }
}

impl std::error::Error for OgError {}

/// 1200x630 SVG for `card`. Deterministic.
pub fn svg(card: &OgCard) -> String {
    card::render(card)
}

/// 1200x630 PNG for `card`, rendered with the embedded fonts.
pub fn png(card: &OgCard) -> Result<Vec<u8>, OgError> {
    render_png(&svg(card), WIDTH, HEIGHT)
}

/// Rasterizes any SVG with the embedded fonts, scaled to `w`x`h`.
pub fn render_png(svg: &str, w: u32, h: u32) -> Result<Vec<u8>, OgError> {
    let opt = usvg::Options {
        fontdb: fontdb(),
        ..usvg::Options::default()
    };
    let tree = usvg::Tree::from_str(svg, &opt).map_err(|e| OgError::Svg(e.to_string()))?;
    let mut pixmap = tiny_skia::Pixmap::new(w, h).ok_or(OgError::Pixmap)?;
    let size = tree.size();
    let t = tiny_skia::Transform::from_scale(w as f32 / size.width(), h as f32 / size.height());
    resvg::render(&tree, t, &mut pixmap.as_mut());
    pixmap
        .encode_png()
        .map_err(|e| OgError::Encode(e.to_string()))
}

fn fontdb() -> Arc<usvg::fontdb::Database> {
    static DB: OnceLock<Arc<usvg::fontdb::Database>> = OnceLock::new();
    DB.get_or_init(|| {
        let mut db = usvg::fontdb::Database::new();
        for data in [
            fonts::INTER_REGULAR,
            fonts::INTER_SEMIBOLD,
            fonts::INTER_BOLD,
            fonts::GROTESK_BOLD,
        ] {
            db.load_font_data(data.to_vec());
        }
        db.set_sans_serif_family(fonts::FAMILY_REGULAR);
        Arc::new(db)
    })
    .clone()
}
