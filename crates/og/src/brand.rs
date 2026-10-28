//! Brand palette and the emenda.pl mark (single source for OG + brand assets).

pub const VERDE: &str = "#009c3b";
pub const AMARELO: &str = "#ffdf00";
pub const AZUL: &str = "#002776";
pub const BRANCO: &str = "#ffffff";

/// Mark body in a 64x64 box on a 4-unit grid (crisp at 16/32 px): rounded verde tile, three symmetric ledger
/// bars (branco, amarelo, branco) on an azul baseline.
pub const MARK_BODY: &str = concat!(
    r##"<rect width="64" height="64" rx="16" fill="#009c3b"/>"##,
    r##"<rect x="8" y="28" width="12" height="16" rx="2" fill="#ffffff"/>"##,
    r##"<rect x="24" y="12" width="16" height="32" rx="2" fill="#ffdf00"/>"##,
    r##"<rect x="44" y="28" width="12" height="16" rx="2" fill="#ffffff"/>"##,
    r##"<rect x="8" y="48" width="48" height="4" rx="2" fill="#002776"/>"##,
);

/// Standalone mark SVG (favicon, app icons).
pub fn mark_svg() -> String {
    format!(r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">{MARK_BODY}</svg>"#)
}

/// Mark placed at (`x`,`y`) with side `size` px, for embedding.
pub fn mark_at(x: f32, y: f32, size: f32) -> String {
    let k = size / 64.0;
    format!(r#"<g transform="translate({x} {y}) scale({k})">{MARK_BODY}</g>"#)
}

/// Re-serializes `svg` with all text converted to paths (embedded fonts),
/// for font-independent brand files.
pub fn outline(svg: &str) -> Result<String, crate::OgError> {
    use resvg::usvg;
    let opt = usvg::Options {
        fontdb: crate::fontdb(),
        ..usvg::Options::default()
    };
    let tree = usvg::Tree::from_str(svg, &opt).map_err(|e| crate::OgError::Svg(e.to_string()))?;
    Ok(tree.to_string(&usvg::WriteOptions::default()))
}
