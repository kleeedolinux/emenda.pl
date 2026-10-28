//! Generates brand files from the single mark source + embedded fonts.
//! `cargo run -p og --example brand -- apps/web/public`

use og::brand::{mark_svg, outline, AZUL, BRANCO, MARK_BODY, VERDE};
use resvg::usvg;

const WM_SIZE: f32 = 44.0;
/// Baseline that centers the x-height (0.486 em) on the 64px mark.
const WM_BASELINE: f32 = 32.0 + 0.486 * WM_SIZE / 2.0;
const WM_GAP: f32 = 16.0;
const VERDE_DARK_BG: &str = "#1fc35f";

struct Wordmark {
    emenda: String,
    pl: String,
    x0: f32,
    width: f32,
}

fn wordmark() -> Wordmark {
    let src = format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="400" height="64"><text x="0" y="{WM_BASELINE}" font-family="Space Grotesk" font-weight="700" font-size="{WM_SIZE}" letter-spacing="-0.5"><tspan>emenda</tspan><tspan>.pl</tspan></text></svg>"##
    );
    let out = outline(&src).expect("outline");
    let ds: Vec<String> = out
        .split(" d=\"")
        .skip(1)
        .map(|s| s[..s.find('"').unwrap()].to_string())
        .collect();
    assert_eq!(ds.len(), 2, "two runs: emenda + .pl");
    let tree = usvg::Tree::from_str(&out, &usvg::Options::default()).unwrap();
    let bb = tree.root().abs_bounding_box();
    Wordmark {
        emenda: round(&ds[0]),
        pl: round(&ds[1]),
        x0: bb.x(),
        width: bb.width(),
    }
}

/// Rounds path numbers to 2 decimals and drops redundant spaces.
fn round(d: &str) -> String {
    d.split(' ')
        .map(|t| match t.parse::<f32>() {
            Ok(v) => {
                let s = format!("{v:.2}");
                let s = s.trim_end_matches('0').trim_end_matches('.');
                if s == "-0" {
                    "0".to_string()
                } else {
                    s.to_string()
                }
            }
            Err(_) => t.to_string(),
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Mono mark: one path, bars knocked out (evenodd).
const MARK_MONO_D: &str =
    "M16 0h32a16 16 0 0 1 16 16v32a16 16 0 0 1-16 16H16A16 16 0 0 1 0 48V16A16 16 0 0 1 16 0Z\
M10 28h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2V30a2 2 0 0 1 2-2Z\
M26 12h12a2 2 0 0 1 2 2v28a2 2 0 0 1-2 2h-12a2 2 0 0 1-2-2V14a2 2 0 0 1 2-2Z\
M46 28h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2V30a2 2 0 0 1 2-2Z\
M10 48h44a2 2 0 0 1 0 4H10a2 2 0 0 1 0-4Z";

/// Full-bleed square (no rounding) with the bars scaled by `k` around the
/// center: apple-touch / maskable icons where the OS applies its own mask.
fn bleed(k: f32) -> String {
    let t = 32.0 * (1.0 - k);
    let bars = MARK_BODY.split("/>").skip(1).collect::<Vec<_>>().join("/>");
    format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="{VERDE}"/><g transform="translate({t} {t}) scale({k})">{bars}</g></svg>"#
    )
}

fn main() {
    let public = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "apps/web/public".into());
    let dir = format!("{public}/brand");
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::create_dir_all(format!("{public}/og")).unwrap();
    let write = |name: &str, data: &[u8]| {
        let p = format!("{dir}/{name}");
        std::fs::write(&p, data).unwrap();
        println!("{p}");
    };

    let wm = wordmark();
    let mark = mark_svg();
    let tx = 64.0 + WM_GAP - wm.x0;
    let full_w = (64.0 + WM_GAP + wm.width + 2.0).ceil();
    let logo = |emenda_fill: &str, pl_fill: &str| {
        format!(
            r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {full_w} 64" role="img" aria-label="emenda.pl"><title>emenda.pl</title>{MARK_BODY}<g transform="translate({tx:.2} 0)"><path fill="{emenda_fill}" d="{e}"/><path fill="{pl_fill}" d="{p}"/></g></svg>"#,
            e = wm.emenda,
            p = wm.pl
        )
    };
    let logo_light = logo(AZUL, VERDE);
    let mono = format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {full_w} 64" role="img" aria-label="emenda.pl"><title>emenda.pl</title><g fill="currentColor"><path fill-rule="evenodd" d="{MARK_MONO_D}"/><g transform="translate({tx:.2} 0)"><path d="{e}"/><path d="{p}"/></g></g></svg>"#,
        e = wm.emenda,
        p = wm.pl
    );
    let wm_w = (wm.width + 4.0).ceil();
    let wordmark_dark = format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {wm_w} 64" role="img" aria-label="emenda.pl"><title>emenda.pl</title><g transform="translate({:.2} 0)"><path fill="{BRANCO}" d="{}"/><path fill="{VERDE_DARK_BG}" d="{}"/></g></svg>"#,
        2.0 - wm.x0,
        wm.emenda,
        wm.pl
    );

    write("logo.svg", logo_light.as_bytes());
    write("logo-mark.svg", mark.as_bytes());
    write("logo-mono.svg", mono.as_bytes());
    write("wordmark-dark.svg", wordmark_dark.as_bytes());
    std::fs::write(format!("{public}/favicon.svg"), &mark).unwrap();

    let png = |svg: &str, w: u32, h: u32| og::render_png(svg, w, h).expect("png");
    write("favicon-32.png", &png(&mark, 32, 32));
    write("icon-192.png", &png(&mark, 192, 192));
    write("icon-512.png", &png(&mark, 512, 512));
    write("apple-touch-icon.png", &png(&bleed(0.86), 180, 180));
    // Maskable safe zone: content within the central 80% circle.
    write("maskable-512.png", &png(&bleed(0.66), 512, 512));

    let og_default = og::png(&og::OgCard::site_default()).expect("og");
    write("og-default.png", &og_default);
    std::fs::write(format!("{public}/og/default.png"), &og_default).unwrap();

    // Raw component data for apps/web/src/ui/brand/Logo.tsx.
    eprintln!(
        "WM_VIEWBOX_W={full_w} TX={tx:.2}\nEMENDA_D={}\nPL_D={}",
        wm.emenda, wm.pl
    );
}
