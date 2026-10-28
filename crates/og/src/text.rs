//! Deterministic text metrics, wrapping and XML escaping.
//!
//! Widths come from the embedded fonts' advance widths (no shaping, no
//! kerning), so layout is identical on every platform and slightly
//! conservative versus the shaped result.

use std::sync::OnceLock;

use crate::fonts;

const ELLIPSIS: char = '…';

/// Escapes XML special chars and drops control characters.
pub fn escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            c if c.is_control() => {}
            c => out.push(c),
        }
    }
    out
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Font {
    Regular,
    SemiBold,
    /// Inter Bold (display optical size): money numerals.
    Figure,
    Bold,
}

impl Font {
    pub fn family(self) -> &'static str {
        match self {
            Font::Regular => fonts::FAMILY_REGULAR,
            Font::SemiBold => fonts::FAMILY_SEMIBOLD,
            Font::Figure => fonts::FAMILY_FIGURE,
            Font::Bold => fonts::FAMILY_BOLD,
        }
    }

    fn face(self) -> &'static ttf_parser::Face<'static> {
        static FACES: OnceLock<[ttf_parser::Face<'static>; 4]> = OnceLock::new();
        let faces = FACES.get_or_init(|| {
            [
                fonts::INTER_REGULAR,
                fonts::INTER_SEMIBOLD,
                fonts::INTER_BOLD,
                fonts::GROTESK_BOLD,
            ]
            .map(|data| ttf_parser::Face::parse(data, 0).expect("embedded font"))
        });
        &faces[self as usize]
    }
}

/// Advance width of `s` in px at `size`.
pub fn width(s: &str, font: Font, size: f32) -> f32 {
    let face = font.face();
    let fallback = face.glyph_index('?');
    let units: u32 = s
        .chars()
        .map(|c| {
            face.glyph_index(c)
                .or(fallback)
                .and_then(|g| face.glyph_hor_advance(g))
                .unwrap_or(0) as u32
        })
        .sum();
    units as f32 * size / face.units_per_em() as f32
}

/// Greedy word wrap into at most `max_lines`; overflow ends with `…`.
pub fn wrap(s: &str, font: Font, size: f32, max_w: f32, max_lines: usize) -> Vec<String> {
    wrap_full(s, font, size, max_w, max_lines).0
}

/// Picks the first (largest) size whose wrap needs no truncation; else the
/// last size, truncated.
pub fn fit(s: &str, font: Font, sizes: &[f32], max_w: f32, max_lines: usize) -> (f32, Vec<String>) {
    let mut last = (0.0, Vec::new());
    for &size in sizes {
        let (lines, truncated) = wrap_full(s, font, size, max_w, max_lines);
        if !truncated {
            return (size, lines);
        }
        last = (size, lines);
    }
    last
}

fn wrap_full(s: &str, font: Font, size: f32, max_w: f32, max_lines: usize) -> (Vec<String>, bool) {
    let fits = |t: &str| width(t, font, size) <= max_w;
    let mut lines: Vec<String> = Vec::new();
    let mut cur = String::new();
    for word in s.split_whitespace() {
        let candidate = if cur.is_empty() {
            word.to_string()
        } else {
            format!("{cur} {word}")
        };
        if fits(&candidate) {
            cur = candidate;
            continue;
        }
        if !cur.is_empty() {
            lines.push(std::mem::take(&mut cur));
        }
        // A word wider than the line is hard-broken by characters.
        for c in word.chars() {
            cur.push(c);
            if !fits(&cur) && cur.chars().count() > 1 {
                cur.pop();
                lines.push(std::mem::replace(&mut cur, c.to_string()));
            }
        }
    }
    if !cur.is_empty() {
        lines.push(cur);
    }
    if lines.len() <= max_lines {
        return (lines, false);
    }
    lines.truncate(max_lines);
    if let Some(last) = lines.last_mut() {
        *last = ellipsize(last, &fits);
    }
    (lines, true)
}

