//! OG caching by versioned URL: version derivation, meta propagation, key normalization, headers.
use emenda_worker::cards::Kind;
use emenda_worker::meta;
use emenda_worker::ogcache::{self, Freshness};
use emenda_worker::route::Target;
use emenda_worker::seo::{Page, PageKind};
use serde_json::json;

const NOW: f64 = 1_793_221_200_000.0; // 2026-10-28T21:00:00Z = 18:00 em Brasília

#[test]
fn data_version_from_meta() {
    let m = json!({ "generatedAt": "2026-10-28T20:31:24Z" });
    assert_eq!(ogcache::data_version(Some(&m), NOW), "2026-10-28T20-31-24Z");
    assert_eq!(ogcache::data_version(None, NOW), "dia-2026-10-28");
    let bad = json!({ "generatedAt": "../../x y" });
    assert_eq!(ogcache::data_version(Some(&bad), NOW), "x-y");
}

#[test]
fn og_version_by_data_and_hour_for_agenda() {
    let rev = ogcache::RENDER_REV;
    assert_eq!(
        ogcache::og_version(Kind::Municipio, "D1", NOW),
        format!("{rev}-D1")
    );
    assert_eq!(
        ogcache::og_version(Kind::Agenda, "D1", NOW),
        format!("{rev}-agenda-2026-10-28T18")
    );
    assert_ne!(
        ogcache::og_version(Kind::Uf, "a", NOW),
        ogcache::og_version(Kind::Uf, "b", NOW)
    );
}

#[test]
fn version_propagates_into_meta_tags() {
    let t = Target {
        kind: Kind::Municipio,
        id: "2914505".into(),
    };
    let url = "https://emenda.online/og/municipio/2914505.png?v=2-D1";
    let m = meta::page_meta(
        &t,
        "https://emenda.online",
        "/municipio/2914505",
        None,
        Some("2-D1"),
    );
    assert_eq!(m.image, url);
    let html = meta::render(&m);
    assert!(html.contains(&format!(r#"<meta property="og:image" content="{url}">"#)));
    assert!(html.contains(&format!(r#"<meta name="twitter:image" content="{url}">"#)));
    let m = meta::page_meta(
        &t,
        "https://emenda.online",
        "/municipio/2914505",
        None,
        None,
    );
    assert_eq!(m.image, "https://emenda.online/og/municipio/2914505.png");
    // SEO pages.
    assert_eq!(
        emenda_worker::viral::og_url(&Page::new(PageKind::Pix, ""), Some("2-D1")),
        "/og/pagina/pix.png?v=2-D1"
    );
    assert_eq!(
        emenda_worker::viral::og_url(&Page::new(PageKind::Pix, ""), None),
        "/og/pagina/pix.png"
    );
}

#[test]
fn cache_key_is_path_plus_v_only() {
    let o = "https://emenda.online";
    assert_eq!(
        ogcache::request_version(Some("utm=x&v=2-D1&fbclid=y")).as_deref(),
        Some("2-D1")
    );
    for junk in [
        None,
        Some(""),
        Some("utm=1"),
        Some("v="),
        Some("v=a/b"),
        Some("v=<x>"),
    ] {
        assert_eq!(ogcache::request_version(junk), None, "{junk:?}");
    }
    assert_eq!(
        ogcache::cache_key(o, "/og/uf/BA.png", Some("2-D1")),
        "https://emenda.online/og/uf/BA.png?v=2-D1"
    );
    assert_eq!(
        ogcache::cache_key(o, "/og/uf/BA.png", None),
        "https://emenda.online/og/uf/BA.png"
    );
}

#[test]
fn headers_versioned_vs_unversioned() {
    use Freshness::*;
    assert_eq!(ogcache::freshness(Some("2-D1"), "2-D1", true), Versioned);
    assert_eq!(ogcache::freshness(Some("2-D0"), "2-D1", true), Unversioned);
    assert_eq!(ogcache::freshness(None, "2-D1", true), Unversioned);
    assert_eq!(ogcache::freshness(Some("2-D1"), "2-D1", false), Fallback);
    assert_eq!(
        ogcache::cache_control(Versioned),
        "public, max-age=31536000, immutable"
    );
    assert!(ogcache::cache_control(Unversioned).contains("stale-while-revalidate"));
    assert!(!ogcache::cache_control(Unversioned).contains("immutable"));
    assert!(!ogcache::cache_control(Fallback).contains("immutable"));
    let a = ogcache::etag("k1");
    assert_eq!(a, ogcache::etag("k1"));
    assert_ne!(a, ogcache::etag("k2"));
    assert!(a.starts_with('"') && a.ends_with('"'));
}
