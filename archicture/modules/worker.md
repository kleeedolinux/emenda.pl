# worker (crates/worker, package `emenda-worker`)

Cloudflare Worker in Rust (workers-rs, `worker-build`). Config: `apps/worker/wrangler.toml`.
The package is `emenda-worker` because `-p worker` would be ambiguous with the `worker` SDK crate.

Pure modules, tested natively with `cargo test -p emenda-worker`: `route` (routing, URL map, TTL, cache key, headers, upstream status),
`api` (public API routing/canonical key/envelope/ETag/limits), `api::map` (upstream -> API shapes),
`meta` (HTML escaping and og block injection), `money` (centavos -> "R$ 32,4 mi"), `cards` (OG content), `analytics`.
The wasm glue is in `src/glue.rs` and `src/glue_api.rs` (`cfg(target_arch = "wasm32")`).

## Routes (GET/HEAD; OPTIONS -> CORS 204; other methods -> 405)

| Path | Target | Edge TTL |
|---|---|---|
| `/api/camara/deputados*`, `/api/camara/partidos*` | dadosabertos.camara.leg.br/api/v2 | 12h |
| `/api/camara/{proposicoes,votacoes}/:id` | same | 1h |
| `/api/camara/*` (other) | same | 10 min |
| `/api/senado/*` | legis.senado.leg.br/dadosabertos (Accept json) | 6h |
| `/api/ibge/*` | servicodados.ibge.gov.br/api | 30d |
| `/data/*` | `DATA_BASE_URL` + rest; if empty -> ASSETS `/data/*`; `.json` is always served as JSON | 6h |
| `/og/default.png`, `/og/<kind>/<id>.png` | `og::png` card; any failure -> default card | 1d |
| `/deputado/:id` … `/partido/:sigla`, `/` | `index.html` with `<!-- og:start -->…<!-- og:end -->` replaced | 5 min |
| `/assets/*` | static, `immutable` | 1y |
| host `cdn.*`, `/cdn/*` | asset mirror, branch `assets` (`src/cdn.rs`, see `assets.md`) | 30d |
| `/api/health` | `{ok, version}` | no-store |
| `POST /api/hit` | analytics beacon, 204 | no-store |
| `GET /api/stats` | analytics aggregate | 30s |

Cache-Control: `public, max-age=min(ttl,3600), s-maxage=ttl, stale-while-revalidate=86400`.
The Cache API key is the URL with its query sorted. Only 200s are cached. Header: `x-emenda-cache: HIT|MISS`.
Upstream 4xx -> same status + upstream body, not cached (data 404 -> `{error}` 404). 5xx/redirect/unreachable -> 502 `{error}`. Path segments must match `[A-Za-z0-9._,-]`, with no `..` and no empty segment. Query length <= 512.

## Analytics (audiência pública/anônima)

- Cookie `ep_vid`: 128-bit random hex; HttpOnly, Secure, SameSite=Lax, 1 year. Not set when `DNT: 1` or the UA looks like a bot.
- One Durable Object `Analytics` (name `global`). Stores `v:{day}:{sha256(vid|day|ANALYTICS_SALT)[..32]}` for the current day only
  (the previous day is deleted on rollover), `counts {day: distinct}` (kept 400 days) and `total`. Online = in-memory map, 5 min window.
- `hoje` = today's distinct visitors. `semana`/`mes` = sum of daily distinct visitors (the daily salt prevents linking across days).
  `total` = number of cookies issued. No IPs or raw ids are stored.

## Public API `/v1` (`src/api`, `src/glue_api.rs`)

Scope: host `api.*` -> API (`/` = index; non-`/v1` -> 404 JSON); any host -> `/v1*`. Hosts: `emenda.online` site, `api.emenda.online` API (custom domains in `wrangler.toml`).
GET/HEAD; OPTIONS 204; others 405. Body `{data, meta:{fonte[], atualizado, licenca, docs}}`; errors `{error, status, docs}`. CORS `*`.

| Path | Source | Edge TTL |
|---|---|---|
| `/v1` | static index | 24h |
| `/v1/meta`, `/v1/pix[/{ano}]`, `/v1/feed[/{YYYYMM}]`, `/v1/abertas` | data `v1/<name>.json` (raw, wrapped) | 6h |
| `/v1/brasil`, `/v1/ufs/{UF}`, `/v1/municipios/{ibge}`, `/v1/autores/{codigo}` | data `v1/{brasil,uf,municipio,autor}` | 12h |
| `/v1/ufs` | `brasil.json` `porUf` | 12h |
| `/v1/autores?q&limit&offset` | `autores.json` filtered (q: código or name key) | 12h |
| `/v1/deputados[/{id}]` | Câmara + `autores.json` by `chave_nome` | 12h |
| `/v1/senadores[/{codigo}]` | Senado + `autores.json` by `chave_nome` | 12h |
| `/v1/proposicoes/{id}` | Câmara proposição + autores | 1h |
| `/v1/votacoes/{id}` | Câmara votação + votos + orientações | 1h |

- Cache key: request origin + `Endpoint::canonical()` (unknown params dropped, known sorted, `q` normalized).
- Cache-Control: `public, max-age=min(ttl,300), s-maxage=ttl, stale-while-revalidate=86400, stale-if-error=86400`. Upstream 404 cached 5 min; 5xx `no-store`.
- ETag: SHA-256[..16] of body; `If-None-Match` -> 304.
- Order: parse (400/404, no upstream) -> cache -> `API_RL` (300/60s per `CF-Connecting-IP`, hits too) -> on miss `API_RL_MISS` (60/10s) -> upstream.
- 429: `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining: 0`. Binding missing -> fail open.
- Caps: query <= 512, `q` <= 64 chars, `limit` 1..=500 (default 50), `offset` <= 10000.
- Docs page: `apps/web/src/pages/ApiDocsPage.tsx` (`/api`).

## SEO / AI (`src/seo`, glue `src/seo/glue_seo.rs`)

Dispatched in `glue.rs` before `route::route` (after the `/v1` scope). GET/HEAD only.

| Path | Output | Edge TTL |
|---|---|---|
| page routes (`/`, `/uf/:uf`, `/municipio/:ibge`, … see `seo::route`) | `index.html` + head block + JSON-LD + prerender in `#root`, or Markdown | `seo::ttl` (5 min–6h) |
| `<page>.md`, `/index.md` | Markdown | same |
| `/llms.txt`, `/llms-full.txt` | text/plain | 1d |
| `/sitemap.xml`, `/sitemaps/{paginas,ufs,municipios,autores,parlamentares,proposicoes,entenda}.xml` | XML | 1d |

- Flow: `seo::route` -> `pages::sources` (index 0 = `v1/meta.json`) -> parallel fetch, 3.5s timeout each -> `pages::build` -> `head`/`prerender` or `markdown`.
- Markdown when: `.md`, `?formato=md`, `Accept: text/markdown`, AI UA (`negotiate::AI_AGENTS`), or HTTP lib UA without `text/html`. Browsers and search crawlers get HTML.
- Cache key: canonical URL + `__seo=html|md` + `__v=<sha256(index.html)[..12]>`. Incomplete docs (a source failed) are not cached; 404 data -> status 404 + `noindex`.
- Canonical and absolute links always use `https://emenda.online`. Catalog (`catalog.rs`) mirrors `temas.ts`/`pautas.ts`; tests fail if they drift.
