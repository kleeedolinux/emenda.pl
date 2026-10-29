//! Deterministic image variants (re-encoded from pixels: no metadata) and content checks.
use anyhow::{Context, Result};
use image::imageops::FilterType;
use image::{DynamicImage, GenericImageView};
use sha2::{Digest, Sha256};

/// Photo widths written as `{chave}-{w}.webp` (+ `{chave}-512.jpg` fallback).
pub const LARGURAS: [u32; 2] = [160, 512];
const Q_WEBP: f32 = 80.0;
const Q_JPEG: u8 = 82;

pub fn sha256_hex(b: &[u8]) -> String {
    let d = Sha256::digest(b);
    d.iter().map(|x| format!("{x:02x}")).collect()
}

pub fn eh_pdf(b: &[u8]) -> bool {
    b.starts_with(b"%PDF-")
}

pub fn eh_svg(b: &[u8]) -> bool {
    let head = String::from_utf8_lossy(&b[..b.len().min(512)]).to_ascii_lowercase();
    let t = head.trim_start_matches('\u{feff}').trim_start();
    (t.starts_with("<?xml") || t.starts_with("<svg") || t.starts_with("<!--"))
        && head.contains("<svg")
}

/// Fits `img` to width `w` (never upscales).
fn largura(img: &DynamicImage, w: u32) -> DynamicImage {
    let (iw, ih) = img.dimensions();
    if iw <= w {
        return img.clone();
    }
    let h = ((ih as f64 * w as f64 / iw as f64).round() as u32).max(1);
    img.resize_exact(w, h, FilterType::Lanczos3)
}

fn webp_rgb(img: &DynamicImage) -> Vec<u8> {
    let rgb = img.to_rgb8();
    webp::Encoder::from_rgb(&rgb, rgb.width(), rgb.height())
        .encode(Q_WEBP)
        .to_vec()
}

fn jpeg(img: &DynamicImage) -> Result<Vec<u8>> {
    let rgb = img.to_rgb8();
    let mut out = Vec::new();
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, Q_JPEG)
        .encode_image(&rgb)
        .context("jpeg encode")?;
    Ok(out)
}

/// Photo -> `[{chave}-160.webp, {chave}-512.webp, {chave}-512.jpg]`.
pub fn foto(src: &[u8], chave: &str) -> Result<Vec<(String, Vec<u8>)>> {
    let img = image::load_from_memory(src).context("decode foto")?;
    let mut out = Vec::new();
    for w in LARGURAS {
        out.push((format!("{chave}-{w}.webp"), webp_rgb(&largura(&img, w))));
    }
    out.push((format!("{chave}-512.jpg"), jpeg(&largura(&img, 512))?));
    Ok(out)
}

/// Logo -> `{chave}.svg` (as-is) or `{chave}.webp` (lossless, alpha kept, max 512 wide).
pub fn logo(src: &[u8], chave: &str) -> Result<Vec<(String, Vec<u8>)>> {
    if eh_svg(src) {
        return Ok(vec![(format!("{chave}.svg"), src.to_vec())]);
    }
    let img = largura(&image::load_from_memory(src).context("decode logo")?, 512);
    let rgba = img.to_rgba8();
    let webp = webp::Encoder::from_rgba(&rgba, rgba.width(), rgba.height())
        .encode_lossless()
        .to_vec();
    Ok(vec![(format!("{chave}.webp"), webp)])
}

/// Flag -> `[{chave}.svg (as-is), {chave}-64.webp]` (rasterized with resvg, 64 px wide).
pub fn bandeira(svg: &[u8], chave: &str) -> Result<Vec<(String, Vec<u8>)>> {
    if !eh_svg(svg) {
        anyhow::bail!("não é SVG");
    }
    let rgba = svg_raster(svg, 64)?.to_rgba8();
    let webp = webp::Encoder::from_rgba(&rgba, rgba.width(), rgba.height())
        .encode_lossless()
        .to_vec();
    Ok(vec![
        (format!("{chave}.svg"), svg.to_vec()),
        (format!("{chave}-64.webp"), webp),
    ])
}

/// SVG -> RGBA image `w` px wide (resvg; no text shaping).
fn svg_raster(svg: &[u8], w: u32) -> Result<DynamicImage> {
    use resvg::{tiny_skia, usvg};
    let tree = usvg::Tree::from_data(svg, &usvg::Options::default()).context("svg")?;
    let s = tree.size();
    let h = ((s.height() * w as f32 / s.width()).round() as u32).max(1);
    let mut pm = tiny_skia::Pixmap::new(w, h).context("pixmap")?;
    let t = tiny_skia::Transform::from_scale(w as f32 / s.width(), h as f32 / s.height());
    resvg::render(&tree, t, &mut pm.as_mut());
    let rgba: Vec<u8> = pm
        .pixels()
        .iter()
        .flat_map(|p| {
            let c = p.demultiply();
            [c.red(), c.green(), c.blue(), c.alpha()]
        })
        .collect();
    let buf = image::RgbaImage::from_raw(w, h, rgba).context("rgba")?;
    Ok(DynamicImage::ImageRgba8(buf))
}

/// Município flag / coat of arms (PNG/JPEG thumbnail or SVG) -> `{chave}-64.webp`, `{chave}-256.webp`.
pub fn emblema(src: &[u8], chave: &str) -> Result<Vec<(String, Vec<u8>)>> {
    let img = if eh_svg(src) {
        svg_raster(src, 256)?
    } else {
        image::load_from_memory(src).context("decode emblema")?
    };
    let mut out = Vec::new();
    for w in [64u32, 256] {
        let rgba = largura(&img, w).to_rgba8();
        let webp = webp::Encoder::from_rgba(&rgba, rgba.width(), rgba.height())
            .encode(85.0)
            .to_vec();
        out.push((format!("{chave}-{w}.webp"), webp));
    }
    Ok(out)
}
