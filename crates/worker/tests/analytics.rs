use emenda_worker::analytics::*;
use std::collections::BTreeMap;

#[test]
fn tracking_rules() {
    let cases = [
        (None, Some("Mozilla/5.0 (X11; Linux) Firefox/130"), true),
        (Some("1"), Some("Mozilla/5.0 Firefox"), false),
        (Some("0"), Some("Mozilla/5.0 Firefox"), true),
        (None, Some("Googlebot/2.1"), false),
        (None, Some("facebookexternalhit/1.1"), false),
        (None, Some("curl/8.0"), false),
        (None, Some("Mozilla/5.0 HeadlessChrome/120"), false),
        (None, None, false),
        (None, Some(""), false),
    ];
    for (dnt, ua, want) in cases {
        assert_eq!(should_track(dnt, ua), want, "{dnt:?} {ua:?}");
    }
}

#[test]
fn cookies() {
    let v = vid_hex([0xab; 16]);
    assert_eq!(v, "ab".repeat(16));
    assert_eq!(
        cookie_vid(Some(&format!("a=1; ep_vid={v}; b=2"))),
        Some(v.clone())
    );
    assert_eq!(cookie_vid(Some("ep_vid=nothex")), None);
    assert_eq!(cookie_vid(None), None);
    let c = set_cookie(&v);
    for p in [
        "ep_vid=",
        "HttpOnly",
        "Secure",
        "SameSite=Lax",
        "Max-Age=31536000",
        "Path=/",
    ] {
        assert!(c.contains(p), "{p}");
    }
}

#[test]
fn hashing_never_raw_and_daily_salted() {
    let v = "ab".repeat(16);
    let a = visitor_hash(&v, "2026-10-28", "s");
    assert_eq!(a.len(), 32);
    assert!(!a.contains(&v));
    assert_eq!(a, visitor_hash(&v, "2026-10-28", "s"));
    assert_ne!(a, visitor_hash(&v, "2026-10-29", "s"));
}

#[test]
fn days() {
    assert_eq!(day_string(0.0), "1970-01-01");
    assert_eq!(day_string(1_793_145_600_000.0), "2026-10-28");
    assert_eq!(
        days_back("2026-03-01", 3),
        vec!["2026-02-27", "2026-02-28", "2026-03-01"]
    );
    assert_eq!(days_back("2024-03-01", 2), vec!["2024-02-29", "2024-03-01"]);
}

#[test]
fn recent_prunes() {
    let mut r = Recent::default();
    r.touch("a", 0);
    r.touch("b", 100_000);
    assert_eq!(r.online(), 2);
    r.touch("c", 301_000); // a expired (>5 min)
    assert_eq!(r.online(), 2);
    r.touch("b", 302_000);
    assert_eq!(r.online(), 2);
    r.prune(700_000);
    assert_eq!(r.online(), 0);
}

#[test]
fn aggregates() {
    let mut counts = BTreeMap::new();
    record_day(&mut counts, "2026-10-28");
    record_day(&mut counts, "2026-10-28");
    record_day(&mut counts, "2026-10-25");
    record_day(&mut counts, "2026-10-01");
    record_day(&mut counts, "2025-01-01");
    prune_counts(&mut counts, "2026-10-28", 400);
    assert!(!counts.contains_key("2025-01-01"));
    let s = aggregate(&counts, 9, 3, "2026-10-28");
    assert_eq!(
        (s.online, s.hoje, s.semana, s.mes, s.total),
        (3, 2, 3, 4, 9)
    );
    assert_eq!(s.serie.len(), 30);
    assert_eq!(s.serie[29], ("2026-10-28".to_string(), 2));
    assert_eq!(s.serie[0].0, "2026-09-29");
    let j = s.to_json();
    assert_eq!(j["serie"][29]["dia"], "2026-10-28");
    assert_eq!(j["serie"][29]["visitantes"], 2);
}

#[test]
fn recent_survives_storage_roundtrip() {
    // O Durable Object é despejado quando fica ocioso; a presença precisa ir para o storage.
    let mut r = Recent::default();
    r.touch("a", 1_000);
    r.touch("b", 2_000);
    let mut back = Recent::from_map(r.to_map());
    back.prune(200_000);
    assert_eq!(back.online(), 2);
}

#[test]
fn only_counts_hits_from_the_site_itself() {
    use emenda_worker::analytics::origem_do_site;
    // dev local, previews e testes automatizados repassam /api para produção: não contam
    for (origin, referer, ok) in [
        (Some("https://emenda.online"), None, true),
        (None, Some("https://emenda.online/uf/PE"), true),
        (None, Some("https://www.emenda.online/"), true),
        (None, Some("http://localhost:5197/comissao/x"), false),
        (Some("http://127.0.0.1:8787"), None, false),
        (
            None,
            Some("https://emenda-pl.kleejulia.workers.dev/"),
            false,
        ),
        (None, Some("https://emenda.online.evil.com/"), false),
        (None, None, false),
    ] {
        assert_eq!(
            origem_do_site(origin, referer),
            ok,
            "{origin:?} {referer:?}"
        );
    }
}