/// Drops whole words (then chars) until `line…` fits.
fn ellipsize(line: &str, fits: &dyn Fn(&str) -> bool) -> String {
    let mut words: Vec<&str> = line.split(' ').collect();
    loop {
        let base = words.join(" ");
        let base = base.trim_end_matches(|c: char| c.is_ascii_punctuation() || c == ' ');
        let candidate = format!("{base}{ELLIPSIS}");
        if fits(&candidate) {
            return candidate;
        }
        if words.len() > 1 {
            words.pop();
            continue;
        }
        let mut chars: Vec<char> = base.chars().collect();
        while !chars.is_empty() {
            chars.pop();
            let candidate: String = chars.iter().chain(std::iter::once(&ELLIPSIS)).collect();
            if fits(&candidate) {
                return candidate;
            }
        }
        return ELLIPSIS.to_string();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escape_table() {
        for (input, want) in [
            ("plain", "plain"),
            ("a & b", "a &amp; b"),
            ("<x>", "&lt;x&gt;"),
            ("\"q\" 'a'", "&quot;q&quot; &apos;a&apos;"),
            ("São Paulo · R$", "São Paulo · R$"),
            ("ctl\u{1}x", "ctlx"),
        ] {
            assert_eq!(escape(input), want, "{input:?}");
        }
    }

    #[test]
    fn width_is_monotonic_and_scales() {
        let a = width("emenda", Font::Bold, 40.0);
        assert!(a > 0.0);
        assert!(width("emendas", Font::Bold, 40.0) > a);
        assert!((width("emenda", Font::Bold, 80.0) - 2.0 * a).abs() < 0.01);
        assert!(width("WWW", Font::Regular, 20.0) > width("iii", Font::Regular, 20.0));
        assert_eq!(width("", Font::Regular, 20.0), 0.0);
    }

    #[test]
    fn wrap_table() {
        let one = width("aaaa", Font::Regular, 20.0);
        // max width fits exactly "aaaa bbbb" style lines of 2 words.
        let two = width("aaaa aaaa", Font::Regular, 20.0) + 0.5;
        for (input, max_w, lines, want) in [
            ("", two, 2, vec![]),
            ("aaaa", two, 2, vec!["aaaa"]),
            ("aaaa aaaa aaaa", two, 2, vec!["aaaa aaaa", "aaaa"]),
            ("  aaaa   aaaa  ", two, 2, vec!["aaaa aaaa"]),
            (
                "aaaa aaaa aaaa aaaa aaaa",
                two,
                2,
                vec!["aaaa aaaa", "aaaa…"],
            ),
            ("aaaaaaaaaaaa", one + 0.5, 3, vec!["aaaa", "aaaa", "aaaa"]),
            (
                "aaaa aaaa aaaa",
                width("aaa…", Font::Regular, 20.0) + 0.5,
                1,
                vec!["aaa…"],
            ),
        ] {
            let got = wrap(input, Font::Regular, 20.0, max_w, lines);
            assert_eq!(got, want, "{input:?}");
            for l in &got {
                assert!(width(l, Font::Regular, 20.0) <= max_w, "{l:?} overflows");
            }
        }
    }

    #[test]
    fn fit_prefers_largest_size_without_truncation() {
        let sizes = [80.0, 60.0, 40.0];
        let w = width("aaaa aaaa", Font::Bold, 60.0) + 1.0;
        assert_eq!(fit("aaaa", Font::Bold, &sizes, w, 1).0, 80.0);
        assert_eq!(
            fit("aaaa aaaa", Font::Bold, &sizes, w, 1),
            (60.0, vec!["aaaa aaaa".into()])
        );
        let (size, lines) = fit(&"aaaa ".repeat(40), Font::Bold, &sizes, w, 2);
        assert_eq!(size, 40.0);
        assert!(lines[1].ends_with('…'));
    }
}
