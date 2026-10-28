//! HTML vs Markdown choice. Pure.
//!
//! Markdown when: `.md` path, `?formato=md`, `Accept: text/markdown`, a known AI agent/fetcher UA,
//! or a generic HTTP library that does not ask for `text/html`. Browsers and search crawlers
//! (Googlebot, Bingbot, ...) always get HTML unless they explicitly ask for Markdown.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Format {
    Html,
    Markdown,
}

/// AI agents, assistants and dataset crawlers (lowercase substrings).
pub const AI_AGENTS: [&str; 21] = [
    "gptbot",
    "chatgpt-user",
    "oai-searchbot",
    "claudebot",
    "claude-user",
    "claude-searchbot",
    "anthropic-ai",
    "perplexitybot",
    "perplexity-user",
    "google-extended",
    "ccbot",
    "bytespider",
    "applebot-extended",
    "cohere-ai",
    "meta-externalagent",
    "mistralai-user",
    "duckassistbot",
    "youbot",
    "amazonbot",
    "diffbot",
    "timpibot",
];

/// Generic HTTP libraries / CLIs (lowercase prefixes or substrings).
pub const FETCH_LIBS: [&str; 14] = [
    "curl/",
    "wget/",
    "python-requests",
    "python-urllib",
    "python-httpx",
    "aiohttp",
    "node-fetch",
    "undici",
    "go-http-client",
    "axios",
    "okhttp",
    "httpie",
    "libwww-perl",
    "deno/",
];

/// Search crawlers that must get HTML (with prerender).
const SEARCH_CRAWLERS: [&str; 8] = [
    "googlebot",
    "bingbot",
    "yandex",
    "duckduckbot",
    "baiduspider",
    "applebot/",
    "slurp",
    "google-inspectiontool",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Agent {
    Ai,
    FetchLib,
    SearchCrawler,
    Other,
}

pub fn classify(ua: &str) -> Agent {
    let ua = ua.to_ascii_lowercase();
    if AI_AGENTS.iter().any(|a| ua.contains(a)) {
        return Agent::Ai;
    }
    if SEARCH_CRAWLERS.iter().any(|a| ua.contains(a)) {
        return Agent::SearchCrawler;
    }
    if FETCH_LIBS.iter().any(|a| ua.contains(a)) {
        return Agent::FetchLib;
    }
    Agent::Other
}

fn accepts(accept: &str, mime: &str) -> bool {
    accept.split(',').any(|p| {
        let mut parts = p.split(';');
        let m = parts.next().unwrap_or("").trim();
        let q0 = parts.any(|x| {
            let x = x.trim().replace(' ', "");
            x == "q=0" || x == "q=0.0" || x == "q=0.00" || x == "q=0.000"
        });
        m.eq_ignore_ascii_case(mime) && !q0
    })
}

pub fn negotiate(
    md_path: bool,
    query: Option<&str>,
    accept: Option<&str>,
    ua: Option<&str>,
) -> Format {
    if md_path {
        return Format::Markdown;
    }
    match super::query_param(query, "formato") {
        Some("md" | "markdown") => return Format::Markdown,
        Some("html") => return Format::Html,
        _ => {}
    }
    let accept = accept.unwrap_or("");
    let wants_html = accepts(accept, "text/html");
    if accepts(accept, "text/markdown") {
        // Explicit Markdown wins unless HTML is listed first (browsers never send text/markdown).
        let md_pos = accept.to_ascii_lowercase().find("text/markdown");
        let html_pos = accept.to_ascii_lowercase().find("text/html");
        if !wants_html || md_pos < html_pos {
            return Format::Markdown;
        }
    }
    match classify(ua.unwrap_or("")) {
        Agent::Ai => Format::Markdown,
        Agent::FetchLib if !wants_html => Format::Markdown,
        _ => Format::Html,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use Format::*;

    const CHROME: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
    const BROWSER_ACCEPT: &str =
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,*/*;q=0.8";

    #[test]
    fn ua_table() {
        let cases: &[(&str, Option<&str>, Format)] = &[
            (CHROME, Some(BROWSER_ACCEPT), Html),
            ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1", None, Html),
            ("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", None, Html),
            ("Mozilla/5.0 (Linux; Android 6.0.1) Chrome/130 Mobile Safari/537.36 (compatible; Googlebot/2.1)", Some(BROWSER_ACCEPT), Html),
            ("Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)", None, Html),
            ("Mozilla/5.0 (Macintosh) AppleWebKit/605 (KHTML, like Gecko) Version/17 Safari/605 (Applebot/0.1)", None, Html),
            ("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)", None, Markdown),
            ("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0", Some(BROWSER_ACCEPT), Markdown),
            ("Mozilla/5.0 (compatible; OAI-SearchBot/1.0)", None, Markdown),
            ("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)", None, Markdown),
            ("ClaudeBot", None, Markdown),
            ("Claude-User/1.0", None, Markdown),
            ("Claude-SearchBot/1.0", None, Markdown),
            ("anthropic-ai", None, Markdown),
            ("Mozilla/5.0 (compatible; PerplexityBot/1.0)", None, Markdown),
            ("Perplexity-User/1.0", None, Markdown),
            ("Google-Extended", None, Markdown),
            ("CCBot/2.0 (https://commoncrawl.org/faq/)", None, Markdown),
            ("Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)", None, Markdown),
            ("Applebot-Extended/0.1", None, Markdown),
            ("cohere-ai", None, Markdown),
            ("meta-externalagent/1.1", None, Markdown),
            ("MistralAI-User/1.0", None, Markdown),
            ("DuckAssistBot/1.2", None, Markdown),
            ("Mozilla/5.0 (compatible; YouBot/1.0)", None, Markdown),
            ("Mozilla/5.0 (compatible; Amazonbot/0.1)", None, Markdown),
            ("curl/8.5.0", Some("*/*"), Markdown),
            ("curl/8.5.0", Some("text/html"), Html),
            ("Wget/1.21", None, Markdown),
            ("python-requests/2.32", Some("*/*"), Markdown),
            ("node-fetch/1.0", None, Markdown),
            ("undici", Some("*/*"), Markdown),
            ("Go-http-client/2.0", None, Markdown),
            ("axios/1.7.2", Some("application/json, text/plain, */*"), Markdown),
            ("", None, Html),
        ];
        for (ua, accept, want) in cases {
            assert_eq!(negotiate(false, None, *accept, Some(ua)), *want, "{ua}");
        }
    }

    #[test]
    fn explicit_signals() {
        assert_eq!(
            negotiate(true, None, Some(BROWSER_ACCEPT), Some(CHROME)),
            Markdown
        );
        assert_eq!(
            negotiate(false, Some("formato=md"), None, Some(CHROME)),
            Markdown
        );
        assert_eq!(
            negotiate(false, Some("a=1&formato=md"), None, Some(CHROME)),
            Markdown
        );
        assert_eq!(
            negotiate(false, Some("formato=html"), None, Some("ClaudeBot")),
            Html
        );
        assert_eq!(
            negotiate(false, None, Some("text/markdown"), Some(CHROME)),
            Markdown
        );
        assert_eq!(
            negotiate(false, None, Some("text/markdown, text/html;q=0.9"), None),
            Markdown
        );
        assert_eq!(
            negotiate(false, None, Some("text/markdown;q=0"), Some(CHROME)),
            Html
        );
        assert_eq!(
            negotiate(false, None, Some(BROWSER_ACCEPT), Some(CHROME)),
            Html
        );
    }
}
